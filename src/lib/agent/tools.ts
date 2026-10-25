// Read-only tools the agent uses to answer questions. Each one reads the calculated match state
// and returns a small JSON object. None can change anything.

import type { BallChip, BatterLine, BowlerLine, InningsState, MatchState } from "@/engine";

export interface AgentContext {
  state: MatchState;
  title: string;
  overs: number;
  tossLine: string;
  teams: { id: string; name: string; shortCode: string; players: { id: string; name: string }[] }[];
}

type Json = Record<string, unknown>;

export interface ToolDef {
  name: string;
  description: string;
  parameters: Json;
  run: (ctx: AgentContext, args: Json) => Json;
}

const teamName = (ctx: AgentContext, id: string) => ctx.teams.find((t) => t.id === id)?.name ?? "Unknown";
const playerName = (ctx: AgentContext, id: string) =>
  ctx.teams.flatMap((t) => t.players).find((p) => p.id === id)?.name ?? "Unknown";

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
