// The match, as the Ask agent sees it.
//
// Everything here is calculated from the same data the scoreboard uses: the match config, the
// engine's live state, and every ball. The AI never reads the database directly and never makes
// up numbers: it gets a snapshot with every question, and asks the tools (tools.ts) for more.

import { ballChip, isLegal, type BallEvent, type BatterLine, type BowlerLine, type MatchState } from "@/engine";

export interface AgentTeam {
  id: string;
  name: string;
  shortCode: string;
  players: { id: string; name: string }[];
}

export interface AgentContext {
  state: MatchState;
  title: string;
  venue?: string | null;
  overs: number;
  tossLine: string;
  teams: AgentTeam[];
  /** Every ball so far, oldest first. */
  balls: BallEvent[];
}

/** One delivery with everything a question could need. */
export interface TimelineBall {
  innings: 1 | 2;
  /** Cricket notation: "2.4" = 3rd over, 4th ball. A wide or no ball shares the next ball's number. */
  ball: string;
  /** 1-based over number ("over 3" = balls 2.1 to 2.6). */
  over: number;
  batter: string;
  non_striker: string | null;
  bowler: string;
  /** As on the scoreboard: •, 1, 4, 6, W, Wd, Nb+4, 2B, 1Lb … */
  result: string;
  runs_off_bat: number;
  extra: { type: "wide" | "noball" | "bye" | "legbye"; runs: number } | null;
  total_runs: number;
  /** For wickets: who was out, the type, how (scorecard text), and the fielder (the bowler for caught & bowled). */
  wicket: { out: string; type: string; how: string; fielder: string | null } | null;
  legal: boolean;
  /** Batting team's score after this ball, e.g. "45/2". */
  score_after: string;
}

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N} ]/gu, "").replace(/\s+/g, " ").trim();

export function nameOf(ctx: AgentContext, id: string | null | undefined): string {
  if (!id) return "";
  return ctx.teams.flatMap((t) => t.players).find((p) => p.id === id)?.name ?? "Unknown player";
}

export function teamOf(ctx: AgentContext, id: string): AgentTeam | undefined {
  return ctx.teams.find((t) => t.id === id);
}

/** Every ball, oldest first, with over numbers and the running score. */
export function timeline(ctx: AgentContext): TimelineBall[] {
  const legal: Record<number, number> = { 1: 0, 2: 0 };
  const runs: Record<number, number> = { 1: 0, 2: 0 };
  const wkts: Record<number, number> = { 1: 0, 2: 0 };
  return [...ctx.balls]
    .sort((a, b) => a.seq - b.seq)
    .map((b) => {
      const done = legal[b.innings]!;
      const isLegalBall = isLegal(b);
      if (isLegalBall) legal[b.innings] = done + 1;
      const chip = ballChip(b);
      runs[b.innings] = runs[b.innings]! + chip.runs;
      if (b.wicket && b.wicket.type !== "retired") wkts[b.innings] = wkts[b.innings]! + 1;
      const card = ctx.state.inningsList[b.innings - 1];
      const outLine = b.wicket ? card?.batting.find((x) => x.playerId === b.wicket!.playerOut) : undefined;
      return {
        innings: b.innings,
        ball: `${Math.floor(done / 6)}.${(done % 6) + 1}`,
        over: Math.floor(done / 6) + 1,
        batter: nameOf(ctx, b.striker),
        non_striker: b.nonStriker ? nameOf(ctx, b.nonStriker) : null,
        bowler: nameOf(ctx, b.bowler),
        result: chip.label,
        runs_off_bat: b.runsBat,
        extra: b.extraType ? { type: b.extraType, runs: chip.runs - b.runsBat } : null,
        total_runs: chip.runs,
        wicket: b.wicket
          ? {
              out: nameOf(ctx, b.wicket.playerOut),
              type: b.wicket.type,
              how: outLine?.howOut ?? b.wicket.type,
              fielder: b.wicket.fielder ? nameOf(ctx, b.wicket.fielder) : b.wicket.type === "caught" ? nameOf(ctx, b.bowler) : null,
            }
          : null,
        legal: isLegalBall,
        score_after: `${runs[b.innings]}/${wkts[b.innings]}`,
      };
    });
}

/**
 * Finds a player by a name as a viewer might type it: any case, part of the name, or a small
 * spelling slip ("rahul", "Sharma", "Rohitt"). Returns every close match so the agent can ask
 * which one was meant when two players fit.
 */
export function findPlayers(ctx: AgentContext, query: string): { id: string; name: string; team: string }[] {
  const q = norm(query);
  if (!q) return [];
  const all = ctx.teams.flatMap((t) => t.players.map((p) => ({ ...p, team: t.name, n: norm(p.name) })));
  const exact = all.filter((p) => p.n === q);
  if (exact.length) return exact.map(({ n: _n, ...p }) => p);
  const words = q.split(" ");
  const partial = all.filter((p) => words.every((w) => p.n.split(" ").some((pw) => pw.startsWith(w))) || p.n.includes(q));
  if (partial.length) return partial.map(({ n: _n, ...p }) => p);
  const close = all.filter((p) => p.n.split(" ").some((pw) => words.some((w) => w.length >= 4 && editDistance(pw, w) <= 1)));
  return close.map(({ n: _n, ...p }) => p);
}

function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length]![b.length]!;
}

export const batterLine = (b: BatterLine | null) =>
  b && { name: b.name, runs: b.runs, balls: b.balls, fours: b.fours, sixes: b.sixes, strike_rate: b.strikeRate, status: b.out ? b.howOut : "not out" };

export const bowlerLine = (b: BowlerLine | null) =>
  b && { name: b.name, overs: b.overs, maidens: b.maidens, runs: b.runs, wickets: b.wickets, economy: b.economy, wides: b.wides, no_balls: b.noballs };

/**
 * The live picture, sent with every question so the common ones ("score?", "who's batting?",
 * "how many needed?") need no tool call at all.
 */
export function snapshot(ctx: AgentContext) {
  const s = ctx.state;
  const last = timeline(ctx).at(-1);
  return {
    match: ctx.title,
    venue: ctx.venue ?? null,
    teams: ctx.teams.map((t) => t.name),
    overs_per_innings: ctx.overs,
    toss: ctx.tossLine,
    status: s.status,
    result: s.result ?? null,
    innings: s.inningsList
      .filter((i) => i.legalBalls > 0 || i.runs > 0 || i.number === s.innings)
      .map((i) => ({ innings: i.number, batting: teamOf(ctx, i.battingTeam)?.name, score: `${i.runs}/${i.wickets}`, overs: i.overs, complete: i.complete })),
    now:
      s.status === "upcoming"
        ? null
        : {
            innings: s.innings,
            batting: teamOf(ctx, s.inningsList[s.innings - 1]?.battingTeam ?? "")?.name ?? null,
            score: `${s.score.runs}/${s.score.wickets}`,
            overs: s.score.overs,
            target: s.target ?? null,
            runs_needed: s.runsNeeded ?? null,
            balls_left: s.ballsLeft ?? null,
            current_run_rate: s.crr,
            required_run_rate: s.rrr ?? null,
            projected_score: s.status === "live" && s.innings === 1 ? s.projected : null,
            striker: batterLine(s.striker),
            non_striker: batterLine(s.nonStriker),
            bowler: bowlerLine(s.bowler),
            this_over: s.thisOver.map((c) => c.label),
            last_over: s.lastOver ? { over: s.lastOver.number, bowler: nameOf(ctx, s.lastOver.bowler), balls: s.lastOver.chips.map((c) => c.label), runs: s.lastOver.runs } : null,
            partnership: s.partnership,
            next_batter: s.nextBatter?.name ?? null,
            free_hit_next_ball: s.freeHit,
            last_ball: last ? { ball: last.ball, batter: last.batter, bowler: last.bowler, result: last.result } : null,
          },
  };
}
