// The scoring engine: replays the list of balls into the full match state.
//
// computeState(config, balls) is a pure function: the same balls always give the same state.
// That makes undo trivial (drop the last ball and recompute) and keeps the scorer's phone,
// the server and every viewer in exact agreement.

import {
  BALLS_PER_OVER,
  allowedWickets,
  ballChip,
  batterFacedBall,
  bowlerRuns,
  dismissalText,
  formatOvers,
  isBowlerWicket,
  isLegal,
  maxWickets,
  nextIsFreeHit,
  shouldSwapStrike,
  totalRuns,
} from "./rules";
import { economy, projectedScore, requiredRate, resultText, runRate, strikeRate } from "./stats";
import type {
  BallChip,
  BallEvent,
  BatterLine,
  BowlerLine,
  Extras,
  FallOfWicket,
  InningsOpeners,
  InningsState,
  MatchConfig,
  MatchState,
  MatchStatus,
  OverSummary,
  Player,
  TeamConfig,
} from "./types";

// ---------- running totals while replaying ----------

interface BatterAcc {
  id: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  out: boolean;
  howOut: string;
}

interface BowlerAcc {
  id: string;
  legalBalls: number;
  runs: number;
  wickets: number;
  wides: number;
  noballs: number;
  maidens: number;
}

interface OverAcc {
  number: number;
  bowler: string;
  chips: BallChip[];
  runs: number;
  wickets: number;
  bowlerRuns: number;
}

interface InningsAcc {
  number: 1 | 2;
  battingTeam: TeamConfig;
  bowlingTeam: TeamConfig;
  target?: number;
  runs: number;
  wickets: number;
  legalBalls: number;
  batters: Map<string, BatterAcc>;
  bowlers: Map<string, BowlerAcc>;
  extras: Extras;
  fallOfWickets: { wicket: number; runs: number; legalBalls: number; playerId: string }[];
  oversHistory: OverAcc[];
  currentOver: OverAcc | null;
  striker: string | null;
  nonStriker: string | null;
  currentBowler: string | null;
  lastOverBowler: string | null;
  needsNewBowler: boolean;
  partnership: { runs: number; balls: number };
  freeHit: boolean;
  ballCount: number;
  complete: boolean;
}

function teamById(config: MatchConfig, id: string): TeamConfig {
  if (config.teamA.id === id) return config.teamA;
  if (config.teamB.id === id) return config.teamB;
  throw new Error(`Unknown team id: ${id}`);
}

function otherTeam(config: MatchConfig, id: string): TeamConfig {
  return config.teamA.id === id ? config.teamB : config.teamA;
}

function makeNameOf(config: MatchConfig): (id: string) => string {
  const names = new Map<string, string>();
  for (const p of [...config.teamA.players, ...config.teamB.players]) names.set(p.id, p.name);
  return (id) => names.get(id) ?? id;
}

function ensureBatter(inn: InningsAcc, id: string): BatterAcc {
  let b = inn.batters.get(id);
  if (!b) {
    b = { id, runs: 0, balls: 0, fours: 0, sixes: 0, out: false, howOut: "not out" };
    inn.batters.set(id, b);
  }
  return b;
}

function ensureBowler(inn: InningsAcc, id: string): BowlerAcc {
  let b = inn.bowlers.get(id);
  if (!b) {
    b = { id, legalBalls: 0, runs: 0, wickets: 0, wides: 0, noballs: 0, maidens: 0 };
    inn.bowlers.set(id, b);
  }
  return b;
}

function startInnings(
  config: MatchConfig,
  number: 1 | 2,
  openers: InningsOpeners | undefined,
  target?: number,
): InningsAcc {
  const firstId = config.battingFirst;
  const battingTeam = number === 1 ? teamById(config, firstId) : otherTeam(config, firstId);
  const bowlingTeam = otherTeam(config, battingTeam.id);
  const inn: InningsAcc = {
    number,
    battingTeam,
    bowlingTeam,
    target,
    runs: 0,
    wickets: 0,
    legalBalls: 0,
    batters: new Map(),
    bowlers: new Map(),
    extras: { wides: 0, noballs: 0, byes: 0, legbyes: 0, total: 0 },
    fallOfWickets: [],
    oversHistory: [],
    currentOver: null,
    striker: null,
    nonStriker: null,
    currentBowler: null,
    lastOverBowler: null,
    needsNewBowler: false,
    partnership: { runs: 0, balls: 0 },
    freeHit: false,
    ballCount: 0,
    complete: false,
  };
  if (openers) {
    inn.striker = openers.striker;
    inn.nonStriker = openers.nonStriker;
    inn.currentBowler = openers.bowler;
    ensureBatter(inn, openers.striker);
    ensureBatter(inn, openers.nonStriker);
  }
  return inn;
}

function isInningsOver(config: MatchConfig, inn: InningsAcc): boolean {
  if (inn.wickets >= maxWickets(config, inn.battingTeam)) return true;
  if (inn.legalBalls >= config.overs * BALLS_PER_OVER) return true;
  if (inn.target !== undefined && inn.runs >= inn.target) return true;
  if (inn.striker === null && inn.nonStriker === null && inn.ballCount > 0) return true;
  return false;
}

function closeCurrentOver(inn: InningsAcc, completedSix: boolean): void {
  const over = inn.currentOver;
  if (!over) return;
  inn.oversHistory.push(over);
  if (completedSix && over.bowlerRuns === 0) ensureBowler(inn, over.bowler).maidens += 1;
  inn.currentOver = null;
}

function applyBall(config: MatchConfig, inn: InningsAcc, ball: BallEvent, nameOf: (id: string) => string): void {
  inn.ballCount += 1;
  inn.needsNewBowler = false;

  // The recorded ball is the truth for who was batting and bowling
  // (this is how manual strike swaps and bowler changes are honoured).
  inn.striker = ball.striker;
  inn.nonStriker = ball.nonStriker;
  inn.currentBowler = ball.bowler;
  const striker = ensureBatter(inn, ball.striker);
  if (ball.nonStriker) ensureBatter(inn, ball.nonStriker);
  const bowler = ensureBowler(inn, ball.bowler);

  if (!inn.currentOver) {
    inn.currentOver = {
      number: Math.floor(inn.legalBalls / BALLS_PER_OVER) + 1,
      bowler: ball.bowler,
      chips: [],
      runs: 0,
      wickets: 0,
      bowlerRuns: 0,
    };
  }
  const over = inn.currentOver;
  const runs = totalRuns(ball);
  const legal = isLegal(ball);

  // Team
  inn.runs += runs;
  if (legal) inn.legalBalls += 1;
  inn.partnership.runs += runs;
  if (legal) inn.partnership.balls += 1;

  // Batter
  striker.runs += ball.runsBat;
  if (batterFacedBall(ball)) striker.balls += 1;
  if (ball.runsBat === 4) striker.fours += 1;
  if (ball.runsBat === 6) striker.sixes += 1;

  // Bowler
  const conceded = bowlerRuns(ball);
  bowler.runs += conceded;
  if (legal) bowler.legalBalls += 1;
  if (ball.extraType === "wide") bowler.wides += 1;
  if (ball.extraType === "noball") bowler.noballs += 1;

  // Extras
  const ex = inn.extras;
  if (ball.extraType === "wide") ex.wides += 1 + ball.extraRuns;
  if (ball.extraType === "noball") {
    ex.noballs += 1;
    ex.byes += ball.extraRuns;
  }
  if (ball.extraType === "bye") ex.byes += ball.extraRuns;
  if (ball.extraType === "legbye") ex.legbyes += ball.extraRuns;
  ex.total = ex.wides + ex.noballs + ex.byes + ex.legbyes;

  // Over
  over.chips.push(ballChip(ball));
  over.runs += runs;
  over.bowlerRuns += conceded;

  // Free hit for the next ball
  inn.freeHit = nextIsFreeHit(inn.freeHit, ball);

  // Batters cross on odd runs
  if (shouldSwapStrike(ball) && inn.nonStriker !== null) {
    [inn.striker, inn.nonStriker] = [inn.nonStriker, inn.striker];
  }

  // Wicket
  if (ball.wicket) {
    const w = ball.wicket;
    inn.wickets += 1;
    over.wickets += 1;
    const out = ensureBatter(inn, w.playerOut);
    out.out = true;
    out.howOut = dismissalText(w, ball.bowler, nameOf);
    if (isBowlerWicket(w.type)) bowler.wickets += 1;
    inn.fallOfWickets.push({ wicket: inn.wickets, runs: inn.runs, legalBalls: inn.legalBalls, playerId: w.playerOut });
    inn.partnership = { runs: 0, balls: 0 };

    // The new batter takes the place of the player out.
    const incoming = w.incoming ?? null;
    if (incoming) ensureBatter(inn, incoming);
    if (inn.striker === w.playerOut) inn.striker = incoming;
    else if (inn.nonStriker === w.playerOut) inn.nonStriker = incoming;
    if (inn.striker === null && inn.nonStriker !== null) {
      inn.striker = inn.nonStriker;
      inn.nonStriker = null;
    }
  }

  // End of over: batters change ends, a new bowler is needed.
  if (legal && inn.legalBalls % BALLS_PER_OVER === 0) {
    closeCurrentOver(inn, true);
    inn.lastOverBowler = ball.bowler;
    if (inn.nonStriker !== null) [inn.striker, inn.nonStriker] = [inn.nonStriker, inn.striker];
    inn.needsNewBowler = true;
  }

  if (isInningsOver(config, inn)) {
    inn.complete = true;
    closeCurrentOver(inn, false);
    inn.needsNewBowler = false;
  }
}

// ---------- converting running totals to the public state ----------

function toBatterLine(b: BatterAcc, nameOf: (id: string) => string): BatterLine {
  return {
    playerId: b.id,
    name: nameOf(b.id),
    runs: b.runs,
    balls: b.balls,
    fours: b.fours,
    sixes: b.sixes,
    strikeRate: strikeRate(b.runs, b.balls),
    out: b.out,
    howOut: b.howOut,
  };
}

function toBowlerLine(b: BowlerAcc, nameOf: (id: string) => string): BowlerLine {
  return {
    playerId: b.id,
    name: nameOf(b.id),
    legalBalls: b.legalBalls,
    overs: formatOvers(b.legalBalls),
    maidens: b.maidens,
    runs: b.runs,
    wickets: b.wickets,
    economy: economy(b.runs, b.legalBalls),
    wides: b.wides,
    noballs: b.noballs,
  };
}

function toOverSummary(o: OverAcc): OverSummary {
  return { number: o.number, bowler: o.bowler, chips: o.chips, runs: o.runs, wickets: o.wickets };
}

function toInningsState(inn: InningsAcc, nameOf: (id: string) => string): InningsState {
  const fallOfWickets: FallOfWicket[] = inn.fallOfWickets.map((f) => ({
    wicket: f.wicket,
    runs: f.runs,
    overs: formatOvers(f.legalBalls),
    playerId: f.playerId,
    name: nameOf(f.playerId),
  }));
  return {
    number: inn.number,
    battingTeam: inn.battingTeam.id,
    bowlingTeam: inn.bowlingTeam.id,
    runs: inn.runs,
    wickets: inn.wickets,
    legalBalls: inn.legalBalls,
    overs: formatOvers(inn.legalBalls),
    batting: [...inn.batters.values()].map((b) => toBatterLine(b, nameOf)),
    bowling: [...inn.bowlers.values()].map((b) => toBowlerLine(b, nameOf)),
    extras: { ...inn.extras },
    fallOfWickets,
    oversHistory: inn.oversHistory.map(toOverSummary),
    complete: inn.complete,
  };
}

function yetToBat(inn: InningsAcc): Player[] {
  const team = inn.battingTeam;
  const order = [...team.battingOrder, ...team.players.map((p) => p.id).filter((id) => !team.battingOrder.includes(id))];
  const byId = new Map(team.players.map((p) => [p.id, p]));
  return order
    .filter((id) => !inn.batters.has(id))
    .map((id) => byId.get(id))
    .filter((p): p is Player => p !== undefined);
}

function replay(config: MatchConfig, balls: BallEvent[]) {
  const nameOf = makeNameOf(config);
  const sorted = [...balls].sort((a, b) => a.seq - b.seq);
  const innings: InningsAcc[] = [startInnings(config, 1, config.openers?.[0])];

  const startSecond = () => {
    const first = innings[0]!;
    first.complete = true;
    closeCurrentOver(first, false);
    first.needsNewBowler = false;
    innings.push(startInnings(config, 2, config.openers?.[1], first.runs + 1));
  };

  for (const ball of sorted) {
    if (ball.innings === 2 && innings.length === 1) startSecond();
    const inn = innings[ball.innings - 1];
    if (!inn) throw new Error(`Ball ${ball.seq} is for innings ${ball.innings}, which has not started.`);
    applyBall(config, inn, ball, nameOf);
  }

  // Innings 1 ended (all out, overs done, or closed by the scorer) → set up innings 2.
  const endedEarly = config.endedInnings?.includes(1) ?? false;
  if (innings.length === 1 && (innings[0]!.complete || endedEarly)) startSecond();
  if (innings.length === 2 && (config.endedInnings?.includes(2) ?? false)) {
    const second = innings[1]!;
    second.complete = true;
    closeCurrentOver(second, false);
    second.needsNewBowler = false;
  }

  return { innings, sorted, nameOf };
}

/** The full match state after the given balls. */
export function computeState(config: MatchConfig, balls: BallEvent[]): MatchState {
  const { innings, sorted, nameOf } = replay(config, balls);
  const cur = innings[innings.length - 1]!;
  const ballsInCur = sorted.filter((b) => b.innings === cur.number).length;

  let status: MatchStatus;
  if (sorted.length === 0 && innings.length === 1) status = "upcoming";
  else if (cur.number === 2 && cur.complete) status = "finished";
  else if (cur.number === 2 && ballsInCur === 0) status = "innings_break";
  else status = "live";

  const ballsLeft = Math.max(config.overs * BALLS_PER_OVER - cur.legalBalls, 0);
  const target = cur.target;
  const runsNeeded = target !== undefined ? Math.max(target - cur.runs, 0) : undefined;

  let result: string | undefined;
  let winner: string | undefined;
  if (status === "finished") {
    const first = innings[0]!;
    const r = resultText({
      firstTeamName: first.battingTeam.name,
      secondTeamName: cur.battingTeam.name,
      firstRuns: first.runs,
      secondRuns: cur.runs,
      secondWickets: cur.wickets,
      secondLegalBalls: cur.legalBalls,
      maxWickets: maxWickets(config, cur.battingTeam),
      totalOvers: config.overs,
    });
    result = r.text;
    winner = r.winner === "first" ? first.battingTeam.id : r.winner === "second" ? cur.battingTeam.id : undefined;
  }

  const lineFor = (id: string | null) => {
    if (!id) return null;
    const b = cur.batters.get(id);
    return b ? toBatterLine(b, nameOf) : null;
  };
  const bowlerAcc = cur.currentBowler ? cur.bowlers.get(cur.currentBowler) : undefined;
  const bowler: BowlerLine | null = cur.currentBowler
    ? toBowlerLine(bowlerAcc ?? { id: cur.currentBowler, legalBalls: 0, runs: 0, wickets: 0, wides: 0, noballs: 0, maidens: 0 }, nameOf)
    : null;

  const ytb = yetToBat(cur);
  const chasing = cur.number === 2 && status === "live";

  return {
    status,
    innings: cur.number,
    inningsList: innings.map((i) => toInningsState(i, nameOf)),
    score: { runs: cur.runs, wickets: cur.wickets, legalBalls: cur.legalBalls, overs: formatOvers(cur.legalBalls) },
    target,
    runsNeeded,
    ballsLeft: target !== undefined ? ballsLeft : undefined,
    crr: runRate(cur.runs, cur.legalBalls),
    rrr: chasing && runsNeeded !== undefined ? requiredRate(runsNeeded, ballsLeft) : undefined,
    projected: projectedScore(cur.runs, cur.legalBalls, config.overs),
    striker: cur.complete ? null : lineFor(cur.striker),
    nonStriker: cur.complete ? null : lineFor(cur.nonStriker),
    bowler,
    needsNewBowler: cur.needsNewBowler,
    lastOverBowler: cur.lastOverBowler,
    thisOver: cur.currentOver ? cur.currentOver.chips : [],
    lastOver: cur.oversHistory.length ? toOverSummary(cur.oversHistory[cur.oversHistory.length - 1]!) : null,
    partnership: { ...cur.partnership },
    freeHit: cur.freeHit && !cur.complete,
    yetToBat: ytb,
    nextBatter: ytb[0] ?? null,
    result,
    winner,
    lastSeq: sorted.length ? sorted[sorted.length - 1]!.seq : 0,
  };
}

export type ValidationResult = { ok: true } | { ok: false; error: string };

/**
 * Checks a new ball against the match so far, before it is saved.
 * Runs on the scorer's phone (to block mistakes) and on the server (the trusted check).
 */
export function validateNext(config: MatchConfig, balls: BallEvent[], ball: BallEvent): ValidationResult {
  const fail = (error: string): ValidationResult => ({ ok: false, error });
  const state = computeState(config, balls);
  const { innings, nameOf } = replay(config, balls);
  const cur = innings[innings.length - 1]!;

  if (state.status === "finished") return fail("The match is already finished.");
  if (ball.innings !== cur.number) return fail(`This ball should be in innings ${cur.number}.`);
  if (ball.seq !== state.lastSeq + 1) return fail(`Expected ball number ${state.lastSeq + 1}, got ${ball.seq}.`);

  // Players
  const batting = new Set(cur.battingTeam.players.map((p) => p.id));
  const bowling = new Set(cur.bowlingTeam.players.map((p) => p.id));
  if (!batting.has(ball.striker)) return fail("The striker is not in the batting team.");
  if (ball.nonStriker !== null && !batting.has(ball.nonStriker)) return fail("The non-striker is not in the batting team.");
  if (ball.nonStriker === ball.striker) return fail("Striker and non-striker must be different players.");
  if (ball.nonStriker === null && !config.lastManStands) return fail("A non-striker is required.");
  if (!bowling.has(ball.bowler)) return fail("The bowler is not in the bowling team.");
  for (const id of [ball.striker, ball.nonStriker]) {
    if (id && cur.batters.get(id)?.out) return fail(`${nameOf(id)} is already out.`);
  }

  // A bowler can't bowl two overs in a row.
  const startingNewOver = cur.currentOver === null && cur.legalBalls > 0;
  if (startingNewOver && ball.bowler === cur.lastOverBowler) {
    return fail(`${nameOf(ball.bowler)} bowled the last over. Pick a different bowler.`);
  }

  // Runs
  const okRuns = (n: number) => Number.isInteger(n) && n >= 0 && n <= 7;
  if (!okRuns(ball.runsBat) || !okRuns(ball.extraRuns)) return fail("Runs must be a whole number from 0 to 7.");
  if ((ball.extraType === "bye" || ball.extraType === "legbye") && (ball.runsBat !== 0 || ball.extraRuns < 1)) {
    return fail("Byes and leg byes need at least 1 run and no runs off the bat.");
  }
  if (ball.extraType === "wide" && ball.runsBat !== 0) return fail("A wide can't have runs off the bat.");
  if (!ball.extraType && ball.extraRuns !== 0) return fail("Extra runs need an extra type.");

  // Wicket
  if (ball.wicket) {
    const w = ball.wicket;
    if (!allowedWickets(ball, state.freeHit).includes(w.type)) {
      return fail(state.freeHit && !ball.extraType ? "Only a run out is possible on a free hit." : `A ${w.type} is not possible on this ball.`);
    }
    if (w.playerOut !== ball.striker && w.playerOut !== ball.nonStriker) return fail("The player out must be one of the two batters.");
    if (w.type !== "runout" && w.type !== "retired" && w.playerOut !== ball.striker) {
      return fail("Only the striker can be out this way.");
    }
    if (w.fielder && !bowling.has(w.fielder)) return fail("The fielder must be in the bowling team.");

    const remaining = state.yetToBat.map((p) => p.id);
    const inningsEndsByWickets = cur.wickets + 1 >= maxWickets(config, cur.battingTeam);
    const endsByOvers = isLegal(ball) && cur.legalBalls + 1 >= config.overs * BALLS_PER_OVER;
    const endsByTarget = cur.target !== undefined && cur.runs + totalRuns(ball) >= cur.target;
    const needIncoming = remaining.length > 0 && !inningsEndsByWickets && !endsByOvers && !endsByTarget;
    if (needIncoming && !w.incoming) return fail("Pick the incoming batter.");
    if (w.incoming && !remaining.includes(w.incoming)) return fail("The incoming batter has already batted.");
  }

  return { ok: true };
}
