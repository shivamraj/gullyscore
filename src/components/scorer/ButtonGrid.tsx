// The scoring buttons: four rows of big targets for one-handed use.
//   0 1 2 3 / 4 6 5 WICKET / Wide No-ball Bye Leg-bye / Undo Swap Bowler More
// A button whose handler isn't passed yet (e.g. Wicket before PR 6) is shown disabled.

import type { ExtraType } from "@/engine";

interface Props {
  disabled: boolean;
  onRuns: (runs: number) => void;
  onExtra: (type: ExtraType) => void;
  onWicket?: () => void;
  onUndo?: () => void;
  onSwap: () => void;
  onChangeBowler: () => void;
  onMore?: () => void;
}

const base =
  "flex items-center justify-center rounded-2xl transition active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pitch";
const runBtn = `${base} border border-line bg-surface font-score text-[34px] font-bold text-ink`;
const extraBtn = `${base} border-[1.5px] border-gold bg-gold/10 text-[15px] font-bold text-gold-ink`;
const ctrlBtn = `${base} border border-line bg-surface-2 text-sm font-bold text-ink`;

export function ButtonGrid({ disabled, onRuns, onExtra, onWicket, onUndo, onSwap, onChangeBowler, onMore }: Props) {
  return (
    <div className="grid flex-1 grid-cols-4 grid-rows-4 gap-2.5 px-4 pt-3 pb-6" style={{ minHeight: 360 }}>
      {[0, 1, 2, 3].map((r) => (
        <button key={r} type="button" disabled={disabled} onClick={() => onRuns(r)} className={runBtn} aria-label={r === 0 ? "Dot ball" : `${r} run${r > 1 ? "s" : ""}`}>
          {r}
        </button>
      ))}

      <button type="button" disabled={disabled} onClick={() => onRuns(4)} className={`${base} bg-[#e8a317] font-score text-[34px] font-extrabold text-[#1a1200]`} aria-label="Four">
        4
      </button>
      <button type="button" disabled={disabled} onClick={() => onRuns(6)} className={`${base} bg-[#f5b935] font-score text-[34px] font-extrabold text-[#1a1200] ring-[3px] ring-ink`} aria-label="Six">
        6
      </button>
      <button type="button" disabled={disabled} onClick={() => onRuns(5)} className={runBtn} aria-label="5 runs">
        5
      </button>
      <button
        type="button"
        disabled={disabled || !onWicket}
        onClick={onWicket}
        className={`${base} bg-wicket font-score text-[22px] font-extrabold tracking-wide text-white`}
      >
        WICKET
      </button>

      <button type="button" disabled={disabled} onClick={() => onExtra("wide")} className={extraBtn}>
        Wide
      </button>
      <button type="button" disabled={disabled} onClick={() => onExtra("noball")} className={extraBtn}>
        No ball
      </button>
      <button type="button" disabled={disabled} onClick={() => onExtra("bye")} className={extraBtn}>
        Bye
      </button>
      <button type="button" disabled={disabled} onClick={() => onExtra("legbye")} className={extraBtn}>
        Leg bye
      </button>

      <button type="button" disabled={!onUndo} onClick={onUndo} className={`${base} flex-col gap-1 bg-ink text-[15px] font-bold text-ground`}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 14L4 9l5-5" />
          <path d="M4 9h11a5 5 0 0 1 0 10h-3" />
        </svg>
        Undo
      </button>
      <button type="button" disabled={disabled} onClick={onSwap} className={ctrlBtn}>
        Swap strike
      </button>
      <button type="button" disabled={disabled} onClick={onChangeBowler} className={ctrlBtn}>
        Change bowler
      </button>
      <button type="button" disabled={disabled || !onMore} onClick={onMore} className={ctrlBtn}>
        More
      </button>
    </div>
  );
}
