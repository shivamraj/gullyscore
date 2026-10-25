// Types shared by the scoring engine, the app and (later) the chat agent.
// The engine is pure TypeScript: no React, no database, no network.

export type ExtraType = "wide" | "noball" | "bye" | "legbye";

export type WicketType =
  | "bowled"
  | "caught"
  | "lbw"
  | "runout"
  | "stumped"
  | "hitwicket"
  | "retired";

export interface Player {
  id: string;
  name: string;
}

export interface TeamConfig {
  id: string;
  name: string;
  shortCode: string;
  /** Players playing today. */
  players: Player[];
  /** Player ids in batting order. */
  battingOrder: string[];
}

/** Who starts an innings. Chosen at match setup (innings 1) and at the innings break (innings 2). */
export interface InningsOpeners {
  striker: string;
  nonStriker: string;
  bowler: string;
}

export interface MatchConfig {
  /** Overs per innings, e.g. 20 for T20 or 8 for a short local match. */
  overs: number;
  /** Players per side (11 by default; local matches often have fewer). */
  playersPerSide: number;
  /** If true, the last batter can bat alone, so a side is all out only when every batter is out. */
  lastManStands: boolean;
  teamA: TeamConfig;
  teamB: TeamConfig;
  /** Team id of the side batting first (decided by the toss). */
  battingFirst: string;
  /** Openers for innings 1 and 2, if already chosen. */
  openers?: [InningsOpeners?, InningsOpeners?];
  /** Innings the scorer closed early with "End innings" (e.g. rain, or a side declares short). */
  endedInnings?: (1 | 2)[];
}

/**
 * One delivery, exactly as the scorer recorded it. This is the single source of truth:
 * everything else is calculated from the list of balls.
 *
 * How runs are recorded:
 * - Runs off the bat go in `runsBat` (0–6).
 * - Wide: the 1-run penalty is automatic; `extraRuns` = extra wides run or a boundary (Wide + 2 → extraRuns 2).
 * - No ball: the 1-run penalty is automatic; runs off the bat go in `runsBat`, byes off a no ball in `extraRuns`.
 * - Bye / leg bye: the runs go in `extraRuns`, `runsBat` is 0.
 */
export interface BallEvent {
  /** 1, 2, 3 … across the whole match. */
  seq: number;
  innings: 1 | 2;
  striker: string;
  /** null only when the last batter bats alone (last man stands). */
  nonStriker: string | null;
  bowler: string;
  runsBat: number;
  extraType?: ExtraType;
  extraRuns: number;
  wicket?: {
    type: WicketType;
    playerOut: string;
    /** Catcher, run-out fielder or wicketkeeper. */
    fielder?: string;
    /** New batter replacing the player out (missing when the innings is over). */
    incoming?: string;
  };
}

export type BallChipKind = "dot" | "run" | "four" | "six" | "extra" | "wicket";

/** A ball as shown in the "This over" row, e.g. "4", "Wd", "W". */
export interface BallChip {
  seq: number;
  label: string;
  kind: BallChipKind;
  runs: number;
}

export interface OverSummary {
  /** 1-based over number. */
  number: number;
  bowler: string;
  chips: BallChip[];
  runs: number;
  wickets: number;
}

export interface BatterLine {
  playerId: string;
  name: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  strikeRate: number;
  out: boolean;
  /** e.g. "c Amit b Ravi", or "not out". */
  howOut: string;
}

export interface BowlerLine {
  playerId: string;
  name: string;
  legalBalls: number;
  /** e.g. "3.2" */
  overs: string;
  maidens: number;
  runs: number;
  wickets: number;
  economy: number;
  wides: number;
  noballs: number;
}

export interface FallOfWicket {
  wicket: number;
  runs: number;
  overs: string;
  playerId: string;
  name: string;
}

export interface Extras {
  wides: number;
  noballs: number;
  byes: number;
  legbyes: number;
  total: number;
}

export interface InningsState {
  number: 1 | 2;
  battingTeam: string;
  bowlingTeam: string;
  runs: number;
  wickets: number;
  legalBalls: number;
  overs: string;
  /** Batters in the order they came in. */
  batting: BatterLine[];
  /** Bowlers in the order they first bowled. */
  bowling: BowlerLine[];
  extras: Extras;
  fallOfWickets: FallOfWicket[];
  oversHistory: OverSummary[];
  complete: boolean;
}

export type MatchStatus = "upcoming" | "live" | "innings_break" | "finished";

export interface MatchState {
  status: MatchStatus;
  /** The innings in play, or the one just finished during the break. */
  innings: 1 | 2;
  inningsList: InningsState[];

  /** Shortcuts for the innings in play. */
  score: { runs: number; wickets: number; legalBalls: number; overs: string };
  target?: number;
  runsNeeded?: number;
  ballsLeft?: number;
  crr: number;
  rrr?: number;
  projected: number;

  /** Batters at the crease after the last ball (striker is on strike for the next ball). */
  striker: BatterLine | null;
  nonStriker: BatterLine | null;
  /** Bowler of the last ball, or the opening bowler before the first ball. */
  bowler: BowlerLine | null;
  /** True after an over ends: the scorer must pick a new bowler. */
  needsNewBowler: boolean;
  /** Bowler of the last completed over (cannot bowl the next one). */
  lastOverBowler: string | null;

  thisOver: BallChip[];
  lastOver: OverSummary | null;
  partnership: { runs: number; balls: number };
  freeHit: boolean;
  yetToBat: Player[];
  nextBatter: Player | null;

  result?: string;
  winner?: string;
  lastSeq: number;
}
