"use client";

// Animations and sounds on the viewer's match page (FX-01 to FX-04).
//
// useLiveEffects watches the live state and, when a ball changes it, works out what happened
// (src/lib/fx/events.ts), shows it for about 1.5 seconds, plays its sound and throws confetti
// for the big moments. The banner sits near the bottom of the screen so it never covers the
// score. With "reduce motion" on, the banner appears without movement and there's no confetti.

import { useEffect, useRef, useState } from "react";
import type { MatchState } from "@/engine";
import { CELEBRATE, detectEvent, SOUND_FOR, type FxEvent } from "@/lib/fx/events";
import { playSound, saveSoundPreference, soundPreference, unlockSounds } from "@/lib/fx/sounds";

interface Shown extends FxEvent {
  key: number;
}

const SHOW_MS: Partial<Record<FxEvent["kind"], number>> = { run: 900, over: 1300 };

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export function useLiveEffects(state: MatchState) {
  const prev = useRef(state);
  const [shown, setShown] = useState<Shown | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const soundRef = useRef(true);

  // Saved sound choice (read after mount so server and browser render the same).
  useEffect(() => {
    soundRef.current = soundPreference();
    setSoundOn(soundRef.current);
  }, []);

  // Browsers allow sound only after a tap: unlock on the first one anywhere on the page.
  useEffect(() => {
    const unlock = () => soundRef.current && unlockSounds();
    document.addEventListener("pointerdown", unlock, { once: true });
    return () => document.removeEventListener("pointerdown", unlock);
  }, []);

  useEffect(() => {
    const before = prev.current;
    prev.current = state;
    if (before === state) return;
    const event = detectEvent(before, state);
    if (!event) return;
    setShown({ ...event, key: Date.now() });
    const sound = SOUND_FOR[event.kind];
    if (sound && soundRef.current) playSound(sound);
  }, [state]);

  useEffect(() => {
    if (!shown) return;
    const timer = setTimeout(() => setShown(null), SHOW_MS[shown.kind] ?? 1500);
    return () => clearTimeout(timer);
  }, [shown]);

  const toggleSound = () => {
    const on = !soundRef.current;
    soundRef.current = on;
    setSoundOn(on);
    saveSoundPreference(on);
    if (on) unlockSounds();
  };

  return { event: shown, soundOn, toggleSound };
}

/** Readable text colour on top of a team colour. */
function textOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#ffffff";
  const n = parseInt(m[1]!, 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? "#0f1a14" : "#ffffff";
}

const BIG = new Set<FxEvent["kind"]>(["four", "six", "wicket", "fifty", "hundred", "result", "innings"]);

function Confetti({ colours }: { colours: string[] }) {
  const [pieces] = useState(() =>
    Array.from({ length: 36 }, (_, i) => ({
      left: 10 + Math.random() * 80,
      dx: (Math.random() - 0.5) * 220,
      rise: 30 + Math.random() * 18,
      spin: (Math.random() - 0.5) * 900,
      delay: Math.random() * 0.15,
      colour: colours[i % colours.length]!,
      round: i % 3 === 0,
    })),
  );
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 h-[55dvh] overflow-hidden" aria-hidden="true">
      {pieces.map((p, i) => (
        <span
          key={i}
          className={`fx-confetti absolute bottom-24 h-2.5 w-1.5 ${p.round ? "rounded-full" : "rounded-[1px]"}`}
          style={
            {
              left: `${p.left}%`,
              background: p.colour,
              animationDelay: `${p.delay}s`,
              "--dx": `${p.dx}px`,
              "--rise": `-${p.rise}dvh`,
              "--spin": `${p.spin}deg`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

export function EventBanner({ event, colourOf }: { event: Shown | null; colourOf: (teamId?: string) => string }) {
  if (!event) return null;
  const colour = event.kind === "wicket" ? "#c8322b" : colourOf(event.teamId);
  const big = BIG.has(event.kind);
  const celebrate = CELEBRATE.has(event.kind) && !reducedMotion();

  return (
    <>
      {celebrate && <Confetti key={event.key} colours={[colour, "#f5b935", "#ffffff", "#2fbf71"]} />}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex justify-center px-4" role="status" aria-live="polite">
        <div
          key={event.key}
          className={`fx-pop flex max-w-sm flex-col items-center rounded-2xl text-center shadow-[0_12px_32px_rgba(0,0,0,0.3)] ${
            big ? "gap-0.5 px-6 py-3" : "px-4 py-2"
          } ${event.kind === "six" || event.kind === "hundred" ? "fx-shake" : ""}`}
          style={{ background: big ? colour : "var(--ink)", color: big ? textOn(colour) : "var(--ground)" }}
        >
          <span className={`font-score leading-none font-extrabold tracking-wide ${big ? "text-[44px]" : "text-2xl"}`}>{event.title}</span>
          {event.detail && <span className={`font-semibold ${big ? "text-sm opacity-90" : "text-xs opacity-80"}`}>{event.detail}</span>}
        </div>
      </div>
    </>
  );
}

export function SoundToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      aria-label={on ? "Sound on. Tap to mute" : "Sound off. Tap to turn on"}
      title={on ? "Mute sounds" : "Turn sounds on"}
      className="flex size-11 items-center justify-center rounded-xl border border-line bg-surface"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M11 5L6 9H3v6h3l5 4V5z" />
        {on ? (
          <>
            <path d="M15.5 8.5a5 5 0 0 1 0 7" />
            <path d="M18.5 5.5a9 9 0 0 1 0 13" />
          </>
        ) : (
          <path d="M22 9l-6 6M16 9l6 6" />
        )}
      </svg>
    </button>
  );
}
