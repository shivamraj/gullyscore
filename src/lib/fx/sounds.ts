// Short sound effects, made in the browser with the Web Audio API (FX-03).
//
// Nothing to download or license: each sound is a few tones plus a burst of filtered noise for
// the crowd. Browsers only allow sound after the viewer has tapped the page, so sounds stay
// silent until unlockSounds() runs from a tap. The viewer's on/off choice is remembered on this
// device. To use real recordings later, replace play() with an <audio> player; callers stay the same.

export type SoundName = "four" | "six" | "wicket" | "extra" | "milestone" | "innings" | "result";

const PREF_KEY = "gullyscore.sound";
let ctx: AudioContext | null = null;

/** The viewer's saved choice. Sound is on by default (still silent until the first tap). */
export function soundPreference(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) !== "off";
  } catch {
    return true;
  }
}

export function saveSoundPreference(on: boolean): void {
  try {
    localStorage.setItem(PREF_KEY, on ? "on" : "off");
  } catch {
    // Private mode: the choice lasts for this visit only.
  }
}

/** Call from a tap or click. Returns true once sound can play. */
export function unlockSounds(): boolean {
  if (typeof window === "undefined") return false;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return false;
  ctx ??= new AC();
  if (ctx.state === "suspended") void ctx.resume();
  return true;
}

export function soundsUnlocked(): boolean {
  return ctx !== null && ctx.state !== "closed";
}

function tone(ac: AudioContext, out: AudioNode, freq: number, start: number, length: number, type: OscillatorType = "triangle", volume = 0.22, slideTo?: number) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + length);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  osc.connect(gain).connect(out);
  osc.start(start);
  osc.stop(start + length + 0.05);
}

/** A crowd-like "whoosh": white noise through a band-pass filter, swelling and fading. */
function crowd(ac: AudioContext, out: AudioNode, start: number, length: number, volume = 0.12) {
  const buffer = ac.createBuffer(1, Math.ceil(ac.sampleRate * length), ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const noise = ac.createBufferSource();
  noise.buffer = buffer;
  const filter = ac.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 1100;
  filter.Q.value = 0.6;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + length * 0.3);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  noise.connect(filter).connect(gain).connect(out);
  noise.start(start);
}

/** "Tock": the bat hitting the ball. */
function bat(ac: AudioContext, out: AudioNode, start: number) {
  tone(ac, out, 900, start, 0.08, "square", 0.12, 300);
}

export function playSound(name: SoundName): void {
  if (!ctx || ctx.state !== "running") return;
  const ac = ctx;
  const out = ac.createGain();
  out.gain.value = 0.9;
  out.connect(ac.destination);
  const t = ac.currentTime + 0.02;

  switch (name) {
    case "four":
      bat(ac, out, t);
      tone(ac, out, 660, t + 0.1, 0.18);
      tone(ac, out, 880, t + 0.24, 0.3);
      crowd(ac, out, t + 0.05, 1.1);
      break;
    case "six":
      bat(ac, out, t);
      [523, 659, 784, 1047].forEach((f, i) => tone(ac, out, f, t + 0.1 + i * 0.1, 0.35));
      crowd(ac, out, t + 0.05, 1.6, 0.16);
      break;
    case "wicket":
      tone(ac, out, 1400, t, 0.06, "square", 0.1); // stumps
      tone(ac, out, 1100, t + 0.05, 0.06, "square", 0.08);
      tone(ac, out, 392, t + 0.15, 0.5, "sawtooth", 0.12, 196);
      crowd(ac, out, t + 0.1, 1.2, 0.1);
      break;
    case "extra":
      tone(ac, out, 740, t, 0.12, "sine", 0.15);
      tone(ac, out, 740, t + 0.16, 0.12, "sine", 0.15);
      break;
    case "milestone":
      [392, 523, 659, 784, 659, 784].forEach((f, i) => tone(ac, out, f, t + i * 0.12, i === 5 ? 0.6 : 0.2));
      crowd(ac, out, t, 2, 0.16);
      break;
    case "innings":
      tone(ac, out, 587, t, 0.5, "sine", 0.2);
      tone(ac, out, 440, t + 0.35, 0.8, "sine", 0.2);
      break;
    case "result":
      [523, 659, 784].forEach((f) => tone(ac, out, f, t, 0.5, "triangle", 0.14));
      [587, 740, 880].forEach((f) => tone(ac, out, f, t + 0.45, 0.5, "triangle", 0.14));
      [659, 784, 1047].forEach((f) => tone(ac, out, f, t + 0.9, 1.1, "triangle", 0.16));
      crowd(ac, out, t + 0.2, 2.2, 0.16);
      break;
  }
}
