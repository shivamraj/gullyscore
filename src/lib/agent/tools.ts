// Read-only tools the agent uses to answer questions. Each one reads the calculated match state
// and returns a small JSON object. None can change anything.

import { ballChip, isLegal, type BallChip, type BallEvent, type BatterLine, type BowlerLine, type InningsState, type MatchState } from "@/engine";

export interface AgentContext {
  state: MatchState;
  title: string;
  overs: number;
  tossLine: string;
  teams: { id: string; name: string; shortCode: string; players: { id: string; name: string }[] }[];
  /** Every ball so far, in order. Lets the agent answer "when was the last boundary?". */
  balls: BallEvent[];
}

export type BallKind = "four" | "six" | "boundary" | "wicket" | "extra" | "all";

export interface TimelineBall {
  innings: 1 | 2;
  /** Cricket notation: "2.4" = 3rd over, 4th ball. Wides and no balls share the next ball's number. */
  over: string;
  batter: string;
  bowler: string;
  /** As on the scoreboard: •, 1, 4, 6, W, Wd, Nb+4, 2B … */
  result: string;
  kind: BallChip["kind"];
  runs: number;
  /** For wickets: who was out and how. */
  out?: string;
}

/** Every ball with its over number, batter and bowler, oldest first. */
export function ballTimeline(ctx: AgentContext): TimelineBall[] {
  const legalSoFar: Record<number, number> = { 1: 0, 2: 0 };
  const sorted = [...ctx.balls].sort((a, b) => a.seq - b.seq);
  return sorted.map((b) => {
    const done = legalSoFar[b.innings]!;
    if (isLegal(b)) legalSoFar[b.innings] = done + 1;
    const chip = ballChip(b);
    const ball: TimelineBall = {
      innings: b.innings,
      over: `${Math.floor(done / 6)}.${(done % 6) + 1}`,
      batter: playerName(ctx, b.striker),
      bowler: playerName(ctx, b.bowler),
      result: chip.label,
      kind: chip.kind,
      runs: chip.runs,
    };
    if (b.wicket) {
      const out = ctx.state.inningsList[b.innings - 1]?.batting.find((x) => x.playerId === b.wicket!.playerOut);
      ball.out = `${playerName(ctx, b.wicket.playerOut)} ${out?.howOut ?? b.wicket.type}`;
    }
    return ball;
  });
}

/** Does this ball count as the kind asked for? A boundary is a four or a six off the bat. */
export function isKind(ball: TimelineBall, kind: BallKind): boolean {
  if (kind === "all") return true;
  if (kind === "boundary") return ball.kind === "four" || ball.kind === "six";
  return ball.kind === kind;
}

type Json = Record<string, unknown>;

export interface ToolDef {
  name: string;
  description: string;
  parameters: Json;
  run: (ctx: AgentContext, args: Json) => Json;
}

function playerName(ctx: AgentContext, id: string): string {
  return ctx.teams.flatMap((t) => t.players).find((p) => p.id === id)?.name ?? "Unknown";
}

const teamName = (ctx: AgentContext, id: string) => ctx.teams.find((t) => t.id === id)?.name ?? "Unknown";

const batter = (b: BatterLine | null) =>
  b && { name: b.name, runs: b.runs, balls: b.balls, fours: b.fours, sixes: b.sixes, strike_rate: b.strikeRate, out: b.out, how_out: b.howOut };
const bowler = (b: BowlerLine | null) =>
  b && { name: b.name, overs: b.overs, maidens: b.maidens, runs: b.runs, wickets: b.wickets, economy: b.economy };
const balls = (chips: BallChip[]) => chips.map((c) => c.label);

function inningsSummary(ctx: AgentContext, i: InningsState) {
  return { innings: i.number, team: teamName(ctx, i.battingTeam), runs: i.runs, wickets: i.wickets, overs: i.overs, complete: i.complete };
}

/** Highest scorer and best bowler of one innings (or null before anyone has batted/bowled). */
export function topPerformers(i: InningsState) {
  const top = [...i.batting].sort((a, b) => b.runs - a.runs || a.balls - b.balls)[0] ?? null;
  const best = [...i.bowling].sort((a, b) => b.wickets - a.wickets || a.runs - b.runs)[0] ?? null;
  return { top_scorer: batter(top), best_bowler: bowler(best) };
}

export const TOOLS: ToolDef[] = [
  {
    name: "get_match_info",
    description: "Match name, teams, overs per innings, toss, status (upcoming, live, innings_break, finished) and result.",
    parameters: { type: "object", properties: {} },
    run: (ctx) => ({
      title: ctx.title,
      teams: ctx.teams.map((t) => t.name),
      overs_per_innings: ctx.overs,
      toss: ctx.tossLine,
      status: ctx.state.status,
      result: ctx.state.result ?? null,
    }),
  },
  {
    name: "get_score",
    description: "Current score of the batting side, target, runs needed and balls left in a chase, and the first innings total.",
    parameters: { type: "object", properties: {} },
    run: (ctx) => {
      const s = ctx.state;
      const cur = s.inningsList.at(-1)!;
      return {
        status: s.status,
        batting_team: teamName(ctx, cur.battingTeam),
        runs: s.score.runs,
        wickets: s.score.wickets,
        overs: s.score.overs,
        target: s.target ?? null,
        runs_needed: s.runsNeeded ?? null,
        balls_left: s.ballsLeft ?? null,
        innings: s.inningsList.map((i) => inningsSummary(ctx, i)),
        result: s.result ?? null,
      };
    },
  },
  {
    name: "get_batters",
    description: "The two batters at the crease: runs, balls, fours, sixes, strike rate. The striker is on strike.",
    parameters: { type: "object", properties: {} },
    run: (ctx) => ({ striker: batter(ctx.state.striker), non_striker: batter(ctx.state.nonStriker) }),
  },
  {
    name: "get_bowler",
    description: "The current bowler's figures: overs, maidens, runs, wickets, economy.",
    parameters: { type: "object", properties: {} },
    run: (ctx) => ({ bowler: bowler(ctx.state.bowler) }),
  },
  {
    name: "get_run_rates",
    description: "Current run rate, required run rate (only when chasing) and projected score at the current rate.",
    parameters: { type: "object", properties: {} },
    run: (ctx) => ({ current_run_rate: ctx.state.crr, required_run_rate: ctx.state.rrr ?? null, projected_score: ctx.state.projected }),
  },
  {
    name: "get_batting_order",
    description: "Who bats next and everyone still to bat, in batting order.",
    parameters: { type: "object", properties: {} },
    run: (ctx) => ({ next_batter: ctx.state.nextBatter?.name ?? null, yet_to_bat: ctx.state.yetToBat.map((p) => p.name) }),
  },
  {
    name: "get_partnership",
    description: "Runs and balls of the current partnership.",
    parameters: { type: "object", properties: {} },
    run: (ctx) => ({ runs: ctx.state.partnership.runs, balls: ctx.state.partnership.balls }),
  },
  {
    name: "get_over",
    description: "Ball-by-ball of the current over or the last completed over. Labels: • dot, 1-6 runs, W wicket, Wd wide, Nb no ball, B bye, Lb leg bye.",
    parameters: { type: "object", properties: { which: { type: "string", enum: ["current", "last"] } }, required: ["which"] },
    run: (ctx, args) => {
      const s = ctx.state;
      if (args.which === "current") return { balls: balls(s.thisOver), runs: s.thisOver.reduce((n, c) => n + c.runs, 0) };
      const o = s.lastOver;
      return o ? { over_number: o.number, bowler: playerName(ctx, o.bowler), balls: balls(o.chips), runs: o.runs, wickets: o.wickets } : { over: null };
    },
  },
  {
    name: "get_ball_by_ball",
    description:
      "Every ball of the match (or of one innings) with over number, batter, bowler and result. Filter by kind to find fours, sixes, boundaries, wickets or extras, e.g. the last boundary or how many sixes were hit. Newest balls are last.",
    parameters: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["all", "boundary", "four", "six", "wicket", "extra"] },
        innings: { type: "integer", enum: [1, 2] },
        last: { type: "integer", description: "Only the most recent N matching balls (default 30)." },
      },
    },
    run: (ctx, args) => {
      const kind = (args.kind as BallKind | undefined) ?? "all";
      const list = ballTimeline(ctx).filter((b) => (args.innings === undefined || b.innings === args.innings) && isKind(b, kind));
      const last = typeof args.last === "number" && args.last > 0 ? Math.min(args.last, 60) : 30;
      return {
        kind,
        total_matching: list.length,
        balls: list.slice(-last).map((b) => ({ innings: b.innings, over: b.over, batter: b.batter, bowler: b.bowler, result: b.result, ...(b.out ? { out: b.out } : {}) })),
      };
    },
  },
  {
    name: "get_scorecard",
    description: "Full scorecard of an innings: batters with how they got out, bowlers, extras, fall of wickets, top scorer and best bowler.",
    parameters: { type: "object", properties: { innings: { type: "integer", enum: [1, 2] } } },
    run: (ctx, args) => {
      const list = ctx.state.inningsList.filter((i) => args.innings === undefined || i.number === args.innings);
      return {
        innings: list.map((i) => ({
          ...inningsSummary(ctx, i),
          batting: i.batting.map(batter),
          bowling: i.bowling.map(bowler),
          extras: i.extras,
          fall_of_wickets: i.fallOfWickets.map((f) => `${f.runs}-${f.wicket} (${f.name}, ${f.overs} ov)`),
          ...topPerformers(i),
        })),
      };
    },
  },
];

export function runTool(ctx: AgentContext, name: string, args: Json): Json {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { error: `Unknown tool ${name}` };
  return tool.run(ctx, args ?? {});
}
