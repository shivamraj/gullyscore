// Spoken confirmation for the scorer ("6 runs added"), using the phone's built-in text-to-speech.
// Free, needs no network on most phones. Language and on/off are remembered on the device.

import type { BallEvent } from "@/engine";

export type VoiceSetting = "en" | "hi" | "off";

const STORAGE_KEY = "gullyscore.voice";

export function getVoiceSetting(): VoiceSetting {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "hi" || v === "off" ? v : "en";
  } catch {
    return "en";
  }
}

export function setVoiceSetting(v: VoiceSetting): void {
  try {
    localStorage.setItem(STORAGE_KEY, v);
  } catch {
    // ignore: setting lasts for this visit only
  }
}

/** Speaks the text, replacing anything still being spoken. Does nothing if voice is off or unsupported. */
export function speak(text: string, setting: VoiceSetting = getVoiceSetting()): void {
  if (setting === "off" || typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const synth = window.speechSynthesis;
  const lang = setting === "hi" ? "hi-IN" : "en-IN";
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = lang;
  // Prefer an exact language match, then any voice for that language family (e.g. en-GB).
  const voices = synth.getVoices();
  utter.voice = voices.find((v) => v.lang === lang) ?? voices.find((v) => v.lang.startsWith(lang.slice(0, 2))) ?? null;
  utter.rate = 1.05;
  synth.cancel();
  synth.speak(utter);
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * What to say after a ball. `overRuns` is set when this ball completed an over.
 * Names stay as typed; only the cricket words are translated.
 */
export function ballPhrase(
  ball: BallEvent,
  nameOf: (id: string) => string,
  setting: VoiceSetting,
  overRuns?: number,
): string {
  const hi = setting === "hi";
  let text: string;

  if (ball.wicket) {
    const w = ball.wicket;
    const out = nameOf(w.playerOut);
    const fielder = w.fielder ? nameOf(w.fielder) : null;
    const how: Record<typeof w.type, string> = hi
      ? { bowled: "बोल्ड", caught: fielder ? `${fielder} ने कैच किया` : "कैच आउट", lbw: "एल बी डब्ल्यू", runout: "रन आउट", stumped: "स्टंप आउट", hitwicket: "हिट विकेट", retired: "रिटायर" }
      : { bowled: "bowled", caught: fielder ? `caught by ${fielder}` : "caught", lbw: "L B W", runout: "run out", stumped: "stumped", hitwicket: "hit wicket", retired: "retired" };
    text = hi ? `विकेट! ${out}, ${how[w.type]}` : `Wicket! ${out}, ${how[w.type]}`;
    const runs = ball.runsBat + ball.extraRuns;
    if (runs) text += hi ? `, ${runs} रन` : `, ${plural(runs, "run", "runs")} completed`;
  } else if (ball.extraType === "wide") {
    text = hi ? "वाइड" : "Wide";
    if (ball.extraRuns) text += hi ? `, प्लस ${ball.extraRuns}` : ` plus ${ball.extraRuns}`;
  } else if (ball.extraType === "noball") {
    const more = ball.runsBat + ball.extraRuns;
    text = hi ? `नो बॉल${more ? `, प्लस ${more}` : ""}, फ्री हिट` : `No ball${more ? ` plus ${more}` : ""}, free hit`;
  } else if (ball.extraType === "bye" || ball.extraType === "legbye") {
    const n = ball.extraRuns;
    text = hi
      ? `${n} ${ball.extraType === "bye" ? "बाई" : "लेग बाई"}`
      : plural(n, ball.extraType === "bye" ? "bye" : "leg bye", ball.extraType === "bye" ? "byes" : "leg byes");
  } else if (ball.runsBat === 0) {
    text = hi ? "डॉट बॉल" : "Dot ball";
  } else if (ball.runsBat === 4) {
    text = hi ? "चौका!" : "Four!";
  } else if (ball.runsBat === 6) {
    text = hi ? "छक्का!" : "Six!";
  } else {
    text = hi ? `${ball.runsBat} रन` : `${plural(ball.runsBat, "run", "runs")} added`;
  }

  if (overRuns !== undefined) text += hi ? `. ओवर खत्म, ${overRuns} रन` : `. Over complete, ${plural(overRuns, "run", "runs")}`;
  return text;
}

export function undoPhrase(setting: VoiceSetting): string {
  return setting === "hi" ? "पिछली गेंद हटाई गई" : "Last ball undone";
}
