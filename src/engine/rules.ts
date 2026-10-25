// Cricket rules for a single ball. Each function is small and pure so it can be tested on its own.

import type { BallChip, BallEvent, MatchConfig, TeamConfig, WicketType } from "./types";

export const BALLS_PER_OVER = 6;

/** Wides and no balls are not legal deliveries: they don't count toward the over. */
export function isLegal(ball: BallEvent): boolean {
  return ball.extraType !== "wide" && ball.extraType !== "noball";
}

/** 1-run penalty for a wide or no ball. */
export function penaltyRuns(ball: BallEvent): number {
  return ball.extraType === "wide" || ball.extraType === "noball" ? 1 : 0;
}

/** Everything added to the team total by this ball. */
export function totalRuns(ball: BallEvent): number {
  return ball.runsBat + ball.extraRuns + penaltyRuns(ball);
}

/**
 * Runs charged to the bowler: runs off the bat, wides, and no-ball penalties.
 * Byes and leg byes (including byes off a no ball) are not the bowler's fault.
 */
export function bowlerRuns(ball: BallEvent): number {
  if (ball.extraType === "wide") return 1 + ball.extraRuns;
  if (ball.extraType === "noball") return 1 + ball.runsBat;
  if (ball.extraType === "bye" || ball.extraType === "legbye") return 0;
  return ball.runsBat;
}

/** A wide is not a ball faced by the batter; everything else is (including no balls). */
export function batterFacedBall(ball: BallEvent): boolean {
  return ball.extraType !== "wide";
}

/** Runs the batters ran or scored, which decide whether they swap ends. Penalty runs don't count. */
export function completedRuns(ball: BallEvent): number {
  return ball.runsBat + ball.extraRuns;
}

/** Batters cross on an odd number of runs (1, 3, 5). */
export function shouldSwapStrike(ball: BallEvent): boolean {
  return completedRuns(ball) % 2 === 1;
}

/** Dismissals credited to the bowler (run out and retired are not). */
export function isBowlerWicket(type: WicketType): boolean {
  return type !== "runout" && type !== "retired";
}

/**
 * Wickets needed to bowl out this batting side. Sides can be different sizes in local cricket,
 * so it depends on the batting team's own number of players, not on the other side.
 */
export function maxWickets(config: MatchConfig, battingTeam: TeamConfig): number {
  const players = battingTeam.players.length;
  return config.lastManStands ? players : players - 1;
}

/** 20 legal balls → "3.2" */
export function formatOvers(legalBalls: number): string {
  return `${Math.floor(legalBalls / BALLS_PER_OVER)}.${legalBalls % BALLS_PER_OVER}`;
}

/**
 * Free hit: the ball after a no ball. It carries over if the free-hit ball is itself a wide or no ball.
 * Returns whether the NEXT ball is a free hit.
 */
export function nextIsFreeHit(currentIsFreeHit: boolean, ball: BallEvent): boolean {
  if (ball.extraType === "noball") return true;
  if (currentIsFreeHit && ball.extraType === "wide") return true;
  return false;
}

/** Which dismissals are possible on this kind of ball. */
export function allowedWickets(ball: BallEvent, freeHit: boolean): WicketType[] {
  if (ball.extraType === "noball") return ["runout", "retired"];
  if (ball.extraType === "wide") return freeHit ? ["runout", "retired"] : ["stumped", "runout", "hitwicket", "retired"];
  if (freeHit) return ["runout", "retired"];
  return ["bowled", "caught", "lbw", "runout", "stumped", "hitwicket", "retired"];
}

/** The chip shown in "This over" for a ball. */
export function ballChip(ball: BallEvent): BallChip {
  const runs = totalRuns(ball);
  const base = { seq: ball.seq, runs };

  if (ball.wicket) {
    const extra = runs > 0 ? `+${runs}` : "";
    return { ...base, label: `W${extra}`, kind: "wicket" };
  }
  switch (ball.extraType) {
    case "wide":
      return { ...base, label: ball.extraRuns ? `Wd+${ball.extraRuns}` : "Wd", kind: "extra" };
    case "noball": {
      const more = ball.runsBat + ball.extraRuns;
      return { ...base, label: more ? `Nb+${more}` : "Nb", kind: "extra" };
    }
    case "bye":
      return { ...base, label: `${ball.extraRuns}B`, kind: "extra" };
    case "legbye":
      return { ...base, label: `${ball.extraRuns}Lb`, kind: "extra" };
  }
  if (ball.runsBat === 0) return { ...base, label: "•", kind: "dot" };
  if (ball.runsBat === 4) return { ...base, label: "4", kind: "four" };
  if (ball.runsBat === 6) return { ...base, label: "6", kind: "six" };
  return { ...base, label: String(ball.runsBat), kind: "run" };
}

/** Scorecard text for a dismissal, e.g. "c Amit b Ravi". */
export function dismissalText(
  wicket: NonNullable<BallEvent["wicket"]>,
  bowlerId: string,
  nameOf: (id: string) => string,
): string {
  const bowlerName = nameOf(bowlerId);
  const fielder = wicket.fielder ? nameOf(wicket.fielder) : "";
  switch (wicket.type) {
    case "bowled":
      return `b ${bowlerName}`;
    case "caught":
      if (!wicket.fielder || wicket.fielder === bowlerId) return `c & b ${bowlerName}`;
      return `c ${fielder} b ${bowlerName}`;
    case "lbw":
      return `lbw b ${bowlerName}`;
    case "runout":
      return fielder ? `run out (${fielder})` : "run out";
    case "stumped":
      return fielder ? `st ${fielder} b ${bowlerName}` : `st b ${bowlerName}`;
    case "hitwicket":
      return `hit wicket b ${bowlerName}`;
    case "retired":
      return "retired";
  }
}
