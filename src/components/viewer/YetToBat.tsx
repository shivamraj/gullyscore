// Current partnership and who bats next.

import type { MatchState } from "@/engine";

export function YetToBat({ state }: { state: MatchState }) {
  if (state.status !== "live") return null;
  const [next, ...rest] = state.yetToBat;
  return (
    <section className="grid grid-cols-2 gap-2.5">
      <div className="flex flex-col gap-1 rounded-2xl border border-line bg-surface px-3.5 py-3">
        <span className="text-xs font-bold tracking-[1.2px] text-ink-muted">PARTNERSHIP</span>
        <span className="font-score text-[26px] font-bold">
          {state.partnership.runs} <span className="text-base font-semibold text-ink-muted">({state.partnership.balls})</span>
        </span>
      </div>
      <div className="flex min-w-0 flex-col gap-1 rounded-2xl border border-line bg-surface px-3.5 py-3">
        <span className="text-xs font-bold tracking-[1.2px] text-ink-muted">NEXT IN</span>
        {next ? (
          <>
            <span className="truncate text-[15px] font-semibold">{next.name}</span>
            {rest.length > 0 && (
              <span className="truncate text-[13px] text-ink-muted">
                then {rest.slice(0, 2).map((p) => p.name).join(", ")}
                {rest.length > 2 ? ` +${rest.length - 2}` : ""}
              </span>
            )}
          </>
        ) : (
          <span className="text-[15px] text-ink-muted">No one left</span>
        )}
      </div>
    </section>
  );
}
