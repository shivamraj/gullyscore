// Turns "the state changed" into "what just happened", so the viewer can show one short
// animation and play one sound for it (FX-01, FX-03).
//
// Pure functions only: compare the state before and after an update. Undo never triggers an
// event. If several balls arrive at once (the viewer was offline), only the latest one counts.

import type { BallChip, BatterLine, MatchState } from "@/engine";

export type FxKind = "run" | "four" | "six" | "wicket" | "extra" | "fifty" | "hundred" | "over" | "innings" | "result";

export interface FxEvent {
  kind: FxKind;
  /** Big text, e.g. "SIX!" or "+2". */
  title: string;
  /** Small line under it, e.g. "Rahul · 46 (21)". */
  detail?: string;
  /** Team whose colour the animation uses. */
  teamId?: string;
  /** The ball that caused it, so the same event is never shown twice. */
  seq: number;
}

/** Which sound goes with which event. Runs and over-ends are animation only. */
export const SOUND_FOR: Partial<Record<FxKind, "four" | "six" | "wicket" | "extra" | "milestone" | "innings" | "result">> = {
  four: "four",
  six: "six",
  wicket: "wicket",
  extra: "extra",
  fifty: "milestone",
  hundred: "milestone",
  innings: "innings",
  result: "result",
};

/** Events big enough for confetti. */
export const CELEBRATE: ReadonlySet<FxKind> = new Set(["six", "fifty", "hundred", "result"]);

function findChip(state: MatchState): { chip: BallChip; endedOver: boolean } | null {
  const inThisOver = state.thisOver.find((c) => c.seq === state.lastSeq);
  if (inThisOver) return { chip: inThisOver, endedOver: false };
  const inLastOver = state.lastOver?.chips.find((c) => c.seq === state.lastSeq);
  if (inLastOver) return { chip: inLastOver, endedOver: state.thisOver.length === 0 };
  return null;
}

const figures = (b: BatterLine) => `${b.runs} (${b.balls})`;

function extraTitle(label: string, freeHit: boolean): string {
  if (label.startsWith("Wd")) return "WIDE";
  if (label.startsWith("Nb")) return freeHit ? "NO BALL · FREE HIT" : "NO BALL";
  if (label.endsWith("Lb")) return "LEG BYES";
  return "BYES";
}

export function detectEvent(prev: MatchState, next: MatchState): FxEvent | null {
  // Match and innings endings first: they can happen with or without a new ball
  // (the scorer can end an innings from the menu).
  if (next.status === "finished" && prev.status !== "finished") {
    return { kind: "result", title: "RESULT", detail: next.result, teamId: next.winner, seq: next.lastSeq };
  }
  if (next.status === "innings_break" && prev.status !== "innings_break") {
    const done = next.inningsList[0];
    return {
      kind: "innings",
      title: "INNINGS BREAK",
      detail: next.target !== undefined ? `Target ${next.target}` : undefined,
      teamId: done?.battingTeam,
      seq: next.lastSeq,
    };
  }

  // Undo, a repeat of the same update, or no ball yet: nothing to celebrate.
  if (next.lastSeq <= prev.lastSeq) return null;
  const found = findChip(next);
  if (!found) return null;
  const { chip, endedOver } = found;

  const index = next.innings - 1;
  const innings = next.inningsList[index];
  if (!innings) return null;
  const before = new Map((prev.inningsList[index]?.batting ?? []).map((b) => [b.playerId, b]));
  const base = { teamId: innings.battingTeam, seq: next.lastSeq };

  // Milestones beat everything else on that ball.
  for (const b of innings.batting) {
    const was = before.get(b.playerId)?.runs ?? 0;
    if (b.runs >= 100 && was < 100) return { ...base, kind: "hundred", title: "HUNDRED!", detail: `${b.name} · ${figures(b)}` };
    if (b.runs >= 50 && was < 50) return { ...base, kind: "fifty", title: "FIFTY!", detail: `${b.name} · ${figures(b)}` };
  }

  const out = innings.batting.find((b) => b.out && !before.get(b.playerId)?.out);
  if (out) return { ...base, kind: "wicket", title: "WICKET!", detail: `${out.name} ${out.howOut} · ${figures(out)}`, teamId: innings.bowlingTeam };

  // Who scored off the bat on this ball (also catches a four or six off a no ball).
  let hitter: BatterLine | undefined;
  let hit = 0;
  for (const b of innings.batting) {
    const gained = b.runs - (before.get(b.playerId)?.runs ?? 0);
    if (gained > hit) {
      hit = gained;
      hitter = b;
    }
  }
  const who = hitter ? `${hitter.name} · ${figures(hitter)}` : undefined;
  const freeHitNote = next.freeHit ? " · FREE HIT next" : "";

  if (chip.kind === "six" || hit === 6) return { ...base, kind: "six", title: "SIX!", detail: (who ?? "") + freeHitNote || undefined };
  if (chip.kind === "four" || hit === 4) return { ...base, kind: "four", title: "FOUR!", detail: (who ?? "") + freeHitNote || undefined };
  if (chip.kind === "extra") return { ...base, kind: "extra", title: extraTitle(chip.label, next.freeHit), detail: `+${chip.runs} run${chip.runs === 1 ? "" : "s"}` };

  if (endedOver && next.status === "live" && next.lastOver) {
    const o = next.lastOver;
    return { ...base, kind: "over", title: `END OF OVER ${o.number}`, detail: `${o.runs} run${o.runs === 1 ? "" : "s"}${o.wickets ? `, ${o.wickets} wkt` : ""} · ${next.score.runs}/${next.score.wickets}` };
  }
  if (chip.kind === "run") return { ...base, kind: "run", title: `+${chip.runs}`, detail: who };
  return null; // dot ball
}

/** How many different viewers are in a Supabase presence state (one entry per open tab). */
export function countViewers(presence: Record<string, { role?: string }[]>): number {
  return Object.values(presence).filter((metas) => metas.some((m) => m.role === "viewer")).length;
}
