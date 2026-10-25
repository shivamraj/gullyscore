import { describe, expect, it } from "vitest";
import { computeState, validateNext } from "../computeState";
import type { BallEvent, MatchConfig, MatchState, Player, TeamConfig } from "../types";

// ---------- test helpers ----------

function team(id: string, name: string, size: number): TeamConfig {
  const players: Player[] = Array.from({ length: size }, (_, i) => ({ id: `${id}${i + 1}`, name: `${name} ${i + 1}` }));
  return { id, name, shortCode: id.toUpperCase(), players, battingOrder: players.map((p) => p.id) };
}

/** Riverside (r1…r11) bats first against Hilltop (h1…h11). Hilltop's h10/h11 and Riverside's r10/r11 bowl. */
function makeConfig(over: Partial<MatchConfig> = {}): MatchConfig {
  const size = over.playersPerSide ?? 11;
  return {
    overs: 2,
    playersPerSide: size,
    lastManStands: false,
    teamA: team("r", "Riverside", size),
    teamB: team("h", "Hilltop", size),
    battingFirst: "r",
    openers: [
      { striker: "r1", nonStriker: "r2", bowler: size >= 11 ? "h10" : "h1" },
      { striker: "h1", nonStriker: "h2", bowler: size >= 11 ? "r10" : "r1" },
    ],
    ...over,
  };
}

type BallInput = Partial<Omit<BallEvent, "wicket">> & {
  wicket?: Partial<NonNullable<BallEvent["wicket"]>> & { type: NonNullable<BallEvent["wicket"]>["type"] };
};

/**
 * Plays balls like a scorer would: who is on strike and who bowls come from the current state,
 * a new bowler is picked automatically at the end of each over, and every ball is validated first.
 */
function play(config: MatchConfig) {
  const balls: BallEvent[] = [];
  const bowlersFor = (inningsNo: 1 | 2) => {
    const size = config.playersPerSide;
    const prefix = inningsNo === 1 ? "h" : "r";
    return size >= 11 ? [`${prefix}10`, `${prefix}11`] : [`${prefix}1`, `${prefix}2`];
  };

  function build(input: BallInput): BallEvent {
    const s = computeState(config, balls);
    const innings = s.innings;
    let bowler = input.bowler ?? s.bowler?.playerId ?? bowlersFor(innings)[0]!;
    if (!input.bowler && s.needsNewBowler) bowler = bowlersFor(innings).find((b) => b !== s.lastOverBowler)!;
    const striker = input.striker ?? s.striker!.playerId;
    const nonStriker = input.nonStriker !== undefined ? input.nonStriker : (s.nonStriker?.playerId ?? null);
    const ball: BallEvent = {
      seq: s.lastSeq + 1,
      innings,
      striker,
      nonStriker,
      bowler,
      runsBat: input.runsBat ?? 0,
      extraRuns: input.extraRuns ?? 0,
      ...(input.extraType ? { extraType: input.extraType } : {}),
    };
    if (input.wicket) {
      ball.wicket = {
        type: input.wicket.type,
        playerOut: input.wicket.playerOut ?? striker,
        ...(input.wicket.fielder ? { fielder: input.wicket.fielder } : {}),
        ...(s.nextBatter && !("incoming" in input.wicket) ? { incoming: s.nextBatter.id } : {}),
        ...(input.wicket.incoming ? { incoming: input.wicket.incoming } : {}),
      };
    }
    return ball;
  }

  return {
    balls,
    state: (): MatchState => computeState(config, balls),
    /** Validate and add one ball; throws with the validation message if it's not allowed. */
    bowl(input: BallInput = {}): MatchState {
      const ball = build(input);
      const v = validateNext(config, balls, ball);
      if (!v.ok) throw new Error(v.error);
      balls.push(ball);
      return computeState(config, balls);
    },
    /** Returns the validation error a ball would get, without adding it. */
    check(input: BallInput = {}): string | null {
      const v = validateNext(config, balls, build(input));
      return v.ok ? null : v.error;
    },
    dots(n: number): MatchState {
      let s = computeState(config, balls);
      for (let i = 0; i < n; i++) s = this.bowl();
      return s;
    },
  };
}

// ---------- scenarios ----------

describe("before the first ball", () => {
  it("is upcoming and shows the openers and opening bowler", () => {
    const s = computeState(makeConfig(), []);
    expect(s.status).toBe("upcoming");
    expect(s.score).toEqual({ runs: 0, wickets: 0, legalBalls: 0, overs: "0.0" });
    expect(s.striker?.playerId).toBe("r1");
    expect(s.nonStriker?.playerId).toBe("r2");
    expect(s.bowler?.playerId).toBe("h10");
    expect(s.nextBatter?.id).toBe("r3");
    expect(s.lastSeq).toBe(0);
  });
});

describe("runs and strike", () => {
  it("scores a dot and a single, and the batters swap ends on the single", () => {
    const m = play(makeConfig());
    let s = m.bowl({ runsBat: 0 });
    expect(s.status).toBe("live");
    expect(s.striker?.playerId).toBe("r1");
    s = m.bowl({ runsBat: 1 });
    expect(s.score.runs).toBe(1);
    expect(s.score.overs).toBe("0.2");
    expect(s.striker?.playerId).toBe("r2");
    expect(s.nonStriker?.playerId).toBe("r1");
    expect(s.nonStriker?.runs).toBe(1);
    expect(s.nonStriker?.balls).toBe(2);
  });

  it("counts fours and sixes for the batter and shows them in this over", () => {
    const m = play(makeConfig());
    m.bowl({ runsBat: 4 });
    const s = m.bowl({ runsBat: 6 });
    expect(s.striker).toMatchObject({ playerId: "r1", runs: 10, balls: 2, fours: 1, sixes: 1, strikeRate: 500 });
    expect(s.thisOver.map((c) => c.label)).toEqual(["4", "6"]);
    expect(s.bowler).toMatchObject({ playerId: "h10", runs: 10, legalBalls: 2, overs: "0.2" });
  });
});

describe("extras", () => {
  it("wide + 2: 3 runs to the team and bowler, no ball faced, no legal ball", () => {
    const m = play(makeConfig());
    const s = m.bowl({ extraType: "wide", extraRuns: 2 });
    expect(s.score.runs).toBe(3);
    expect(s.score.legalBalls).toBe(0);
    expect(s.striker).toMatchObject({ playerId: "r1", runs: 0, balls: 0 });
    expect(s.bowler).toMatchObject({ runs: 3, wides: 1, legalBalls: 0 });
    expect(s.inningsList[0]!.extras).toMatchObject({ wides: 3, total: 3 });
  });

  it("wide + 1 makes the batters cross", () => {
    const m = play(makeConfig());
    expect(m.bowl({ extraType: "wide", extraRuns: 1 }).striker?.playerId).toBe("r2");
  });

  it("no ball + 4 off the bat: batter gets 4, team 5, then a free hit", () => {
    const m = play(makeConfig());
    const s = m.bowl({ extraType: "noball", runsBat: 4 });
    expect(s.score.runs).toBe(5);
    expect(s.score.legalBalls).toBe(0);
    expect(s.striker).toMatchObject({ runs: 4, balls: 1, fours: 1 });
    expect(s.bowler).toMatchObject({ runs: 5, noballs: 1 });
    expect(s.freeHit).toBe(true);
  });

  it("byes and leg byes go to extras, not to the batter or bowler", () => {
    const m = play(makeConfig());
    m.bowl({ extraType: "bye", extraRuns: 2 });
    const s = m.bowl({ extraType: "legbye", extraRuns: 1 });
    expect(s.score.runs).toBe(3);
    expect(s.score.legalBalls).toBe(2);
    expect(s.nonStriker).toMatchObject({ playerId: "r1", runs: 0, balls: 2 });
    expect(s.bowler?.runs).toBe(0);
    expect(s.inningsList[0]!.extras).toMatchObject({ byes: 2, legbyes: 1, total: 3 });
  });

  it("rejects impossible extras", () => {
    const m = play(makeConfig());
    expect(m.check({ extraType: "bye", extraRuns: 0 })).toMatch(/at least 1 run/);
    expect(m.check({ extraType: "wide", runsBat: 4 })).toMatch(/off the bat/);
    expect(m.check({ extraRuns: 2 })).toMatch(/extra type/);
    expect(m.check({ runsBat: 9 })).toMatch(/0 to 7/);
  });
});

describe("free hit", () => {
  it("allows only a run out on the free hit, and carries over a wide", () => {
    const m = play(makeConfig());
    m.bowl({ extraType: "noball" });
    expect(m.check({ wicket: { type: "bowled" } })).toMatch(/free hit/);
    let s = m.bowl({ extraType: "wide" });
    expect(s.freeHit).toBe(true);
    expect(m.check({ wicket: { type: "caught", fielder: "h3" } })).toMatch(/free hit/);
    s = m.bowl({ runsBat: 2 });
    expect(s.freeHit).toBe(false);
    expect(m.check({ wicket: { type: "bowled" } })).toBeNull();
  });

  it("allows a run out on a free hit", () => {
    const m = play(makeConfig());
    m.bowl({ extraType: "noball" });
    const s = m.bowl({ runsBat: 1, wicket: { type: "runout", playerOut: "r2", fielder: "h4" } });
    expect(s.score.wickets).toBe(1);
    expect(s.bowler?.wickets).toBe(0);
  });
});

describe("end of an over", () => {
  it("swaps strike, asks for a new bowler, and moves the chips to last over", () => {
    const m = play(makeConfig());
    m.dots(5);
    const s = m.bowl({ runsBat: 2 });
    expect(s.score.overs).toBe("1.0");
    expect(s.striker?.playerId).toBe("r2");
    expect(s.needsNewBowler).toBe(true);
    expect(s.lastOverBowler).toBe("h10");
    expect(s.thisOver).toEqual([]);
    expect(s.lastOver).toMatchObject({ number: 1, bowler: "h10", runs: 2 });
    expect(s.lastOver?.chips.map((c) => c.label)).toEqual(["•", "•", "•", "•", "•", "2"]);
  });

  it("blocks the same bowler from bowling the next over", () => {
    const m = play(makeConfig());
    m.dots(6);
    expect(m.check({ bowler: "h10" })).toMatch(/bowled the last over/);
    expect(m.check({ bowler: "h11" })).toBeNull();
  });

  it("does not end the over on a wide or no ball", () => {
    const m = play(makeConfig());
    m.dots(5);
    const s = m.bowl({ extraType: "wide" });
    expect(s.score.overs).toBe("0.5");
    expect(s.needsNewBowler).toBe(false);
  });

  it("counts a maiden when the bowler concedes nothing in a full over", () => {
    const m = play(makeConfig());
    m.dots(5);
    const s = m.bowl({ extraType: "legbye", extraRuns: 1 });
    expect(s.inningsList[0]!.bowling[0]).toMatchObject({ playerId: "h10", maidens: 1, runs: 0 });
  });
});

describe("wickets", () => {
  it("records a catch, the fall of wicket, resets the partnership, and brings in the next batter", () => {
    const m = play(makeConfig());
    m.bowl({ runsBat: 4 });
    const s = m.bowl({ wicket: { type: "caught", fielder: "h3" } });
    expect(s.score.wickets).toBe(1);
    expect(s.bowler?.wickets).toBe(1);
    expect(s.partnership).toEqual({ runs: 0, balls: 0 });
    expect(s.striker?.playerId).toBe("r3");
    expect(s.nextBatter?.id).toBe("r4");
    const r1 = s.inningsList[0]!.batting.find((b) => b.playerId === "r1")!;
    expect(r1).toMatchObject({ out: true, howOut: "c Hilltop 3 b Hilltop 10", runs: 4, balls: 2 });
    expect(s.inningsList[0]!.fallOfWickets[0]).toMatchObject({ wicket: 1, runs: 4, overs: "0.2", playerId: "r1" });
  });

  it("run out of the non-striker: not the bowler's wicket, new batter replaces the non-striker", () => {
    const m = play(makeConfig());
    const s = m.bowl({ runsBat: 1, wicket: { type: "runout", playerOut: "r2", fielder: "h5" } });
    expect(s.score.runs).toBe(1);
    expect(s.bowler?.wickets).toBe(0);
    // r1 ran 1 and crossed, so r1 is at the far end; r3 replaces r2 at the striker's end.
    expect(s.nonStriker?.playerId).toBe("r1");
    expect(s.striker?.playerId).toBe("r3");
    expect(s.inningsList[0]!.batting.find((b) => b.playerId === "r2")?.howOut).toBe("run out (Hilltop 5)");
  });

  it("requires an incoming batter and only the striker can be bowled", () => {
    const m = play(makeConfig());
    expect(m.check({ wicket: { type: "bowled", incoming: undefined } })).toMatch(/incoming batter/);
    expect(m.check({ wicket: { type: "bowled", playerOut: "r2" } })).toMatch(/Only the striker/);
    expect(m.check({ wicket: { type: "bowled", incoming: "r1" } })).toMatch(/already batted/);
  });

  it("blocks a batter who is already out", () => {
    const m = play(makeConfig());
    m.bowl({ wicket: { type: "bowled" } });
    expect(m.check({ striker: "r1" })).toMatch(/already out/);
  });
});

describe("innings end and the chase", () => {
  it("ends innings 1 when the overs run out and sets the target", () => {
    const m = play(makeConfig());
    m.bowl({ runsBat: 4 });
    m.dots(11);
    const s = m.state();
    expect(s.status).toBe("innings_break");
    expect(s.innings).toBe(2);
    expect(s.target).toBe(5);
    expect(s.runsNeeded).toBe(5);
    expect(s.ballsLeft).toBe(12);
    expect(s.inningsList[0]).toMatchObject({ runs: 4, overs: "2.0", complete: true });
    expect(s.striker?.playerId).toBe("h1");
    expect(s.bowler?.playerId).toBe("r10");
  });

  it("chasing side wins by wickets", () => {
    const m = play(makeConfig());
    m.bowl({ runsBat: 4 });
    m.dots(11);
    let s = m.bowl({ runsBat: 2 });
    expect(s.status).toBe("live");
    expect(s.runsNeeded).toBe(3);
    expect(s.rrr).toBe(1.64);
    s = m.bowl({ runsBat: 4 });
    expect(s.status).toBe("finished");
    expect(s.result).toBe("Hilltop won by 10 wickets (10 balls left)");
    expect(s.winner).toBe("h");
    expect(m.check({ striker: "h1", nonStriker: "h2", runsBat: 1 })).toMatch(/already finished/);
  });

  it("defending side wins by runs", () => {
    const m = play(makeConfig());
    m.bowl({ runsBat: 6 });
    m.dots(11);
    m.bowl({ runsBat: 2 });
    const s = m.dots(11);
    expect(s.status).toBe("finished");
    expect(s.result).toBe("Riverside won by 4 runs");
    expect(s.winner).toBe("r");
  });

  it("detects a tie", () => {
    const m = play(makeConfig());
    m.bowl({ runsBat: 2 });
    m.dots(11);
    m.bowl({ runsBat: 2 });
    const s = m.dots(11);
    expect(s.result).toBe("Match tied");
    expect(s.winner).toBeUndefined();
  });

  it("ends the innings when the side is all out", () => {
    const config = makeConfig({ playersPerSide: 3 });
    const m = play(config);
    m.bowl({ wicket: { type: "bowled" } });
    const s = m.bowl({ wicket: { type: "lbw" } });
    expect(s.status).toBe("innings_break");
    expect(s.inningsList[0]).toMatchObject({ wickets: 2, complete: true });
  });

  it("uneven sides: each side is all out according to its own size", () => {
    const config = makeConfig({ playersPerSide: 4, teamA: team("r", "Riverside", 3), teamB: team("h", "Hilltop", 4) });
    const m = play(config);
    m.bowl({ runsBat: 4 });
    m.bowl({ wicket: { type: "bowled" } });
    let s = m.bowl({ wicket: { type: "bowled" } });
    expect(s.status).toBe("innings_break"); // 3 players → all out at 2 wickets
    expect(s.target).toBe(5);
    m.bowl({ wicket: { type: "bowled" } });
    s = m.bowl({ wicket: { type: "bowled" } });
    expect(s.status).toBe("live"); // 4 players → still batting after 2 wickets
    expect(s.score.wickets).toBe(2);
    s = m.bowl({ runsBat: 6 });
    expect(s.result).toBe("Hilltop won by 1 wicket (9 balls left)");
  });

  it("last man stands: the last batter bats alone until every batter is out", () => {
    const config = makeConfig({ playersPerSide: 3, lastManStands: true });
    const m = play(config);
    m.bowl({ wicket: { type: "bowled" } });
    let s = m.bowl({ wicket: { type: "bowled" } });
    expect(s.status).toBe("live");
    expect(s.striker?.playerId).toBe("r2");
    expect(s.nonStriker).toBeNull();
    s = m.bowl({ runsBat: 1 });
    expect(s.striker?.playerId).toBe("r2");
    s = m.bowl({ wicket: { type: "bowled" } });
    expect(s.status).toBe("innings_break");
  });

  it("the scorer can end an innings early", () => {
    const m = play(makeConfig());
    m.bowl({ runsBat: 3 });
    const s = computeState(makeConfig({ endedInnings: [1] }), m.balls);
    expect(s.status).toBe("innings_break");
    expect(s.target).toBe(4);
  });
});

describe("undo and ordering", () => {
  it("dropping the last ball gives exactly the previous state", () => {
    const config = makeConfig();
    const m = play(config);
    m.bowl({ runsBat: 1 });
    m.bowl({ extraType: "noball", runsBat: 4 });
    const before = m.state();
    m.bowl({ wicket: { type: "runout", playerOut: "r1", fielder: "h2" } });
    expect(computeState(config, m.balls.slice(0, -1))).toEqual(before);
  });

  it("rejects a ball with the wrong sequence number", () => {
    const config = makeConfig();
    const m = play(config);
    m.bowl();
    const bad: BallEvent = { seq: 5, innings: 1, striker: "r1", nonStriker: "r2", bowler: "h10", runsBat: 0, extraRuns: 0 };
    expect(validateNext(config, m.balls, bad)).toEqual({ ok: false, error: "Expected ball number 2, got 5." });
  });

  it("gives the same state whatever order the balls arrive in", () => {
    const config = makeConfig();
    const m = play(config);
    m.bowl({ runsBat: 1 });
    m.bowl({ runsBat: 4 });
    m.bowl({ extraType: "wide" });
    expect(computeState(config, [...m.balls].reverse())).toEqual(m.state());
  });
});
