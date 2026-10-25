"use client";

// After tapping Wide, No ball, Bye or Leg bye: how many runs came with it.
// Also exports Sheet, the bottom sheet used by the scorer's pickers.

import type { ReactNode } from "react";
import type { ExtraType } from "@/engine";

export function Sheet({ title, onClose, children }: { title: string; onClose?: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end bg-black/50" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="mx-auto flex max-h-[85dvh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-t-3xl bg-ground px-4 pt-3 pb-8"
      >
        <span className="mx-auto h-1.5 w-10 rounded-full bg-line" aria-hidden="true" />
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">{title}</h2>
          {onClose && (
            <button type="button" onClick={onClose} aria-label="Close" className="flex size-11 items-center justify-center rounded-xl bg-surface-2">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          )}
        </div>
        {children}
      </section>
    </div>
  );
}

const TITLES: Record<ExtraType, string> = { wide: "Wide", noball: "No ball", bye: "Byes", legbye: "Leg byes" };

const pickBtn =
  "flex h-16 flex-col items-center justify-center rounded-2xl border border-line bg-surface font-score text-2xl font-bold " +
  "active:scale-[0.97]";

interface Props {
  type: ExtraType;
  onPick: (v: { runsBat: number; extraRuns: number }) => void;
  onClose: () => void;
}

export function ExtrasPicker({ type, onPick, onClose }: Props) {
  if (type === "wide") {
    return (
      <Sheet title="Wide" onClose={onClose}>
        <p className="text-sm text-ink-muted">1 run is added automatically. Extra runs they ran, or 4 if it went to the boundary:</p>
        <div className="grid grid-cols-5 gap-2">
          {[0, 1, 2, 3, 4].map((n) => (
            <button key={n} type="button" className={pickBtn} onClick={() => onPick({ runsBat: 0, extraRuns: n })}>
              {n === 0 ? "Wd" : `+${n}`}
              <span className="font-sans text-xs font-semibold text-ink-muted">{1 + n} total</span>
            </button>
          ))}
        </div>
      </Sheet>
    );
  }

  if (type === "noball") {
    return (
      <Sheet title="No ball" onClose={onClose}>
        <p className="text-sm text-ink-muted">1 run is added automatically, and the next ball is a free hit.</p>
        <h3 className="text-sm font-bold text-ink-muted">Runs off the bat</h3>
        <div className="grid grid-cols-6 gap-2">
          {[0, 1, 2, 3, 4, 6].map((n) => (
            <button key={n} type="button" className={pickBtn} onClick={() => onPick({ runsBat: n, extraRuns: 0 })}>
              {n === 0 ? "Nb" : n}
            </button>
          ))}
        </div>
        <h3 className="text-sm font-bold text-ink-muted">Or byes off the no ball</h3>
        <div className="grid grid-cols-4 gap-2">
          {[1, 2, 3, 4].map((n) => (
            <button key={n} type="button" className={pickBtn} onClick={() => onPick({ runsBat: 0, extraRuns: n })}>
              +{n}B
            </button>
          ))}
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet title={TITLES[type]} onClose={onClose}>
      <p className="text-sm text-ink-muted">Runs go to extras, not to the batter or bowler.</p>
      <div className="grid grid-cols-4 gap-2">
        {[1, 2, 3, 4].map((n) => (
          <button key={n} type="button" className={pickBtn} onClick={() => onPick({ runsBat: 0, extraRuns: n })}>
            {n}
          </button>
        ))}
      </div>
    </Sheet>
  );
}
