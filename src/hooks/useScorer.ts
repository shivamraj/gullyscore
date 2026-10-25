"use client";

// State for the scorer screen.
//
// Every tap is applied on the phone straight away (the engine runs locally), then saved in the
// background through the BallQueue. Choices that only affect the NEXT ball (swap strike, a new
// bowler, the innings-2 openers) are kept as a "pick" tied to the current ball number, so they
// reset themselves as soon as that ball is recorded.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { computeState, validateNext, type BallEvent, type MatchConfig, type MatchState } from "@/engine";
import { newId } from "@/lib/apiClient";
import { BallQueue, type SyncStatus } from "@/lib/scorer/ballQueue";

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

export function useScorer({ matchId, token, config, initialBalls }: Options) {
  const [balls, setBalls] = useState<BallEvent[]>(initialBalls);
  const [pick, setPick] = useState<Pick | null>(null);
  const [sync, setSync] = useState<SyncStatus>({ kind: "saved" });
  const [notice, setNotice] = useState<string | null>(null);
  const queueRef = useRef<BallQueue | null>(null);
  const ballsRef = useRef(balls);
  ballsRef.current = balls;

  const state: MatchState = useMemo(() => computeState(config, balls), [config, balls]);

  /** Reload every ball from the server (after the server refused a ball). */
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
      return null;
    },
    [config, next, state],
  );

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

  return { state, balls, next, sync, notice, setNotice, record, swapStrike, chooseBowler, startInnings, reload, queueRef };
}
