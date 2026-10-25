import { describe, expect, it } from "vitest";
import {
  allowedWickets,
  ballChip,
  batterFacedBall,
  bowlerRuns,
  dismissalText,
  formatOvers,
  isLegal,
  nextIsFreeHit,
  shouldSwapStrike,
  totalRuns,
} from "../rules";
import { economy, projectedScore, requiredRate, resultText, runRate, strikeRate } from "../stats";
import type { BallEvent } from "../types";

/** A plain ball; override only what a test cares about. */
function ball(over: Partial<BallEvent> = {}): BallEvent {
  return { seq: 1, innings: 1, striker: "s", nonStriker: "n", bowler: "b", runsBat: 0, extraRuns: 0, ...over };
}

describe("legal balls", () => {
  it("counts normal balls, byes and leg byes as legal", () => {
    expect(isLegal(ball())).toBe(true);
    expect(isLegal(ball({ extraType: "bye", extraRuns: 1 }))).toBe(true);
    expect(isLegal(ball({ extraType: "legbye", extraRuns: 1 }))).toBe(true);
  });
  it("does not count wides and no balls", () => {
    expect(isLegal(ball({ extraType: "wide" }))).toBe(false);
    expect(isLegal(ball({ extraType: "noball" }))).toBe(false);
  });
});

describe("runs", () => {
  it("adds the 1-run penalty for wides and no balls", () => {
    expect(totalRuns(ball({ extraType: "wide" }))).toBe(1);
    expect(totalRuns(ball({ extraType: "wide", extraRuns: 2 }))).toBe(3);
    expect(totalRuns(ball({ extraType: "noball", runsBat: 4 }))).toBe(5);
  });
  it("counts byes and runs off the bat as they are", () => {
    expect(totalRuns(ball({ runsBat: 6 }))).toBe(6);
    expect(totalRuns(ball({ extraType: "bye", extraRuns: 2 }))).toBe(2);
  });
});

describe("runs charged to the bowler", () => {
  it("includes runs off the bat, wides and no-ball penalties", () => {
    expect(bowlerRuns(ball({ runsBat: 4 }))).toBe(4);
    expect(bowlerRuns(ball({ extraType: "wide", extraRuns: 4 }))).toBe(5);
    expect(bowlerRuns(ball({ extraType: "noball", runsBat: 2 }))).toBe(3);
  });
  it("excludes byes and leg byes, also off a no ball", () => {
    expect(bowlerRuns(ball({ extraType: "bye", extraRuns: 4 }))).toBe(0);
    expect(bowlerRuns(ball({ extraType: "legbye", extraRuns: 1 }))).toBe(0);
    expect(bowlerRuns(ball({ extraType: "noball", extraRuns: 2 }))).toBe(1);
  });
});

describe("balls faced", () => {
  it("counts every ball except a wide", () => {
    expect(batterFacedBall(ball())).toBe(true);
    expect(batterFacedBall(ball({ extraType: "noball" }))).toBe(true);
    expect(batterFacedBall(ball({ extraType: "bye", extraRuns: 1 }))).toBe(true);
    expect(batterFacedBall(ball({ extraType: "wide" }))).toBe(false);
  });
});

describe("strike rotation", () => {
  it("swaps on 1, 3 and 5", () => {
    expect(shouldSwapStrike(ball({ runsBat: 1 }))).toBe(true);
    expect(shouldSwapStrike(ball({ runsBat: 3 }))).toBe(true);
    expect(shouldSwapStrike(ball({ runsBat: 5 }))).toBe(true);
  });
  it("does not swap on 0, 2, 4 and 6", () => {
    for (const runs of [0, 2, 4, 6]) expect(shouldSwapStrike(ball({ runsBat: runs }))).toBe(false);
  });
  it("uses runs actually run on extras, not the penalty", () => {
    expect(shouldSwapStrike(ball({ extraType: "wide" }))).toBe(false);
    expect(shouldSwapStrike(ball({ extraType: "wide", extraRuns: 1 }))).toBe(true);
    expect(shouldSwapStrike(ball({ extraType: "bye", extraRuns: 1 }))).toBe(true);
    expect(shouldSwapStrike(ball({ extraType: "noball", runsBat: 1 }))).toBe(true);
  });
});

describe("overs", () => {
  it("formats legal balls as overs", () => {
    expect(formatOvers(0)).toBe("0.0");
    expect(formatOvers(5)).toBe("0.5");
    expect(formatOvers(6)).toBe("1.0");
    expect(formatOvers(98)).toBe("16.2");
  });
});

describe("free hit", () => {
  it("follows a no ball", () => {
    expect(nextIsFreeHit(false, ball({ extraType: "noball" }))).toBe(true);
  });
  it("carries over a wide on the free hit, but ends on a legal ball", () => {
    expect(nextIsFreeHit(true, ball({ extraType: "wide" }))).toBe(true);
    expect(nextIsFreeHit(true, ball({ runsBat: 2 }))).toBe(false);
    expect(nextIsFreeHit(false, ball({ extraType: "wide" }))).toBe(false);
  });
  it("allows only a run out on a free hit or a no ball", () => {
    expect(allowedWickets(ball(), true)).not.toContain("bowled");
    expect(allowedWickets(ball(), true)).toContain("runout");
    expect(allowedWickets(ball({ extraType: "noball" }), false)).toEqual(["runout", "retired"]);
  });
  it("allows stumped on a wide but not bowled", () => {
    const w = allowedWickets(ball({ extraType: "wide" }), false);
    expect(w).toContain("stumped");
    expect(w).not.toContain("bowled");
  });
});

describe("ball chips", () => {
  it("labels each kind of ball", () => {
    expect(ballChip(ball()).label).toBe("•");
    expect(ballChip(ball({ runsBat: 2 })).label).toBe("2");
    expect(ballChip(ball({ runsBat: 4 })).kind).toBe("four");
    expect(ballChip(ball({ runsBat: 6 })).kind).toBe("six");
    expect(ballChip(ball({ extraType: "wide" })).label).toBe("Wd");
    expect(ballChip(ball({ extraType: "wide", extraRuns: 2 })).label).toBe("Wd+2");
    expect(ballChip(ball({ extraType: "noball", runsBat: 4 })).label).toBe("Nb+4");
    expect(ballChip(ball({ extraType: "bye", extraRuns: 1 })).label).toBe("1B");
    expect(ballChip(ball({ extraType: "legbye", extraRuns: 2 })).label).toBe("2Lb");
    expect(ballChip(ball({ wicket: { type: "bowled", playerOut: "s" } })).label).toBe("W");
    expect(ballChip(ball({ runsBat: 1, wicket: { type: "runout", playerOut: "n" } })).label).toBe("W+1");
  });
});

describe("dismissal text", () => {
  const names: Record<string, string> = { b: "Ravi", f: "Amit", k: "Rohit" };
  const nameOf = (id: string) => names[id] ?? id;
  it("writes each dismissal the scorecard way", () => {
    expect(dismissalText({ type: "bowled", playerOut: "s" }, "b", nameOf)).toBe("b Ravi");
    expect(dismissalText({ type: "caught", playerOut: "s", fielder: "f" }, "b", nameOf)).toBe("c Amit b Ravi");
    expect(dismissalText({ type: "caught", playerOut: "s", fielder: "b" }, "b", nameOf)).toBe("c & b Ravi");
    expect(dismissalText({ type: "lbw", playerOut: "s" }, "b", nameOf)).toBe("lbw b Ravi");
    expect(dismissalText({ type: "runout", playerOut: "s", fielder: "f" }, "b", nameOf)).toBe("run out (Amit)");
    expect(dismissalText({ type: "stumped", playerOut: "s", fielder: "k" }, "b", nameOf)).toBe("st Rohit b Ravi");
    expect(dismissalText({ type: "hitwicket", playerOut: "s" }, "b", nameOf)).toBe("hit wicket b Ravi");
  });
});

describe("rates", () => {
  it("calculates run rate, required rate, strike rate and economy", () => {
    expect(runRate(0, 0)).toBe(0);
    expect(runRate(128, 98)).toBe(7.84);
    expect(requiredRate(28, 22)).toBe(7.64);
    expect(requiredRate(10, 0)).toBeUndefined();
    expect(strikeRate(54, 38)).toBe(142.11);
    expect(economy(27, 20)).toBe(8.1);
  });
  it("projects the score at the current rate", () => {
    expect(projectedScore(60, 60, 20)).toBe(120);
    expect(projectedScore(0, 0, 20)).toBe(0);
  });
});

describe("result text", () => {
  const base = { firstTeamName: "Riverside XI", secondTeamName: "Hilltop", maxWickets: 10, totalOvers: 20 };
  it("chasing side wins by wickets, with balls left", () => {
    const r = resultText({ ...base, firstRuns: 155, secondRuns: 156, secondWickets: 4, secondLegalBalls: 115 });
    expect(r.text).toBe("Hilltop won by 6 wickets (5 balls left)");
    expect(r.winner).toBe("second");
  });
  it("defending side wins by runs", () => {
    const r = resultText({ ...base, firstRuns: 155, secondRuns: 143, secondWickets: 7, secondLegalBalls: 120 });
    expect(r.text).toBe("Riverside XI won by 12 runs");
  });
  it("uses singular words for 1", () => {
    expect(resultText({ ...base, firstRuns: 100, secondRuns: 99, secondWickets: 3, secondLegalBalls: 120 }).text).toBe(
      "Riverside XI won by 1 run",
    );
    expect(resultText({ ...base, firstRuns: 100, secondRuns: 101, secondWickets: 9, secondLegalBalls: 119 }).text).toBe(
      "Hilltop won by 1 wicket (1 ball left)",
    );
  });
  it("detects a tie", () => {
    expect(resultText({ ...base, firstRuns: 100, secondRuns: 100, secondWickets: 5, secondLegalBalls: 120 }).winner).toBe("tie");
  });
});
