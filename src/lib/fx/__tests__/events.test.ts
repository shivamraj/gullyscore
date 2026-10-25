import { describe, expect, it } from "vitest";
import { computeState, type BallEvent, type MatchConfig } from "@/engine";
import { CELEBRATE, countViewers, detectEvent, SOUND_FOR } from "../events";

const riv = ["Rahul", "Amit", "Deepak"].map((name, i) => ({ id: `r${i + 1}`, name }));
const hil = ["Vikas", "Karan", "Arjun"].map((name, i) => ({ id: `h${i + 1}`, name }));
const config = (overs = 3): MatchConfig => ({
  overs,
  playersPerSide: 3,
  lastManStands: false,
  teamA: { id: "r", name: "Riverside", shortCode: "RIV", players: riv, battingOrder: riv.map((p) => p.id) },
  teamB: { id: "h", name: "Hilltop", shortCode: "HIL", players: hil, battingOrder: hil.map((p) => p.id) },
  battingFirst: "r",
  openers: [{ striker: "r1", nonStriker: "r2", bowler: "h3" }],
});

let seq = 0;
const b = (more: Partial<BallEvent> = {}, striker = "r1", nonStriker = "r2", bowler = "h3"): BallEvent => ({
  seq: ++seq, innings: 1, striker, nonStriker, bowler, runsBat: 0, extraRuns: 0, ...more,
});

/** The event shown when `added` is bowled after `before`. */
function eventAfter(before: BallEvent[], added: BallEvent[], cfg = config()) {
  return detectEvent(computeState(cfg, before), computeState(cfg, [...before, ...added]));
}

describe("detectEvent", () => {
  it("names fours and sixes with the batter's figures", () => {
    seq = 0;
    expect(eventAfter([], [b({ runsBat: 4 })])).toMatchObject({ kind: "four", title: "FOUR!", detail: "Rahul · 4 (1)", teamId: "r" });
    seq = 0;
    const first = [b({ runsBat: 1 })];
    const six = eventAfter(first, [b({ runsBat: 6 }, "r2", "r1")]);
    expect(six).toMatchObject({ kind: "six", title: "SIX!", detail: "Amit · 6 (1)" });
    expect(CELEBRATE.has("six")).toBe(true);
    expect(SOUND_FOR.six).toBe("six");
  });

  it("shows a small +runs for ordinary runs and nothing for a dot", () => {
    seq = 0;
    expect(eventAfter([], [b({ runsBat: 2 })])).toMatchObject({ kind: "run", title: "+2" });
    seq = 0;
    expect(eventAfter([], [b()])).toBeNull();
    expect(SOUND_FOR.run).toBeUndefined();
  });

  it("shows a wicket with how the batter got out, in the bowling team's colour", () => {
    seq = 0;
    const e = eventAfter([b({ runsBat: 1 })], [b({ wicket: { type: "caught", playerOut: "r2", fielder: "h1", incoming: "r3" } }, "r2", "r1")]);
    expect(e).toMatchObject({ kind: "wicket", title: "WICKET!", detail: "Amit c Vikas b Arjun · 0 (1)", teamId: "h" });
  });

  it("shows wides and no balls, with FREE HIT", () => {
    seq = 0;
    expect(eventAfter([], [b({ extraType: "wide", extraRuns: 0 })])).toMatchObject({ kind: "extra", title: "WIDE", detail: "+1 run" });
    seq = 0;
    expect(eventAfter([], [b({ extraType: "noball" })])).toMatchObject({ kind: "extra", title: "NO BALL · FREE HIT" });
    seq = 0;
    expect(eventAfter([], [b({ extraType: "legbye", extraRuns: 2 })])).toMatchObject({ kind: "extra", title: "LEG BYES", detail: "+2 runs" });
  });

  it("treats a six off a no ball as a six, and mentions the free hit", () => {
    seq = 0;
    expect(eventAfter([], [b({ extraType: "noball", runsBat: 6 })])).toMatchObject({ kind: "six", detail: "Rahul · 6 (1) · FREE HIT next" });
  });

  it("marks the end of an over", () => {
    seq = 0;
    const five = [b(), b(), b(), b(), b()];
    expect(eventAfter(five, [b({ runsBat: 1 })])).toMatchObject({ kind: "over", title: "END OF OVER 1", detail: "1 run · 1/0" });
  });

  it("celebrates fifty and hundred ahead of the six that got there", () => {
    seq = 0;
    const sixes = Array.from({ length: 8 }, () => b({ runsBat: 6 }, "r1", "r2", seq < 6 ? "h3" : "h2"));
    // 48 so far; two more off the next ball brings up the fifty.
    const cfg = config(5);
    const fifty = detectEvent(computeState(cfg, sixes), computeState(cfg, [...sixes, b({ runsBat: 2 }, "r1", "r2", "h2")]));
    expect(fifty).toMatchObject({ kind: "fifty", title: "FIFTY!", detail: "Rahul · 50 (9)" });
    expect(SOUND_FOR.fifty).toBe("milestone");
  });

  it("announces the innings break and the result", () => {
    seq = 0;
    const cfg = config(1);
    const over = [b({ runsBat: 4 }), b(), b(), b(), b(), b()];
    expect(eventAfter(over.slice(0, 5), over.slice(5), cfg)).toMatchObject({ kind: "innings", title: "INNINGS BREAK", detail: "Target 5" });
    const chase = [{ ...b({ runsBat: 6 }, "h1", "h2", "r3"), innings: 2 as const }];
    const withOpeners: MatchConfig = { ...cfg, openers: [cfg.openers![0], { striker: "h1", nonStriker: "h2", bowler: "r3" }] };
    const result = detectEvent(computeState(withOpeners, over), computeState(withOpeners, [...over, ...chase]));
    expect(result).toMatchObject({ kind: "result", title: "RESULT", teamId: "h" });
    expect(result?.detail).toMatch(/Hilltop won/);
  });

  it("stays quiet on undo or a repeated update", () => {
    seq = 0;
    const balls = [b({ runsBat: 6 }), b({ runsBat: 4 })];
    const cfg = config();
    const full = computeState(cfg, balls);
    expect(detectEvent(full, computeState(cfg, balls.slice(0, 1)))).toBeNull();
    expect(detectEvent(full, full)).toBeNull();
  });
});

describe("countViewers", () => {
  it("counts each viewer tab once and ignores the scorer", () => {
    expect(countViewers({})).toBe(0);
    expect(countViewers({ a: [{ role: "viewer" }], b: [{ role: "viewer" }, { role: "viewer" }], s: [{ role: "scorer" }] })).toBe(2);
  });
});
