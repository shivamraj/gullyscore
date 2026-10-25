// "This over" as ball chips, with empty slots for the balls still to come, and the previous over below.

import type { BallChip, MatchState } from "@/engine";

const CHIP: Record<BallChip["kind"], string> = {
  dot: "bg-surface-2 text-ink",
  run: "bg-surface-2 text-ink",
  four: "bg-gold text-[#1a1200]",
  six: "bg-gold text-[#1a1200] ring-2 ring-ink",
  extra: "border-[1.5px] border-gold bg-gold/15 text-gold-ink text-[13px]",
  wicket: "bg-wicket text-white",
};

export function Chip({ chip, size = 38 }: { chip: BallChip; size?: number }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full px-1 font-bold ${CHIP[chip.kind]}`}
      style={{ minWidth: size, height: size }}
    >
      {chip.label}
    </span>
  );
}

function LastOver({ over, bowlerName }: { over: NonNullable<MatchState["lastOver"]>; bowlerName: (id: string) => string }) {
  return (
    <section aria-label="Last over" className="flex flex-col gap-2.5 rounded-2xl border border-line bg-surface px-3.5 py-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-bold tracking-[1.2px] text-ink-muted uppercase">Last over · {bowlerName(over.bowler)}</h2>
        <span className="text-[13px] text-ink-muted">
          {over.runs} run{over.runs === 1 ? "" : "s"}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {over.chips.map((c) => (
          <Chip key={c.seq} chip={c} />
        ))}
      </div>
    </section>
  );
}

export function OverChips({ state, bowlerName }: { state: MatchState; bowlerName: (id: string) => string }) {
  if (state.status === "upcoming") return null;
  // Between innings or after the result there's no over in progress: show the last one instead.
  if (state.status !== "live") {
    if (!state.lastOver) return null;
    return <LastOver over={state.lastOver} bowlerName={bowlerName} />;
  }
  const legal = state.thisOver.filter((c) => !/^(Wd|Nb)/.test(c.label)).length;
  const empty = Math.max(0, 6 - legal);
  const runs = state.thisOver.reduce((s, c) => s + c.runs, 0);
  const last = state.lastOver;

  return (
    <section aria-label="This over" className="flex flex-col gap-2.5 rounded-2xl border border-line bg-surface px-3.5 py-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-bold tracking-[1.2px] text-ink-muted uppercase">This over</h2>
        <span className="text-[13px] text-ink-muted">
          {runs} run{runs === 1 ? "" : "s"}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {state.thisOver.map((c) => (
          <Chip key={c.seq} chip={c} />
        ))}
        {state.status === "live" &&
          Array.from({ length: empty }, (_, i) => (
            <span key={`e${i}`} className="size-[38px] rounded-full border-[1.5px] border-dashed border-line" aria-hidden="true" />
          ))}
      </div>
      {last && (
        <p className="flex flex-wrap items-center gap-x-1.5 text-[13px] text-ink-muted">
          <span>Over {last.number}:</span>
          <span className="font-semibold text-ink">
            {last.chips.map((c, i) => (
              <span key={c.seq} className={c.kind === "wicket" ? "text-wicket" : undefined}>
                {i ? " · " : ""}
                {c.label}
              </span>
            ))}
          </span>
          <span>
            · {last.runs} run{last.runs === 1 ? "" : "s"} · {bowlerName(last.bowler)}
          </span>
        </p>
      )}
    </section>
  );
}
