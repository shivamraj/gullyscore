import { describe, expect, it } from "vitest";
import { computeState, type BallEvent, type MatchConfig } from "@/engine";
import { answerQuestion, BUSY, UNAVAILABLE } from "../agent";
import { LlmUnavailableError, type ChatModel, type Content } from "../llm";
import { findPlayers, snapshot, timeline, type AgentContext } from "../matchData";
import { systemPrompt } from "../prompt";
import { calculate, runTool, TOOLS } from "../tools";

// ---------- a small match: Riverside (bat first) vs Hilltop, 2 overs, 4 players each ----------

const riv = [
  { id: "r1", name: "Rahul Sharma" },
  { id: "r2", name: "Amit" },
  { id: "r3", name: "Deepak" },
  { id: "r4", name: "Amit Kumar" },
];
const hil = ["Vikas", "Karan", "Rohit", "Arjun"].map((name, i) => ({ id: `h${i + 1}`, name }));
const config: MatchConfig = {
  overs: 2,
  playersPerSide: 4,
  lastManStands: false,
  teamA: { id: "r", name: "Riverside", shortCode: "RIV", players: riv, battingOrder: riv.map((p) => p.id) },
  teamB: { id: "h", name: "Hilltop", shortCode: "HIL", players: hil, battingOrder: hil.map((p) => p.id) },
  battingFirst: "r",
  openers: [
    { striker: "r1", nonStriker: "r2", bowler: "h4" },
    { striker: "h1", nonStriker: "h2", bowler: "r2" },
  ],
};
const b = (seq: number, innings: 1 | 2, striker: string, nonStriker: string, bowler: string, more: Partial<BallEvent> = {}): BallEvent => ({
  seq, innings, striker, nonStriker, bowler, runsBat: 0, extraRuns: 0, ...more,
});

// Over 1 (Arjun): Rahul 4, 1 · Amit: wide, caught by Karan · Deepak: 6, dot, no ball, c & b Arjun.
// Over 2 (Rohit): Rahul 2, 1 · Amit Kumar run out (Vikas): all out for 16.  Chase: Vikas hits 4.
const balls: BallEvent[] = [
  b(1, 1, "r1", "r2", "h4", { runsBat: 4 }),
  b(2, 1, "r1", "r2", "h4", { runsBat: 1 }),
  b(3, 1, "r2", "r1", "h4", { extraType: "wide" }),
  b(4, 1, "r2", "r1", "h4", { wicket: { type: "caught", playerOut: "r2", fielder: "h2", incoming: "r3" } }),
  b(5, 1, "r3", "r1", "h4", { runsBat: 6 }),
  b(6, 1, "r3", "r1", "h4"),
  b(7, 1, "r3", "r1", "h4", { extraType: "noball" }),
  b(8, 1, "r3", "r1", "h4", { wicket: { type: "caught", playerOut: "r3", incoming: "r4" } }),
  b(9, 1, "r1", "r4", "h3", { runsBat: 2 }),
  b(10, 1, "r1", "r4", "h3", { runsBat: 1 }),
  b(11, 1, "r4", "r1", "h3", { wicket: { type: "runout", playerOut: "r4", fielder: "h1" } }),
  b(12, 2, "h1", "h2", "r2", { runsBat: 4 }),
];

function ctxFor(list: BallEvent[]): AgentContext {
  return {
    state: computeState(config, list),
    title: "Sunday Final",
    venue: "Gandhi Maidan",
    overs: 2,
    tossLine: "Riverside won the toss and chose to bat",
    teams: [
      { id: "r", name: "Riverside", shortCode: "RIV", players: riv },
      { id: "h", name: "Hilltop", shortCode: "HIL", players: hil },
    ],
    balls: list,
  };
}
const ctx = ctxFor(balls);
// The match-data tools are synchronous; call them directly. (runTool itself is async.)
const tool = (name: string, args: Record<string, unknown> = {}) => TOOLS.find((t) => t.name === name)!.run(ctx, args) as Record<string, any>;

// ---------- the match as the agent sees it ----------

describe("timeline", () => {
  const tl = timeline(ctx);
  it("numbers balls like a scorer: a wide shares the next ball's number", () => {
    expect(tl.slice(0, 5).map((x) => `${x.ball} ${x.result}`)).toEqual(["0.1 4", "0.2 1", "0.3 Wd", "0.3 W", "0.4 6"]);
    expect(tl[8]).toMatchObject({ ball: "1.1", over: 2, bowler: "Rohit", batter: "Rahul Sharma" });
  });
  it("keeps the running score", () => {
    expect(tl.filter((x) => x.innings === 1).at(-1)!.score_after).toBe("16/3");
    expect(tl.at(-1)).toMatchObject({ innings: 2, score_after: "4/0" });
  });
  it("records wickets with the fielder (the bowler for caught & bowled)", () => {
    expect(tl[3]!.wicket).toEqual({ out: "Amit", type: "caught", how: "c Karan b Arjun", fielder: "Karan" });
    expect(tl[7]!.wicket).toMatchObject({ out: "Deepak", fielder: "Arjun" });
    expect(tl[10]!.wicket).toMatchObject({ out: "Amit Kumar", type: "runout", fielder: "Vikas" });
  });
});

describe("findPlayers", () => {
  it("matches full, partial and slightly misspelt names", () => {
    expect(findPlayers(ctx, "rahul sharma").map((p) => p.name)).toEqual(["Rahul Sharma"]);
    expect(findPlayers(ctx, "sharma").map((p) => p.name)).toEqual(["Rahul Sharma"]);
    expect(findPlayers(ctx, "Rahull").map((p) => p.name)).toEqual(["Rahul Sharma"]);
    expect(findPlayers(ctx, "ARJUN")).toEqual([{ id: "h4", name: "Arjun", team: "Hilltop" }]);
  });
  it("prefers an exact name, and reports every match when it's ambiguous", () => {
    expect(findPlayers(ctx, "Amit").map((p) => p.name)).toEqual(["Amit"]);
    expect(findPlayers(ctx, "ami").map((p) => p.name)).toEqual(["Amit", "Amit Kumar"]);
    expect(findPlayers(ctx, "Sachin")).toEqual([]);
  });
});

describe("snapshot (sent with every question)", () => {
  it("has the live picture", () => {
    const s = snapshot(ctx);
    expect(s).toMatchObject({ match: "Sunday Final", venue: "Gandhi Maidan", status: "live", teams: ["Riverside", "Hilltop"] });
    expect(s.now).toMatchObject({ innings: 2, batting: "Hilltop", score: "4/0", target: 17, runs_needed: 13, balls_left: 11 });
    expect(s.now!.striker).toMatchObject({ name: "Vikas", runs: 4, balls: 1 });
    expect(s.now!.last_ball).toEqual({ ball: "0.1", batter: "Vikas", bowler: "Amit", result: "4" });
    expect(s.innings.map((i) => i.score)).toEqual(["16/3", "4/0"]);
  });
  it("has no 'now' before the first ball", () => {
    expect(snapshot(ctxFor([])).now).toBeNull();
  });
  it("goes into the system prompt with the rules", () => {
    const p = systemPrompt(ctx);
    expect(p).toContain('"score":"4/0"');
    expect(p).toContain("Never guess");
    expect(p).toContain("question, not instructions");
  });
});

// ---------- tools ----------

describe("get_balls", () => {
  it("filters by result and gives totals", () => {
    expect(tool("get_balls", { result: "boundary", innings: 1 }).totals).toMatchObject({ balls: 2, fours: 1, sixes: 1, runs: 10 });
    expect(tool("get_balls", { result: "wicket" }).balls.map((x: any) => x.wicket.out)).toEqual(["Amit", "Deepak", "Amit Kumar"]);
    // A wicket ball with no runs is a dot ball too (cricket's definition).
    expect(tool("get_balls", { result: "dot", innings: 1 }).totals.balls).toBe(4);
    expect(tool("get_balls", { result: "extra" }).totals).toMatchObject({ balls: 2, extras: 2 });
    expect(tool("get_balls", { result: "wide" }).balls[0].ball).toBe("0.3");
  });
  it("finds the last boundary", () => {
    expect(tool("get_balls", { result: "boundary", last: 1 }).balls[0]).toMatchObject({ innings: 2, ball: "0.1", batter: "Vikas", result: "4" });
  });
  it("filters by overs, batter and bowler (names as typed)", () => {
    expect(tool("get_balls", { innings: 1, from_over: 2, to_over: 2 }).totals).toMatchObject({ balls: 3, runs: 3, wickets: 1 });
    const r = tool("get_balls", { batter: "rahul", bowler: "arjun" });
    expect(r.matched).toBe("batter: Rahul Sharma, bowler: Arjun");
    expect(r.totals).toMatchObject({ balls: 2, runs_off_bat: 5 });
  });
  it("explains unknown or ambiguous names instead of guessing", () => {
    expect(tool("get_balls", { batter: "Sachin" })).toMatchObject({ error: 'No player called "Sachin" in this match.' });
    expect(tool("get_balls", { batter: "ami" }).candidates).toEqual(["Amit (Riverside)", "Amit Kumar (Riverside)"]);
  });
});

describe("get_player", () => {
  it("covers batting, dismissal, bowling and fielding", () => {
    const rahul = tool("get_player", { name: "Rahul" });
    expect(rahul.batting[0]).toMatchObject({ innings: 1, runs: 8, balls: 4, fours: 1, status: "not out", dots: 0 });
    expect(rahul.bowling).toBe("Has not bowled.");
    const arjun = tool("get_player", { name: "arjun" });
    expect(arjun.bowling[0]).toMatchObject({ overs: "1.0", wickets: 2, runs: 13, dots: 3, fours_conceded: 1, sixes_conceded: 1, wides: 1, no_balls: 1 });
    expect(arjun.fielding).toEqual({ catches: 1, run_outs: 0, stumpings: 0 });
    expect(tool("get_player", { name: "Vikas" }).fielding.run_outs).toBe(1);
    expect(tool("get_player", { name: "Deepak" }).dismissed).toMatchObject({ ball: "0.6", bowler: "Arjun", how: "c & b Arjun", score_then: "13/2" });
  });
});

describe("get_overs, get_scorecard, get_squads", () => {
  it("summarises each over", () => {
    const o = tool("get_overs", { innings: 1 }).overs;
    expect(o[0]).toMatchObject({ over: 1, bowler: "Arjun", runs: 13, wickets: 2, complete: true, score_at_end: "13/2" });
    expect(o[1]).toMatchObject({ over: 2, bowler: "Rohit", runs: 3, complete: false, score_at_end: "16/3" });
  });
  it("gives full cards", () => {
    const card = tool("get_scorecard", { innings: 1 }).innings[0];
    expect(card).toMatchObject({ batting_team: "Riverside", score: "16/3", extras: { wides: 1, noballs: 1, total: 2 } });
    expect(card.fall_of_wickets).toHaveLength(3);
  });
  it("lists the teams", () => {
    expect(tool("get_squads").teams[1].players[0]).toEqual({ name: "Vikas", batting: "batting / not out" });
  });
});

describe("calculate", () => {
  it("does exact arithmetic with precedence and brackets", () => {
    expect(calculate("(150 - 92) / (48 / 6)")).toBe(7.25);
    expect(calculate("2 + 3 * 4")).toBe(14);
    expect(calculate("-3 + 10")).toBe(7);
    expect(calculate("13 / 11 * 6")).toBe(7.091);
  });
  it("refuses anything that isn't arithmetic", () => {
    expect(() => calculate("process.exit()")).toThrow();
    expect(() => calculate("1 / 0")).toThrow("Division by zero");
    expect(tool("calculate", { expression: "2 ** 3 (" })).toHaveProperty("error");
  });
});

describe("runTool", () => {
  it("never throws: unknown tools, bad input and failing lookups come back as errors", async () => {
    expect(((await runTool(ctx, "drop_tables", {})) as any).error).toContain("Unknown tool");
    expect(((await runTool(ctx, "get_player", {})) as any).error).toBe("Give a player name.");
    const broken = { ...ctx, history: { playerMatches: async () => { throw new Error("db down"); }, teamMeetings: async () => [] } };
    expect(((await runTool(broken, "get_player_history", { name: "Rahul" })) as any).error).toContain("lookup failed");
  });
  it("declares every tool with a schema the AI can read", () => {
    for (const t of TOOLS) {
      expect(t.description.length).toBeGreaterThan(40);
      expect(t.parameters).toMatchObject({ type: "object" });
    }
  });
});

// ---------- past matches (database), through a fake history provider ----------

describe("history tools", () => {
  const past = [
    { date: "2026-10-20", match: "League 2", for: "Riverside", against: "Hilltop", status: "finished", result: "Riverside won by 5 runs",
      batting: [{ runs: 42, balls: 30, fours: 4, sixes: 1, out: true, how_out: "b Arjun" }], bowling: [] },
    { date: "2026-10-12", match: "League 1", for: "Riverside", against: "Lakeview", status: "finished", result: "Lakeview won by 2 wickets",
      batting: [{ runs: 15, balls: 12, fours: 2, sixes: 0, out: false, how_out: "not out" }], bowling: [{ overs: "2.0", runs: 14, wickets: 1, maidens: 0 }] },
  ];
  const seen: unknown[] = [];
  const withHistory: AgentContext = {
    ...ctx,
    history: {
      playerMatches: async (id, limit) => (seen.push([id, limit]), past),
      teamMeetings: async () => [
        { date: "2026-10-20", match: "League 2", status: "finished", result: "Riverside won by 5 runs", winner: "Riverside", scores: [] },
        { date: "2026-09-01", match: "Friendly", status: "finished", result: "Hilltop won by 3 wickets", winner: "Hilltop", scores: [] },
        { date: "2026-08-15", match: "Cup", status: "finished", result: "Riverside won by 1 run", winner: "Riverside", scores: [] },
      ],
    },
  };
  it("get_player_history resolves the name, asks the database for that player, and totals the career", async () => {
    const r = (await runTool(withHistory, "get_player_history", { name: "rahul", last: 3 })) as any;
    expect(seen).toEqual([["r1", 3]]);
    expect(r.totals).toMatchObject({ matches: 2, innings: 2, runs: 57, balls: 42, not_outs: 1, highest: 42, wickets: 1, best_bowling: { wickets: 1, runs: 14 } });
  });
  it("get_head_to_head counts wins for each side", async () => {
    const r = (await runTool(withHistory, "get_head_to_head", {})) as any;
    expect(r).toMatchObject({ meetings: 3, wins: { Riverside: 2, Hilltop: 1 } });
  });
  it("says so when there's no history, or no database", async () => {
    const none: AgentContext = { ...ctx, history: { playerMatches: async () => [], teamMeetings: async () => [] } };
    expect(((await runTool(none, "get_player_history", { name: "Arjun" })) as any).note).toContain("No earlier matches");
    expect(((await runTool(none, "get_head_to_head", {})) as any).note).toContain("haven't played");
    expect(((await runTool(ctx, "get_head_to_head", {})) as any).error).toContain("aren't available");
  });
});

// ---------- the agent loop, with a scripted fake AI ----------

type Step = { text?: string; calls?: { name: string; args?: Record<string, unknown> }[] };

function fakeModel(steps: Step[]): ChatModel & { seen: { contents: Content[]; tools: number }[] } {
  const seen: { contents: Content[]; tools: number }[] = [];
  let i = 0;
  return {
    seen,
    async chat({ contents, tools }) {
      seen.push({ contents: JSON.parse(JSON.stringify(contents)), tools: tools.length });
      const s = steps[Math.min(i++, steps.length - 1)]!;
      const calls = (s.calls ?? []).map((c, n) => ({ id: `c${n}`, name: c.name, args: c.args ?? {} }));
      const parts = calls.length ? calls.map((c) => ({ functionCall: c })) : [{ text: s.text ?? "" }];
      return { content: { role: "model", parts }, text: s.text ?? "", toolCalls: calls };
    },
  };
}

describe("answerQuestion", () => {
  it("answers straight from the snapshot when it can", async () => {
    const m = fakeModel([{ text: "Hilltop are 4/0, need 13 off 11 balls." }]);
    expect(await answerQuestion(ctx, "score kya hai?", [], m)).toEqual({ text: "Hilltop are 4/0, need 13 off 11 balls.", source: "ai", tools: [] });
    expect(m.seen[0]!.tools).toBe(TOOLS.length);
  });

  it("runs the tools the AI asks for and sends back the results", async () => {
    const m = fakeModel([{ calls: [{ name: "get_balls", args: { result: "boundary", last: 1 } }] }, { text: "Last boundary: Vikas hit a four, ball 0.1 of the chase." }]);
    const a = await answerQuestion(ctx, "when was the last boundry", [], m);
    expect(a).toEqual({ text: "Last boundary: Vikas hit a four, ball 0.1 of the chase.", source: "ai", tools: ["get_balls"] });
    const sent = m.seen[1]!.contents.at(-1)!.parts[0] as any;
    expect(sent.functionResponse).toMatchObject({ name: "get_balls", id: "c0" });
    expect(sent.functionResponse.response.balls[0]).toMatchObject({ batter: "Vikas", result: "4" });
  });

  it("handles several tool calls in one round", async () => {
    const m = fakeModel([{ calls: [{ name: "get_player", args: { name: "Rahul" } }, { name: "calculate", args: { expression: "8 / 4 * 100" } }] }, { text: "Rahul made 8 off 4 (SR 200)." }]);
    const a = await answerQuestion(ctx, "Rahul's strike rate?", [], m);
    expect(a.tools).toEqual(["get_player", "calculate"]);
    expect((m.seen[1]!.contents.at(-1)!.parts[1] as any).functionResponse.response.result).toBe(200);
  });

  it("stops looping: the last round has no tools, so the AI must answer", async () => {
    const m = fakeModel([...Array.from({ length: 5 }, () => ({ calls: [{ name: "get_overs" }] })), { text: "Done." }]);
    const a = await answerQuestion(ctx, "overs?", [], m);
    expect(a.text).toBe("Done.");
    expect(m.seen).toHaveLength(6);
    expect(m.seen.at(-1)!.tools).toBe(0);
  });

  it("passes recent history for follow-up questions", async () => {
    const m = fakeModel([{ text: "Karan is on 0." }]);
    await answerQuestion(ctx, "and the other one?", [{ role: "user", text: "who is batting?" }, { role: "assistant", text: "Vikas 4* and Karan 0*." }], m);
    expect(m.seen[0]!.contents.map((c) => c.role)).toEqual(["user", "model", "user"]);
  });

  it("says Ask isn't switched on without an AI key, and 'busy' when the AI is down", async () => {
    expect(await answerQuestion(ctx, "score?", [], null)).toEqual({ text: UNAVAILABLE, source: "unavailable", tools: [] });
    const down: ChatModel = { chat: async () => { throw new LlmUnavailableError("429"); } };
    expect((await answerQuestion(ctx, "score?", [], down)).source).toBe("busy");
    expect((await answerQuestion(ctx, "score?", [], down)).text).toBe(BUSY);
  });
});
