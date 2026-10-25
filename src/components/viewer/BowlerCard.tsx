// The current bowler's figures: overs, maidens, runs, wickets, economy.

import type { BowlerLine } from "@/engine";

const COLS = "grid grid-cols-[1fr_40px_28px_36px_28px_52px] gap-1";

export function BowlerCard({ bowler }: { bowler: BowlerLine | null }) {
  if (!bowler) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <div className={`${COLS} text-xs font-semibold text-ink-muted`}>
        <span>BOWLER</span>
        <span className="text-right">O</span>
        <span className="text-right">M</span>
        <span className="text-right">R</span>
        <span className="text-right">W</span>
        <span className="text-right">ECON</span>
      </div>
      <div className={`${COLS} items-center py-1 text-[15px]`}>
        <span className="truncate font-semibold">{bowler.name}</span>
        <span className="text-right text-ink-muted">{bowler.overs}</span>
        <span className="text-right text-ink-muted">{bowler.maidens}</span>
        <span className="text-right text-ink-muted">{bowler.runs}</span>
        <span className="text-right font-bold">{bowler.wickets}</span>
        <span className="text-right text-ink-muted">{bowler.economy.toFixed(2)}</span>
      </div>
    </div>
  );
}
