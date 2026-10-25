"use client";

// State for the scorer screen.
//
// Every tap is applied on the phone straight away (the engine runs locally), then saved in the
// background through the BallQueue. Choices that only affect the NEXT ball (swap strike, a new
// bowler, the innings-2 openers) are kept as a "pick" tied to the current ball number, so they
// reset themselves as soon as that ball is recorded.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ballChip, computeState, isLegal, totalRuns, validateNext, type BallEvent, type MatchConfig, type MatchState } from "@/engine";
import { newId } from "@/lib/apiClient";
import { BallQueue, type SyncStatus } from "@/lib/scorer/ballQueue";
import { ballPhrase, getVoiceSetting, setVoiceSetting, speak, undoPhrase, type VoiceSetting } from "@/lib/scorer/voice";

export interface BallInput {
  runsBat?: number;
  extraType?: BallEvent["extraType"];
  extraRuns?: number;
  wicket?: BallEvent["wicket"];
}

interface Pick {
  /** The pick applies to the ball after this seq only. */
  forSeq: number;
  swap?: boolean;
  bowler?: string;
  striker?: string;
  nonStriker?: string | null;
}

export interface NextBall {
  striker: string | null;
  nonStriker: string | null;
  bowler: string | null;
  /** What the scorer must choose before the next ball can be recorded. */
  needs: null | "innings-start" | "bowler";
}

interface Options {
  matchId: string;
  token: string;
  config: MatchConfig;
  initialBalls: BallEvent[];
}

/** A friendly message for a failed request: the browser's own "Failed to fetch" means no network. */
function networkMessage(e: unknown, action: string): string {
  if (e instanceof TypeError || (typeof navigator !== "undefined" && !navigator.onLine)) {
    return `You're offline. ${action} needs the internet; try again when you're back online.`;
  }
  return e instanceof Error ? e.message : `Could not ${action.toLowerCase()}.`;
}

export function useScorer({ matchId, token, config: initialConfig, initialBalls }: Options) {
  const [config, setConfig] = useState<MatchConfig>(initialConfig);
  const [balls, setBalls] = useState<BallEvent[]>(initialBalls);
  const [pick, setPick] = useState<Pick | null>(null);
  // "Checking…" until the queue has looked for unsent balls, so the badge never claims "Saved" too early.
  const [sync, setSync] = useState<SyncStatus>({ kind: "sending", count: 0 });
  const [notice, setNotice] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [voice, setVoiceState] = useState<VoiceSetting>("en");
  const queueRef = useRef<BallQueue | null>(null);
  const ballsRef = useRef(balls);
  ballsRef.current = balls;

  const state: MatchState = useMemo(() => computeState(config, balls), [config, balls]);

  const nameOf = useMemo(() => {
    const names = new Map([...config.teamA.players, ...config.teamB.players].map((p) => [p.id, p.name]));
    return (id: string) => names.get(id) ?? "Unknown";
  }, [config]);

  /** Reload every ball from the server (after the server refused a ball, or an undo clash). */
  const reload = useCallback(async () => {
    try {
      const res = await fetch(`/api/balls?matchId=${matchId}`);
      const data = (await res.json()) as { balls?: BallEvent[]; error?: string };
      if (!res.ok || !data.balls) throw new Error(data.error ?? "Could not reload.");
      setBalls(data.balls);
      setPick(null);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not reload the match.");
    }
  }, [matchId]);

  // Start the queue once. Balls saved on this phone but not yet sent (e.g. the page was closed
  // while offline) are added back on top of what the server has.
  useEffect(() => {
    setVoiceState(getVoiceSetting());
    const queue = new BallQueue({
      matchId,
      token,
      onStatus: setSync,
      onRejected: (message) => {
        setNotice(`${message} Showing the latest saved score.`);
        void reload();
      },
    });
    const serverLast = initialBalls.at(-1)?.seq ?? 0;
    queue.dropUpTo(serverLast);
    const unsent = queue.pending().map((q) => q.ball);
    if (unsent.length) setBalls([...initialBalls, ...unsent]);
    queueRef.current = queue;
    queue.start();
    return () => queue.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, token]);

  // Keep the screen on while scoring.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    const request = () => nav.wakeLock?.request("screen").then((l) => (lock = l)).catch(() => {});
    void request();
    const onVisible = () => document.visibilityState === "visible" && void request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release();
    };
  }, []);

  // Toasts disappear after 3 seconds.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const activePick = pick && pick.forSeq === state.lastSeq ? pick : null;

  const next: NextBall = useMemo(() => {
    let striker = activePick?.striker ?? state.striker?.playerId ?? null;
    let nonStriker = activePick?.nonStriker !== undefined ? activePick.nonStriker : (state.nonStriker?.playerId ?? null);
    if (activePick?.swap && nonStriker) [striker, nonStriker] = [nonStriker, striker];
    const bowler = activePick?.bowler ?? (state.needsNewBowler ? null : (state.bowler?.playerId ?? null));

    let needs: NextBall["needs"] = null;
    if (state.status === "finished") needs = null;
    else if (!striker) needs = "innings-start";
    else if (!bowler) needs = "bowler";
    return { striker, nonStriker, bowler, needs };
  }, [activePick, state]);

  /** Records one ball. Returns the error message if the ball isn't allowed. */
  const record = useCallback(
    (input: BallInput): string | null => {
      if (state.status === "finished") return "The match is over.";
      if (!next.striker || !next.bowler) return "Pick the batters and bowler first.";
      const ball: BallEvent = {
        seq: state.lastSeq + 1,
        innings: state.innings,
        striker: next.striker,
        nonStriker: next.nonStriker,
        bowler: next.bowler,
        runsBat: input.runsBat ?? 0,
        extraRuns: input.extraRuns ?? 0,
      };
      if (input.extraType) ball.extraType = input.extraType;
      if (input.wicket) ball.wicket = input.wicket;

      const check = validateNext(config, ballsRef.current, ball);
      if (!check.ok) {
        setNotice(check.error);
        return check.error;
      }
      navigator.vibrate?.(15);
      setNotice(null);
      setBalls((prev) => [...prev, ball]);
      setPick(null);
      queueRef.current?.add({ clientId: newId(), ball });

      const endsOver = isLegal(ball) && (state.score.legalBalls + 1) % 6 === 0;
      const overRuns = endsOver ? state.thisOver.reduce((sum, c) => sum + c.runs, 0) + totalRuns(ball) : undefined;
      speak(ballPhrase(ball, nameOf, voice, overRuns), voice);
      return null;
    },
    [config, next, state, nameOf, voice],
  );

  /**
   * Undo the last ball. A ball still waiting on the phone is simply dropped; a ball the server
   * already has is deleted there (only after every waiting ball has been sent, so they can't race).
   */
  const undo = useCallback(async () => {
    const last = ballsRef.current.at(-1);
    const queue = queueRef.current;
    if (!last || !queue || busy) return;
    setNotice(null);

    const describe = (b: BallEvent) => {
      const chip = ballChip(b);
      return chip.kind === "dot" ? "dot ball" : chip.label;
    };
    const local = queue.pending().at(-1);
    if (local && local.ball.seq === last.seq && queue.removeLast()) {
      setBalls((prev) => prev.slice(0, -1));
    } else {
      setBusy(true);
      try {
        await queue.whenIdle();
        const res = await fetch("/api/balls/undo", {
          method: "POST",
          headers: { "content-type": "application/json", "x-scoring-token": token },
          body: JSON.stringify({ matchId, seq: last.seq }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          setNotice(data.error ?? "Could not undo.");
          if (res.status === 409) await reload();
          return;
        }
        setBalls((prev) => (prev.at(-1)?.seq === last.seq ? prev.slice(0, -1) : prev));
      } catch (e) {
        setNotice(networkMessage(e, "Undoing a saved ball"));
        return;
      } finally {
        setBusy(false);
      }
    }
    setPick(null);
    navigator.vibrate?.([10, 40, 10]);
    setToast(`Ball undone: ${describe(last)}`);
    speak(undoPhrase(voice), voice);
  }, [busy, matchId, reload, token, voice]);

  /** End the current innings early. Needs the network; waiting balls are sent first. */
  const endInnings = useCallback(async (): Promise<boolean> => {
    const queue = queueRef.current;
    if (!queue || busy) return false;
    setBusy(true);
    try {
      await queue.whenIdle();
      const res = await fetch(`/api/matches/${matchId}/end-innings`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-scoring-token": token },
        body: JSON.stringify({ innings: state.innings }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setNotice(data.error ?? "Could not end the innings.");
        return false;
      }
      setConfig((c) => ({ ...c, endedInnings: [...new Set([...(c.endedInnings ?? []), state.innings])] }));
      setPick(null);
      setToast(`Innings ${state.innings} ended`);
      return true;
    } catch (e) {
      setNotice(networkMessage(e, "Ending the innings"));
      return false;
    } finally {
      setBusy(false);
    }
  }, [busy, matchId, state.innings, token]);

  const changeVoice = useCallback((v: VoiceSetting) => {
    setVoiceSetting(v);
    setVoiceState(v);
    if (v !== "off") speak(v === "hi" ? "आवाज़ चालू" : "Voice on", v);
  }, []);

  const swapStrike = useCallback(() => {
    setPick((p) => {
      const base = p && p.forSeq === state.lastSeq ? p : { forSeq: state.lastSeq };
      return { ...base, swap: !base.swap };
    });
  }, [state.lastSeq]);

  const chooseBowler = useCallback(
    (bowler: string) => {
      setPick((p) => ({ ...(p && p.forSeq === state.lastSeq ? p : {}), forSeq: state.lastSeq, bowler }));
    },
    [state.lastSeq],
  );

  const startInnings = useCallback(
    (striker: string, nonStriker: string, bowler: string) => {
      setPick({ forSeq: state.lastSeq, striker, nonStriker, bowler });
    },
    [state.lastSeq],
  );

  return {
    config,
    state,
    balls,
    next,
    nameOf,
    sync,
    notice,
    setNotice,
    toast,
    busy,
    voice,
    record,
    undo,
    endInnings,
    changeVoice,
    swapStrike,
    chooseBowler,
    startInnings,
    reload,
  };
}
