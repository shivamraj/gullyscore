// Instant answers for the common questions, straight from the match state, with no AI call.
// They are free, fast, work without a Gemini key, and can't make anything up. Anything they
// don't recognise goes to the AI agent (agent.ts).
//
// Replies follow the question's language: English, Hinglish (Hindi in Roman letters) or Hindi.

import type { BatterLine, InningsState } from "@/engine";
import { ballTimeline, isKind, topPerformers, type AgentContext, type BallKind } from "./tools";

export type Lang = "en" | "hinglish" | "hi";
export type Intent =
  | "lastEvent"
  | "count"
  | "howout"
  | "top"
  | "over"
  | "partnership"
  | "next"
  | "runrate"
  | "needed"
  | "bowler"
  | "batters"
  | "recap"
  | "score";

const HINGLISH = /\b(kya|kaun|kitn[aei]|hai|hain|chahiye|chahie|kaise|agla|agle|abhi|batao|bata|raha|rahe|pichla|pichhle|sabse|kab|kitne)\b/;

export function detectLang(q: string): Lang {
  if (/[ऀ-ॿ]/.test(q)) return "hi";
  return HINGLISH.test(q.toLowerCase()) ? "hinglish" : "en";
}

// Checked in this order: the first match wins (e.g. "required run rate" is a rate, not "needed").
// "boundry", "boundries" and other common misspellings are matched on purpose.
const EVENT_WORD = String.raw`(bound\w*|fours?|4s|six(es)?|6s|wicket|wkt|chauk\w*|chhakk\w*|chakk\w*)`;
const INTENTS: [Intent, RegExp][] = [
  ["lastEvent", new RegExp(String.raw`\b(last|latest|recent|previous|pichh?l[aei]|aakhri|akhri)\b[^?]*\b${EVENT_WORD}\b|आखिरी|पिछल\S* (चौक|छक्क|विकेट)`)],
  ["count", /\bhow many\b[^?]*\b(fours|4s|sixes|6s|bound\w*|extras|wides|no ?balls)\b|\b(kitne|kitni)\b[^?]*\b(chauk\w*|chhakk\w*|chakk\w*|fours?|six\w*|bound\w*|extras?|wides?)\b|कितने (चौके|छक्के|एक्स्ट्रा)/],
  ["howout", /\b(how|kaise)\b.*\bout\b|\bout kaise\b|dismiss|कैसे आउट|आउट कैसे/],
  ["top", /top scor|highest scor|most runs|best bowl|most wickets|sabse (zyada|jyada)|सबसे/],
  ["over", /\b(last|pichh?l[aei]|previous|this|current|is)\s+over\b|\b(last|pichh?l[aei])\s+\d+\s+(balls?|gend)\b|पिछल\S* ओवर|इस ओवर/],
  ["partnership", /partner|saajh|sajhe|साझ/],
  ["next", /\bnext\b|\bagl[ae]\b|aage kaun|अगल/],
  ["runrate", /run ?rate|\brrr\b|\bcrr\b|required rate|रन रेट/],
  ["needed", /\bneed|chahiye|chahie|kitne run|to win|\btarget\b|\bjeet|चाहिए|लक्ष्य|जीत/],
  ["bowler", /\bbowl|daal|गेंदबाज/],
  ["batters", /\bbat(ting|ter|ters|sman|smen)?\b|crease|khel (raha|rahe)|बल्लेबाज|खेल रह/],
  ["recap", /recap|summary|summarise|summarize|first innings|pehli|सार/],
  ["score", /score|kitna|स्कोर|what'?s happening|status|update/],
];

export function detectIntent(q: string): Intent | null {
  const text = q.toLowerCase();
  return INTENTS.find(([, re]) => re.test(text))?.[0] ?? null;
}

const n = (x: number, one: string, many: string) => `${x} ${x === 1 ? one : many}`;

function figures(b: BatterLine, lang: Lang): string {
  if (lang === "hi") return `${b.balls} गेंद में ${b.runs} रन`;
  if (lang === "hinglish") return `${b.balls} gend mein ${b.runs} run`;
  return `${b.runs} off ${b.balls}`;
}

function teamName(ctx: AgentContext, id: string) {
  return ctx.teams.find((t) => t.id === id)?.name ?? "";
}

function inningsLine(ctx: AgentContext, i: InningsState): string {
  return `${teamName(ctx, i.battingTeam)} ${i.runs}/${i.wickets} (${i.overs})`;
}

function scoreAnswer(ctx: AgentContext, lang: Lang): string {
  const s = ctx.state;
  const team = teamName(ctx, s.inningsList.at(-1)!.battingTeam);
  const first = s.inningsList[0]!;
  if (s.status === "finished") {
    const both = s.inningsList.map((i) => inningsLine(ctx, i)).join(", ");
    return `${s.result}. ${both}.`;
  }
  if (s.status === "innings_break") {
    if (lang === "hi") return `इनिंग्स ब्रेक। ${teamName(ctx, first.battingTeam)} ने ${first.runs}/${first.wickets} बनाए; ${team} को जीत के लिए ${s.target} रन चाहिए।`;
    if (lang === "hinglish") return `Innings break hai. ${teamName(ctx, first.battingTeam)} ne ${first.runs}/${first.wickets} banaye; ${team} ko jeetne ke liye ${s.target} chahiye.`;
    return `Innings break. ${teamName(ctx, first.battingTeam)} made ${first.runs}/${first.wickets}; ${team} need ${s.target} to win.`;
  }
  const { runs, wickets, overs } = s.score;
  const chase = s.innings === 2 && s.runsNeeded !== undefined;
  if (lang === "hi")
    return `${team} का स्कोर ${overs} ओवर में ${runs}/${wickets} है।${chase ? ` जीत के लिए ${s.ballsLeft} गेंद में ${s.runsNeeded} रन चाहिए।` : ""}`;
  if (lang === "hinglish")
    return `${team} ka score ${runs}/${wickets} hai, ${overs} overs mein.${chase ? ` Jeet ke liye ${s.ballsLeft} gend mein ${s.runsNeeded} run chahiye.` : ""}`;
  return `${team} are ${runs}/${wickets} after ${overs} overs.${chase ? ` They need ${s.runsNeeded} off ${n(s.ballsLeft!, "ball", "balls")}.` : ""}`;
}

/** Which kind of ball the question is about. */
function kindAsked(text: string): BallKind {
  if (/bound|बाउंड्री/.test(text)) return "boundary";
  if (/six|\b6s?\b|chhakk|chakk|छक्क/.test(text)) return "six";
  if (/four|\b4s?\b|chauk|चौक/.test(text)) return "four";
  if (/wicket|wkt|विकेट/.test(text)) return "wicket";
  if (/extra|wide|no ?ball|एक्स्ट्रा/.test(text)) return "extra";
  return "boundary";
}

const KIND_WORDS: Record<BallKind, { en: string; enMany: string; hinglish: string; hi: string }> = {
  boundary: { en: "boundary", enMany: "boundaries", hinglish: "boundary", hi: "बाउंड्री" },
  four: { en: "four", enMany: "fours", hinglish: "chauka", hi: "चौका" },
  six: { en: "six", enMany: "sixes", hinglish: "chhakka", hi: "छक्का" },
  wicket: { en: "wicket", enMany: "wickets", hinglish: "wicket", hi: "विकेट" },
  extra: { en: "extra", enMany: "extras", hinglish: "extra", hi: "एक्स्ट्रा" },
  all: { en: "ball", enMany: "balls", hinglish: "gend", hi: "गेंद" },
};

/** The answer, or null if this isn't a question the quick path can answer. */
export function quickAnswer(ctx: AgentContext, question: string): { text: string; intent: Intent; lang: Lang } | null {
  const intent = detectIntent(question);
  if (!intent) return null;
  const lang = detectLang(question);
  const s = ctx.state;
  const say = (en: string, hinglish: string, hi: string) => ({ text: lang === "hi" ? hi : lang === "hinglish" ? hinglish : en, intent, lang });

  if (s.status === "upcoming") {
    return say(
      `The match hasn't started yet. ${ctx.tossLine}.`,
      `Match abhi shuru nahi hua hai. ${ctx.tossLine}.`,
      `मैच अभी शुरू नहीं हुआ है। ${ctx.tossLine}।`,
    );
  }
  const cur = s.inningsList.at(-1)!;
  const team = teamName(ctx, cur.battingTeam);
  const live = s.status === "live";

  switch (intent) {
    case "lastEvent": {
      const kind = kindAsked(question.toLowerCase());
      const timeline = ballTimeline(ctx);
      const idx = timeline.map((b) => isKind(b, kind)).lastIndexOf(true);
      const w = KIND_WORDS[kind];
      if (idx < 0)
        return say(`No ${w.enMany} yet in this match.`, `Is match mein abhi tak koi ${w.hinglish} nahi.`, `इस मैच में अभी तक कोई ${w.hi} नहीं।`);
      const b = timeline[idx]!;
      const ago = timeline.length - 1 - idx;
      const inn = teamName(ctx, s.inningsList[b.innings - 1]!.battingTeam);
      const agoEn = ago === 0 ? "the latest ball" : `${n(ago, "ball", "balls")} ago`;
      const agoHg = ago === 0 ? "abhi abhi" : `${ago} gend pehle`;
      const agoHi = ago === 0 ? "अभी अभी" : `${ago} गेंद पहले`;
      if (b.kind === "wicket")
        return say(
          `Last wicket: ${b.out}, over ${b.over} of the ${inn} innings (${agoEn}).`,
          `Aakhri wicket: ${b.out}, ${inn} ki innings ke over ${b.over} mein (${agoHg}).`,
          `आखिरी विकेट: ${b.out}, ${inn} की पारी के ओवर ${b.over} में (${agoHi})।`,
        );
      const what = KIND_WORDS[b.kind === "six" ? "six" : "four"];
      const label = kind === "boundary" ? `${w.en} (a ${what.en})` : w.en;
      return say(
        `Last ${label}: ${b.batter} off ${b.bowler}, over ${b.over} of the ${inn} innings (${agoEn}).`,
        `Aakhri ${kind === "boundary" ? `boundary (${what.hinglish})` : w.hinglish}: ${b.batter} ne ${b.bowler} ki gend par, ${inn} ki innings ke over ${b.over} mein (${agoHg}).`,
        `आखिरी ${kind === "boundary" ? `बाउंड्री (${what.hi})` : w.hi}: ${b.batter} ने ${b.bowler} की गेंद पर, ${inn} की पारी के ओवर ${b.over} में (${agoHi})।`,
      );
    }

    case "count": {
      const kind = kindAsked(question.toLowerCase());
      const played = s.inningsList.filter((i) => i.batting.length);
      if (kind === "extra") {
        const parts = played.map((i) => `${teamName(ctx, i.battingTeam)}: ${i.extras.total} (wd ${i.extras.wides}, nb ${i.extras.noballs}, b ${i.extras.byes}, lb ${i.extras.legbyes})`);
        return say(`Extras so far: ${parts.join("; ")}.`, `Ab tak ke extras: ${parts.join("; ")}.`, `अब तक के एक्स्ट्रा: ${parts.join("; ")}।`);
      }
      const timeline = ballTimeline(ctx);
      const parts = played.map((i) => {
        const inn = timeline.filter((b) => b.innings === i.number);
        const fours = inn.filter((b) => b.kind === "four").length;
        const sixes = inn.filter((b) => b.kind === "six").length;
        const team = teamName(ctx, i.battingTeam);
        if (kind === "four") return { en: `${team} ${n(fours, "four", "fours")}`, hg: `${team} ${fours} chauke`, hi: `${team} ${fours} चौके` };
        if (kind === "six") return { en: `${team} ${n(sixes, "six", "sixes")}`, hg: `${team} ${sixes} chhakke`, hi: `${team} ${sixes} छक्के` };
        return {
          en: `${team} ${n(fours, "four", "fours")} and ${n(sixes, "six", "sixes")}`,
          hg: `${team} ${fours} chauke aur ${sixes} chhakke`,
          hi: `${team} ${fours} चौके और ${sixes} छक्के`,
        };
      });
      return say(`So far: ${parts.map((p) => p.en).join("; ")}.`, `Ab tak: ${parts.map((p) => p.hg).join("; ")}.`, `अब तक: ${parts.map((p) => p.hi).join("; ")}।`);
    }

    case "score":
      return { text: scoreAnswer(ctx, lang), intent, lang };

    case "batters": {
      if (!live || !s.striker) return { text: scoreAnswer(ctx, lang), intent, lang };
      const a = s.striker;
      const b = s.nonStriker;
      const boundaries = [a.fours ? n(a.fours, "four", "fours") : "", a.sixes ? n(a.sixes, "six", "sixes") : ""].filter(Boolean).join(", ");
      return say(
        `${a.name} is on strike with ${figures(a, "en")}${boundaries ? ` (${boundaries})` : ""}.${b ? ` ${b.name} has ${figures(b, "en")}.` : ""}`,
        `${a.name} strike par hain: ${figures(a, "hinglish")}.${b ? ` ${b.name}: ${figures(b, "hinglish")}.` : ""}`,
        `स्ट्राइक पर ${a.name}: ${figures(a, "hi")}।${b ? ` ${b.name}: ${figures(b, "hi")}।` : ""}`,
      );
    }

    case "bowler": {
      const w = s.bowler;
      if (!live || !w) return { text: scoreAnswer(ctx, lang), intent, lang };
      return say(
        `${w.name} is bowling: ${w.overs} overs, ${n(w.runs, "run", "runs")}, ${n(w.wickets, "wicket", "wickets")} (economy ${w.economy.toFixed(2)}).`,
        `${w.name} bowling kar rahe hain: ${w.overs} over, ${w.runs} run, ${w.wickets} wicket (economy ${w.economy.toFixed(2)}).`,
        `${w.name} गेंदबाज़ी कर रहे हैं: ${w.overs} ओवर, ${w.runs} रन, ${w.wickets} विकेट।`,
      );
    }

    case "runrate": {
      const crr = s.crr.toFixed(2);
      if (s.innings === 2 && s.rrr !== undefined && live)
        return say(
          `Current run rate ${crr}, required rate ${s.rrr.toFixed(2)}.`,
          `Current run rate ${crr} hai, required rate ${s.rrr.toFixed(2)}.`,
          `मौजूदा रन रेट ${crr}, ज़रूरी रन रेट ${s.rrr.toFixed(2)}।`,
        );
      return say(
        `Current run rate ${crr}. At this rate ${team} would finish on about ${s.projected}.`,
        `Current run rate ${crr} hai. Isi rate se ${team} lagbhag ${s.projected} banayenge.`,
        `मौजूदा रन रेट ${crr} है। इसी रफ़्तार से ${team} लगभग ${s.projected} बनाएगी।`,
      );
    }

    case "needed": {
      if (s.innings === 2 && live && s.runsNeeded !== undefined)
        return say(
          `${team} need ${n(s.runsNeeded, "run", "runs")} off ${n(s.ballsLeft!, "ball", "balls")}.`,
          `${team} ko ${s.ballsLeft} gend mein ${s.runsNeeded} run chahiye.`,
          `${team} को ${s.ballsLeft} गेंद में ${s.runsNeeded} रन चाहिए।`,
        );
      if (s.status === "innings_break" || s.status === "finished") return { text: scoreAnswer(ctx, lang), intent, lang };
      return say(
        `${team} are batting first, so there's no target yet. They're ${s.score.runs}/${s.score.wickets}.`,
        `${team} pehle batting kar rahe hain, abhi target nahi hai. Score ${s.score.runs}/${s.score.wickets}.`,
        `${team} पहले बल्लेबाज़ी कर रही है, अभी लक्ष्य नहीं है। स्कोर ${s.score.runs}/${s.score.wickets}।`,
      );
    }

    case "next": {
      const [next, ...rest] = s.yetToBat;
      if (!next) return say("No batters are left to come in.", "Ab koi batter baaki nahi hai.", "अब कोई बल्लेबाज़ बाकी नहीं है।");
      const then = rest.slice(0, 3).map((p) => p.name).join(", ");
      return say(
        `${next.name} is next in.${then ? ` After that: ${then}.` : ""}`,
        `Agle batter ${next.name} hain.${then ? ` Uske baad: ${then}.` : ""}`,
        `अगले बल्लेबाज़ ${next.name} हैं।${then ? ` उसके बाद: ${then}।` : ""}`,
      );
    }

    case "partnership": {
      const p = s.partnership;
      return say(
        `The current partnership is ${p.runs} off ${n(p.balls, "ball", "balls")}.`,
        `Abhi ki partnership ${p.balls} gend mein ${p.runs} run ki hai.`,
        `मौजूदा साझेदारी ${p.balls} गेंद में ${p.runs} रन की है।`,
      );
    }

    case "over": {
      // "last 6 balls": the most recent deliveries, which may span two overs.
      const lastN = /\b(?:last|pichh?l[aei])\s+(\d+)\s+(?:balls?|gend)\b/.exec(question.toLowerCase());
      if (lastN) {
        const count = Math.min(Math.max(Number(lastN[1]), 1), 36);
        const recent = ballTimeline(ctx).slice(-count);
        if (!recent.length) return say("No balls bowled yet.", "Abhi tak koi gend nahi daali gayi.", "अभी तक कोई गेंद नहीं डाली गई।");
        const runs = recent.reduce((t, x) => t + x.runs, 0);
        const list = recent.map((x) => x.result).join(", ");
        return say(
          `Last ${n(recent.length, "ball", "balls")}: ${list} (${n(runs, "run", "runs")}).`,
          `Pichhli ${recent.length} gend: ${list} (${runs} run).`,
          `पिछली ${recent.length} गेंद: ${list} (${runs} रन)।`,
        );
      }
      const wantsCurrent = /\b(this|current|is)\s+over\b|इस ओवर/.test(question.toLowerCase());
      if (wantsCurrent && s.thisOver.length) {
        const runs = s.thisOver.reduce((t, c) => t + c.runs, 0);
        const balls = s.thisOver.map((c) => c.label).join(", ");
        return say(`This over so far: ${balls} (${n(runs, "run", "runs")}).`, `Is over mein ab tak: ${balls} (${runs} run).`, `इस ओवर में अब तक: ${balls} (${runs} रन)।`);
      }
      // Early in the second innings, the last over bowled is still the first innings' final over.
      const o = s.lastOver ?? s.inningsList.at(-2)?.oversHistory.at(-1) ?? null;
      if (!o) return say("No over has been completed yet.", "Abhi tak koi over poora nahi hua.", "अभी तक कोई ओवर पूरा नहीं हुआ।");
      const bowlerName = cur.bowling.find((b) => b.playerId === o.bowler)?.name ?? s.inningsList.flatMap((i) => i.bowling).find((b) => b.playerId === o.bowler)?.name ?? "";
      const balls = o.chips.map((c) => c.label).join(", ");
      return say(
        `Over ${o.number} (${bowlerName}): ${balls}. ${n(o.runs, "run", "runs")}${o.wickets ? `, ${n(o.wickets, "wicket", "wickets")}` : ""}.`,
        `Over ${o.number} (${bowlerName}): ${balls}. ${o.runs} run${o.wickets ? `, ${o.wickets} wicket` : ""}.`,
        `ओवर ${o.number} (${bowlerName}): ${balls}। ${o.runs} रन${o.wickets ? `, ${o.wickets} विकेट` : ""}।`,
      );
    }

    case "top": {
      const parts = s.inningsList
        .filter((i) => i.batting.length)
        .map((i) => {
          const t = topPerformers(i);
          const bat = t.top_scorer ? `${t.top_scorer.name} ${t.top_scorer.runs} (${t.top_scorer.balls})` : "–";
          const bowl = t.best_bowler ? `${t.best_bowler.name} ${t.best_bowler.wickets}/${t.best_bowler.runs}` : "–";
          return { team: teamName(ctx, i.battingTeam), bat, bowl };
        });
      const en = parts.map((p) => `${p.team} innings: top scorer ${p.bat}, best bowler ${p.bowl}.`).join(" ");
      const hg = parts.map((p) => `${p.team} ki innings: top scorer ${p.bat}, best bowler ${p.bowl}.`).join(" ");
      const hi = parts.map((p) => `${p.team} की पारी: सबसे ज़्यादा रन ${p.bat}, सबसे अच्छे गेंदबाज़ ${p.bowl}।`).join(" ");
      return say(en, hg, hi);
    }

    case "recap": {
      const lines = s.inningsList.filter((i) => i.batting.length).map((i) => inningsLine(ctx, i));
      const end = s.result ? ` ${s.result}.` : "";
      return say(`${lines.join("; ")}.${end}`, `${lines.join("; ")}.${end}`, `${lines.join("; ")}।${end}`);
    }

    case "howout": {
      const text = question.toLowerCase();
      const all = s.inningsList.flatMap((i) => i.batting);
      const b = [...all].sort((x, y) => y.name.length - x.name.length).find((x) => text.includes(x.name.toLowerCase()));
      if (!b) return null; // no name we know: let the AI handle it
      if (!b.out)
        return say(
          `${b.name} is not out, ${figures(b, "en")}.`,
          `${b.name} abhi not out hain, ${figures(b, "hinglish")}.`,
          `${b.name} नॉट आउट हैं, ${figures(b, "hi")}।`,
        );
      return say(
        `${b.name} was out ${b.howOut}, for ${b.runs} (${b.balls}).`,
        `${b.name} ${b.howOut} out hue, ${figures(b, "hinglish")} banakar.`,
        `${b.name} ${b.howOut} आउट हुए, ${figures(b, "hi")} बनाकर।`,
      );
    }
  }
}
