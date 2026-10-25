// The two batters at the crease. The one on strike is highlighted with a star.

import type { BatterLine } from "@/engine";

const COLS = "grid grid-cols-[1fr_44px_36px_28px_28px_52px] gap-1";

export function BattersCard({ striker, nonStriker }: { striker: BatterLine | null; nonStriker: BatterLine | null }) {
  if (!striker && !nonStriker) return null;
  const row = (b: BatterLine, onStrike: boolean) => (
    <div key={b.playerId} className={`${COLS} items-center text-[15px] ${onStrike ? "-mx-2 rounded-lg bg-pitch-soft px-2 py-1.5" : "py-1"}`}>
      <span className={`flex min-w-0 items-center gap-1.5 ${onStrike ? "font-bold" : "font-medium"}`}>
        <span className="truncate">{b.name}</span>
        {onStrike && (
          <svg width="12" height="12" viewBox="0 0 24 24" className="shrink-0 fill-pitch" role="img" aria-label="on strike">
            <path d="M12 2l3 7 7 .6-5.3 4.6 1.6 7.1L12 17.6 5.7 21.3l1.6-7.1L2 9.6 9 9z" />
          </svg>
        )}
      </span>
      <span className="text-right font-score text-[19px] font-bold">{b.runs}</span>
      <span className="text-right text-ink-muted">{b.balls}</span>
      <span className="text-right text-ink-muted">{b.fours}</span>
      <span className="text-right text-ink-muted">{b.sixes}</span>
      <span className="text-right text-ink-muted">{b.strikeRate.toFixed(1)}</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-1.5">
      <div className={`${COLS} text-xs font-semibold text-ink-muted`}>
        <span>BATTER</span>
        <span className="text-right">R</span>
        <span className="text-right">B</span>
        <span className="text-right">4s</span>
        <span className="text-right">6s</span>
        <span className="text-right">SR</span>
      </div>
      {striker && row(striker, true)}
      {nonStriker && row(nonStriker, false)}
    </div>
  );
}
