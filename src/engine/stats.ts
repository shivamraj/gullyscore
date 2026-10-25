// Rates and result text. Pure number helpers, rounded to 2 decimals for display.

import { BALLS_PER_OVER } from "./rules";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Runs per over. 0 before any legal ball. */
export function runRate(runs: number, legalBalls: number): number {
  if (legalBalls === 0) return 0;
  return round2((runs * BALLS_PER_OVER) / legalBalls);
}

/** Runs per over needed to reach the target. undefined when no balls are left. */
export function requiredRate(runsNeeded: number, ballsLeft: number): number | undefined {
  if (ballsLeft <= 0) return undefined;
  return round2((Math.max(runsNeeded, 0) * BALLS_PER_OVER) / ballsLeft);
}

/** Runs per 100 balls. */
export function strikeRate(runs: number, balls: number): number {
  if (balls === 0) return 0;
  return round2((runs * 100) / balls);
}

/** Runs conceded per over. */
export function economy(runs: number, legalBalls: number): number {
  return runRate(runs, legalBalls);
}

/** Score at the end of the innings if the current run rate continues. */
export function projectedScore(runs: number, legalBalls: number, totalOvers: number): number {
  if (legalBalls === 0) return 0;
  const ballsLeft = Math.max(totalOvers * BALLS_PER_OVER - legalBalls, 0);
  return Math.round(runs + (runs / legalBalls) * ballsLeft);
}

export interface ResultInput {
  firstTeamName: string;
  secondTeamName: string;
  firstRuns: number;
  secondRuns: number;
  secondWickets: number;
  secondLegalBalls: number;
  maxWickets: number;
  totalOvers: number;
}

/** "Riverside XI won by 12 runs", "Hilltop Strikers won by 4 wickets (5 balls left)" or "Match tied". */
export function resultText(r: ResultInput): { text: string; winner: "first" | "second" | "tie" } {
  if (r.secondRuns > r.firstRuns) {
    const wicketsLeft = r.maxWickets - r.secondWickets;
    const ballsLeft = r.totalOvers * BALLS_PER_OVER - r.secondLegalBalls;
    const w = `${wicketsLeft} wicket${wicketsLeft === 1 ? "" : "s"}`;
    const b = ballsLeft > 0 ? ` (${ballsLeft} ball${ballsLeft === 1 ? "" : "s"} left)` : "";
    return { text: `${r.secondTeamName} won by ${w}${b}`, winner: "second" };
  }
  if (r.secondRuns === r.firstRuns) {
    return { text: "Match tied", winner: "tie" };
  }
  const margin = r.firstRuns - r.secondRuns;
  return { text: `${r.firstTeamName} won by ${margin} run${margin === 1 ? "" : "s"}`, winner: "first" };
}
