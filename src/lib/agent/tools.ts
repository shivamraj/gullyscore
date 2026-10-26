// Read-only tools the Ask agent can call to look things up. The AI decides which to use and
// with what filters; each tool answers from the match data (matchData.ts) and returns JSON.
// None of them can change anything.
//
// Fewer, flexible tools beat many narrow ones: get_balls alone answers "last boundary",
// "how many sixes in the powerplay", "what did Rahul score off Arjun" and "last 6 balls".

import type { InningsState } from "@/engine";
import { batterLine, bowlerLine, findPlayers, nameOf, snapshot, teamOf, timeline, type AgentContext, type TimelineBall } from "./matchData";

export type { AgentContext } from "./matchData";

type Json = Record<string, unknown>;

export interface ToolDef {
  name: string;
  description: string;
  /** JSON Schema (OpenAPI subset) of the arguments, as Gemini function declarations expect. */
  parameters: Json;
  run: (ctx: AgentContext, args: Json) => Json;
}

const RESULTS = ["four", "six", "boundary", "wicket", "dot", "runs", "extra", "wide", "noball", "bye", "legbye"] as const;
type ResultFilter = (typeof RESULTS)[number];
const MAX_BALLS_RETURNED = 60;

function matchesResult(b: TimelineBall, r: ResultFilter): boolean {
  switch (r) {
    case "four":
      return b.runs_off_bat === 4;
    case "six":
      return b.runs_off_bat === 6;
    case "boundary":
      return b.runs_off_bat === 4 || b.runs_off_bat === 6;
    case "wicket":
      return b.wicket !== null;
    case "dot":
      // Cricket's definition: a legal ball with no runs, including a wicket ball.
      return b.legal && b.total_runs === 0;
    case "runs":
      return b.runs_off_bat > 0;
    case "extra":
      return b.extra !== null;
    default:
      return b.extra?.type === r;
  }
}

/** Resolve a typed name to one player, or explain why not. */
function onePlayer(ctx: AgentContext, name: unknown): { id: string; name: string } | { error: string; candidates?: string[] } {
  if (typeof name !== "string" || !name.trim()) return { error: "Give a player name." };
  const found = findPlayers(ctx, name);
  if (found.length === 1) return found[0]!;
  if (found.length === 0) {
    return { error: `No player called "${name}" in this match.`, candidates: ctx.teams.flatMap((t) => t.players.map((p) => p.name)) };
  }
  return { error: `More than one player matches "${name}". Ask which one.`, candidates: found.map((p) => `${p.name} (${p.team})`) };
}

function scorecard(ctx: AgentContext, i: InningsState) {
  return {
    innings: i.number,
    batting_team: teamOf(ctx, i.battingTeam)?.name,
    bowling_team: teamOf(ctx, i.bowlingTeam)?.name,
    score: `${i.runs}/${i.wickets}`,
    overs: i.overs,
    complete: i.complete,
    batting: i.batting.map(batterLine),
    bowling: i.bowling.map(bowlerLine),
    extras: i.extras,
    fall_of_wickets: i.fallOfWickets.map((f) => ({ wicket: f.wicket, score: f.runs, overs: f.overs, batter: f.name })),
  };
}

// ---------- calculator: exact arithmetic, so the model never does sums in its head ----------

/** Evaluates + - * / ( ) and decimals. No variables, no functions, nothing else. */
export function calculate(expression: string): number {
  const src = expression.replace(/\s+/g, "");
  if (!/^[\d.+\-*/()]+$/.test(src) || src.length > 200) throw new Error("Only numbers and + - * / ( ) are allowed.");
  let i = 0;
  const peek = () => src[i];
  const num = (): number => {
    if (peek() === "(") {
      i++;
      const v = expr();
      if (peek() !== ")") throw new Error("Missing )");
      i++;
      return v;
    }
    if (peek() === "-") {
      i++;
      return -num();
    }
    const m = /^\d+(\.\d+)?|^\.\d+/.exec(src.slice(i));
    if (!m) throw new Error("Expected a number");
    i += m[0].length;
    return parseFloat(m[0]);
  };
  const term = (): number => {
    let v = num();
    while (peek() === "*" || peek() === "/") {
      const op = src[i++];
      const r = num();
      if (op === "/" && r === 0) throw new Error("Division by zero");
      v = op === "*" ? v * r : v / r;
    }
    return v;
  };
  const expr = (): number => {
    let v = term();
    while (peek() === "+" || peek() === "-") {
      const op = src[i++];
      const r = term();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  };
  const value = expr();
  if (i !== src.length) throw new Error("Unexpected character");
  return Math.round(value * 1000) / 1000;
}

// ---------- the tools ----------

export const TOOLS: ToolDef[] = [
  {
    name: "get_balls",
    description:
      "Ball-by-ball data with filters, oldest first. Use for anything about specific deliveries: the last boundary or wicket, how many sixes/fours/dots/extras, runs in certain overs (e.g. overs 1-6 = powerplay), what a batter scored off a bowler, the last N balls, or the score after a given ball. Returns matching balls plus totals. Each ball has: ball ('12.3'), over (1-based), batter, bowler, result label, runs_off_bat, extra, total_runs, wicket, score_after.",
    parameters: {
      type: "object",
      properties: {
        innings: { type: "integer", description: "1 or 2. Omit for both." },
        from_over: { type: "integer", description: "First over to include, 1-based (over 1 = balls 0.1-0.6)." },
        to_over: { type: "integer", description: "Last over to include, 1-based." },
        batter: { type: "string", description: "Only balls this batter faced (name as typed)." },
        bowler: { type: "string", description: "Only balls this bowler bowled (name as typed)." },
        result: { type: "string", enum: [...RESULTS], description: "Only balls with this result. 'runs' = runs off the bat; 'boundary' = four or six." },
        last: { type: "integer", description: "Only the most recent N matching balls." },
      },
    },
    run: (ctx, a) => {
      let list = timeline(ctx);
      const note: string[] = [];
      if (a.innings === 1 || a.innings === 2) list = list.filter((b) => b.innings === a.innings);
      if (typeof a.from_over === "number") list = list.filter((b) => b.over >= (a.from_over as number));
      if (typeof a.to_over === "number") list = list.filter((b) => b.over <= (a.to_over as number));
      for (const role of ["batter", "bowler"] as const) {
        if (a[role] === undefined) continue;
        const p = onePlayer(ctx, a[role]);
        if ("error" in p) return p;
        list = list.filter((b) => b[role] === p.name);
        note.push(`${role}: ${p.name}`);
      }
      if (typeof a.result === "string" && (RESULTS as readonly string[]).includes(a.result)) list = list.filter((b) => matchesResult(b, a.result as ResultFilter));
      if (typeof a.last === "number" && a.last > 0) list = list.slice(-a.last);
      const totals = {
        balls: list.length,
        legal_balls: list.filter((b) => b.legal).length,
        runs: list.reduce((n, b) => n + b.total_runs, 0),
        runs_off_bat: list.reduce((n, b) => n + b.runs_off_bat, 0),
        fours: list.filter((b) => b.runs_off_bat === 4).length,
        sixes: list.filter((b) => b.runs_off_bat === 6).length,
        wickets: list.filter((b) => b.wicket).length,
        extras: list.reduce((n, b) => n + (b.extra?.runs ?? 0), 0),
      };
      const truncated = list.length > MAX_BALLS_RETURNED;
      return {
        ...(note.length ? { matched: note.join(", ") } : {}),
        totals,
        ...(truncated ? { note: `Showing the last ${MAX_BALLS_RETURNED} of ${list.length} balls; totals cover all of them.` } : {}),
        balls: list.slice(-MAX_BALLS_RETURNED),
      };
    },
  },
  {
    name: "get_player",
    description:
      "Everything one player did in this match: batting (runs, balls, 4s, 6s, strike rate, dots, how out and by whom), bowling (overs, runs, wickets, economy, dots, boundaries conceded, wides, no balls), and fielding (catches, run outs, stumpings). Names can be partial or slightly misspelt.",
    parameters: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
    run: (ctx, a) => {
      const p = onePlayer(ctx, a.name);
      if ("error" in p) return p;
      const team = ctx.teams.find((t) => t.players.some((x) => x.id === p.id));
      const tl = timeline(ctx);
      const faced = tl.filter((b) => b.batter === p.name);
      const bowled = tl.filter((b) => b.bowler === p.name);
      const batting = ctx.state.inningsList.flatMap((i) => i.batting.filter((b) => b.playerId === p.id).map((b) => ({ innings: i.number, ...batterLine(b) })));
      const bowling = ctx.state.inningsList.flatMap((i) => i.bowling.filter((b) => b.playerId === p.id).map((b) => ({ innings: i.number, ...bowlerLine(b) })));
      const dismissal = tl.find((b) => b.wicket?.out === p.name);
      return {
        name: p.name,
        team: team?.name,
        batting: batting.length
          ? batting.map((b) => ({ ...b, dots: faced.filter((x) => x.innings === b.innings && x.legal && x.runs_off_bat === 0).length }))
          : "Has not batted.",
        dismissed: dismissal ? { ball: dismissal.ball, bowler: dismissal.bowler, how: dismissal.wicket!.how, score_then: dismissal.score_after } : null,
        bowling: bowling.length
          ? bowling.map((b) => {
              const mine = bowled.filter((x) => x.innings === b.innings);
              return { ...b, dots: mine.filter((x) => x.legal && x.total_runs === 0).length, fours_conceded: mine.filter((x) => x.runs_off_bat === 4).length, sixes_conceded: mine.filter((x) => x.runs_off_bat === 6).length };
            })
          : "Has not bowled.",
        fielding: {
          catches: tl.filter((b) => b.wicket?.fielder === p.name && b.wicket.type === "caught").length,
          run_outs: tl.filter((b) => b.wicket?.fielder === p.name && b.wicket.type === "runout").length,
          stumpings: tl.filter((b) => b.wicket?.fielder === p.name && b.wicket.type === "stumped").length,
        },
      };
    },
  },
  {
    name: "get_overs",
    description:
      "Over-by-over summary of an innings: bowler, balls, runs, wickets and the score at the end of each over. Use for the most expensive or best over, maidens, runs per phase, or the score after N overs.",
    parameters: { type: "object", properties: { innings: { type: "integer", description: "1 or 2. Omit for the current innings." } } },
    run: (ctx, a) => {
      const inn = a.innings === 1 || a.innings === 2 ? a.innings : ctx.state.innings;
      const overs = new Map<number, TimelineBall[]>();
      for (const b of timeline(ctx).filter((x) => x.innings === inn)) overs.set(b.over, [...(overs.get(b.over) ?? []), b]);
      return {
        innings: inn,
        overs: [...overs.entries()].map(([over, list]) => ({
          over,
          bowler: list[0]!.bowler,
          balls: list.map((b) => b.result),
          runs: list.reduce((n, b) => n + b.total_runs, 0),
          wickets: list.filter((b) => b.wicket).length,
          complete: list.filter((b) => b.legal).length === 6,
          score_at_end: list.at(-1)!.score_after,
        })),
      };
    },
  },
  {
    name: "get_scorecard",
    description: "Full scorecard: every batter (runs, balls, 4s, 6s, strike rate, how out), every bowler, extras and fall of wickets. Use for top scorer, best bowler, comparisons and team totals.",
    parameters: { type: "object", properties: { innings: { type: "integer", description: "1 or 2. Omit for both." } } },
    run: (ctx, a) => ({
      innings: ctx.state.inningsList
        .filter((i) => (a.innings !== 1 && a.innings !== 2) || i.number === a.innings)
        .filter((i) => i.legalBalls > 0 || i.runs > 0 || i.number === ctx.state.innings)
        .map((i) => scorecard(ctx, i)),
    }),
  },
  {
    name: "get_squads",
    description: "Both teams' players for this match in batting order, who is out, who is batting and who is yet to bat.",
    parameters: { type: "object", properties: {} },
    run: (ctx) => ({
      teams: ctx.teams.map((t) => {
        const inn = ctx.state.inningsList.find((i) => i.battingTeam === t.id);
        return {
          team: t.name,
          short_code: t.shortCode,
          players: t.players.map((p) => {
            const line = inn?.batting.find((b) => b.playerId === p.id);
            return { name: p.name, batting: line ? (line.out ? `out (${line.howOut})` : "batting / not out") : "yet to bat or did not bat" };
          }),
        };
      }),
      next_batter: ctx.state.nextBatter?.name ?? null,
    }),
  },
  {
    name: "calculate",
    description: "Exact arithmetic: + - * / and brackets. Use it for any sum the data doesn't already give, e.g. runs needed per over, averages, differences or percentages.",
    parameters: { type: "object", properties: { expression: { type: "string", description: "e.g. (150 - 92) / (48 / 6)" } }, required: ["expression"] },
    run: (_ctx, a) => {
      try {
        return { expression: a.expression, result: calculate(String(a.expression ?? "")) };
      } catch (e) {
        return { error: e instanceof Error ? e.message : "Could not calculate." };
      }
    },
  },
];

/** Runs one tool call from the model. Never throws: errors go back to the model as data. */
export function runTool(ctx: AgentContext, name: string, args: Json): Json {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { error: `Unknown tool "${name}". Available: ${TOOLS.map((t) => t.name).join(", ")}.` };
  try {
    return tool.run(ctx, args ?? {});
  } catch (e) {
    return { error: e instanceof Error ? e.message : "The tool failed." };
  }
}

export { nameOf, snapshot };
