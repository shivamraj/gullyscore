// Current run rate, required run rate (when chasing) or projected score (first innings).

import type { MatchState } from "@/engine";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-semibold tracking-wider text-ink-muted">{label}</span>
      <span className="font-score text-[22px] font-bold">{value}</span>
    </div>
  );
}

export function RatesBar({ state }: { state: MatchState }) {
  if (state.status !== "live") return null;
  const chasing = state.innings === 2;
  return (
    <section aria-label="Run rates" className="grid grid-cols-3 gap-2 rounded-2xl border border-line bg-surface px-4 py-3">
      <Stat label="CRR" value={state.crr.toFixed(2)} />
      {chasing ? <Stat label="RRR" value={state.rrr !== undefined ? state.rrr.toFixed(2) : "–"} /> : <Stat label="PROJECTED" value={String(state.projected)} />}
      {chasing ? (
        <Stat label="BALLS LEFT" value={String(state.ballsLeft ?? 0)} />
      ) : (
        <Stat label="EXTRAS" value={String(state.inningsList.at(-1)!.extras.total)} />
      )}
    </section>
  );
}
