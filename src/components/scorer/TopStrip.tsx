// Always-visible summary at the top of the scorer screen, so the scorer can confirm every tap:
// score, overs, chase, both batters (★ = on strike), bowler figures, this over, sync status,
// and how many people are watching.

import Link from "next/link";
import type { BallChip, MatchState } from "@/engine";
import type { NextBall } from "@/hooks/useScorer";
import type { SyncStatus } from "@/lib/scorer/ballQueue";
import { ViewerCount } from "@/components/ui/ViewerCount";

const CHIP: Record<BallChip["kind"], string> = {
  dot: "bg-white/10",
  run: "bg-white/15",
  four: "bg-[#b7830f] text-white",
  six: "bg-gold text-[#1a1200]",
  extra: "border border-gold text-gold",
  wicket: "bg-wicket text-white",
};

function SyncBadge({ sync }: { sync: SyncStatus }) {
  const map = {
    saved: { dot: "bg-emerald-400", text: "Saved" },
    sending: { dot: "bg-amber-300 animate-pulse", text: sync.kind === "sending" && sync.count === 0 ? "Checking…" : "Saving…" },
    offline: { dot: "bg-amber-400", text: "Offline · will retry" },
    error: { dot: "bg-red-400", text: "Not saved" },
  } as const;
  const s = map[sync.kind];
  const count = (sync.kind === "sending" || sync.kind === "offline") && sync.count > 0 ? ` (${sync.count})` : "";
  return (
    <span className="flex items-center gap-1.5 font-semibold" role="status">
      <span className={`size-2 rounded-full ${s.dot}`} aria-hidden="true" />
      {s.text}
      {count}
    </span>
  );
}

interface Props {
  matchId: string;
  title: string;
  state: MatchState;
  next: NextBall;
  nameOf: (id: string) => string;
  sync: SyncStatus;
}

export function TopStrip({ matchId, title, state, next, nameOf, sync }: Props) {
  const line = (id: string | null) => {
    if (!id) return null;
    const b = [state.striker, state.nonStriker].find((x) => x?.playerId === id);
    return { name: nameOf(id), runs: b?.runs ?? 0, balls: b?.balls ?? 0 };
  };
  const striker = line(next.striker);
  const nonStriker = line(next.nonStriker);
  const bowlerFigures = state.bowler && state.bowler.playerId === next.bowler ? state.bowler : null;
  const short = (n: string) => (n.length > 12 ? `${n.slice(0, 11)}…` : n);

  return (
    <section className="flex flex-col gap-2.5 bg-[#0f1a14] px-4 pt-4 pb-3.5 text-white md:landscape:h-full md:landscape:gap-4 md:landscape:p-6">
      <div className="flex items-center justify-between text-[13px] text-white/70">
        <span className="flex items-center gap-1.5">
          <Link
            href="/umpire"
            aria-label="Back to my matches"
            className="-ml-2 flex size-9 items-center justify-center rounded-lg text-white/80 hover:bg-white/10"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </Link>
          <SyncBadge sync={sync} />
        </span>
        <span className="min-w-0 flex-1 truncate px-2 text-center">{title}</span>
        <span className="flex shrink-0 items-center gap-3">
          <ViewerCount matchId={matchId} role="scorer" />
          {state.target !== undefined ? <span>Target {state.target}</span> : <span>Innings {state.innings}</span>}
        </span>
      </div>

      <div className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-2">
          <span className="font-score text-[56px] leading-[0.9] font-bold">
            {state.score.runs}/{state.score.wickets}
          </span>
          <span className="font-score text-[22px] font-semibold text-white/70">{state.score.overs}</span>
        </div>
        {state.status === "live" && state.runsNeeded !== undefined && (
          <span className="text-sm font-semibold text-emerald-300">
            {state.runsNeeded} off {state.ballsLeft}
          </span>
        )}
        {state.freeHit && <span className="rounded-md bg-gold px-2 py-0.5 text-xs font-bold text-[#1a1200]">FREE HIT</span>}
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        {[striker, nonStriker].map((b, i) => (
          <div
            key={i}
            className={`flex items-center justify-between rounded-[10px] bg-white/10 px-2.5 py-2 ${
              i === 0 && b ? "outline-[1.5px] outline-emerald-400 outline" : ""
            }`}
          >
            {b ? (
              <>
                <span className={i === 0 ? "font-bold" : ""}>
                  {i === 0 ? "★ " : ""}
                  {short(b.name)}
                </span>
                <span className="font-score text-[17px] font-bold">
                  {b.runs} ({b.balls})
                </span>
              </>
            ) : (
              <span className="text-white/50">{i === 0 ? "Striker?" : "—"}</span>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm text-white/70">
          {next.bowler ? nameOf(next.bowler) : "Pick a bowler"}
          {bowlerFigures && ` · ${bowlerFigures.overs}-${bowlerFigures.maidens}-${bowlerFigures.runs}-${bowlerFigures.wickets}`}
        </span>
        <div className="flex gap-1" aria-label="This over">
          {state.thisOver.map((c) => (
            <span
              key={c.seq}
              className={`flex h-[26px] min-w-[26px] items-center justify-center rounded-full px-1 text-[11px] font-bold ${CHIP[c.kind]}`}
            >
              {c.label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
