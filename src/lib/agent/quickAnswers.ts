// Instant answers for the common questions, straight from the match state, with no AI call.
// They are free, fast, work without a Gemini key, and can't make anything up. Anything they
// don't recognise goes to the AI agent (agent.ts).
//
// Replies follow the question's language: English, Hinglish (Hindi in Roman letters) or Hindi.

import type { BatterLine, InningsState } from "@/engine";
import { topPerformers, type AgentContext } from "./tools";

export type Lang = "en" | "hinglish" | "hi";
export type Intent =
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
const INTENTS: [Intent, RegExp][] = [
  ["howout", /\b(how|kaise)\b.*\bout\b|\bout kaise\b|dismiss|कैसे आउट|आउट कैसे/],
  ["top", /top scor|highest scor|most runs|best bowl|most wickets|sabse (zyada|jyada)|सबसे/],
  ["over", /\b(last|pichh?l[aei]|previous|this|current|is)\s+over\b|पिछल\S* ओवर|इस ओवर/],
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
