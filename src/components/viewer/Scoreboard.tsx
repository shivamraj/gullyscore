"use client";

// The viewer's match page: live score card, run rates, this over, batters and bowler,
// partnership and next batters, and a Scorecard tab. Updates live through useLiveMatch.
// Every ball gets a short animation and sound (LiveEffects), and the header shows how many
// people are watching.
//
// Layout: phones show Live and Scorecard as tabs. From 768 px wide (tablets, desktop and phones
// in landscape) the scorecard sits beside the live view, so there are no tabs.

import Link from "next/link";
import { useMemo, useState } from "react";
import type { MatchStatus } from "@/engine";
import { useLiveMatch } from "@/hooks/useLiveMatch";
import type { StateRow } from "@/lib/realtime";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { ViewerCount } from "@/components/ui/ViewerCount";
import { AskButton } from "./AskButton";
import { BattersCard } from "./BattersCard";
import { BowlerCard } from "./BowlerCard";
import { FullScorecard } from "./FullScorecard";
import { EventBanner, SoundToggle, useLiveEffects } from "./LiveEffects";
import { OverChips } from "./OverChips";
import { RatesBar } from "./RatesBar";
import { ScoreHeader } from "./ScoreHeader";
import { YetToBat } from "./YetToBat";

export interface ViewerTeam {
  id: string;
  name: string;
  shortCode: string;
  colour: string;
  players: { id: string; name: string }[];
}

interface Props {
  matchId: string;
  title: string;
  venue: string | null;
  overs: number;
  tossLine: string;
  teams: ViewerTeam[];
  initial: StateRow;
  /** The logged-in umpire created this match: show a button back to the scorer. */
  canScore?: boolean;
}

const STATUS: Record<MatchStatus, { text: string; live: boolean }> = {
  upcoming: { text: "Not started", live: false },
  live: { text: "LIVE", live: true },
  innings_break: { text: "INNINGS BREAK", live: true },
  finished: { text: "RESULT", live: false },
};

export function Scoreboard({ matchId, title, venue, overs, tossLine, teams, initial, canScore = false }: Props) {
  const { state } = useLiveMatch(matchId, initial);
  const [tab, setTab] = useState<"live" | "scorecard">("live");
  const byId = useMemo(() => Object.fromEntries(teams.map((t) => [t.id, t])), [teams]);
  const bowlerName = useMemo(() => {
    const names = new Map(teams.flatMap((t) => t.players).map((p) => [p.id, p.name]));
    return (id: string) => names.get(id) ?? "";
  }, [teams]);
  const status = STATUS[state.status];
  const fx = useLiveEffects(state);
  const colourOf = (teamId?: string) => (teamId && byId[teamId]?.colour) || "#0b7a4b";
  const upcoming = state.status === "upcoming";
  // On phones the scorecard is its own tab; after the innings it also shows under the live view.
  const scorecardOnPhone = tab === "scorecard" || (state.status !== "live" && !upcoming);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-2.5 px-4 pt-4 pb-28 md:max-w-3xl md:px-6 lg:max-w-6xl">
      <header className="flex items-center justify-between gap-2 pb-1">
        <Link href="/" aria-label="Back to all matches" className="flex size-11 items-center justify-center rounded-xl border border-line bg-surface">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        <div className="flex min-w-0 flex-col items-center gap-0.5 text-center">
          <span className="flex items-center gap-2 text-xs font-bold">
            <span className={`flex items-center gap-1.5 ${status.live ? "text-wicket" : "text-ink-muted"}`}>
              {status.live && <span className="size-[7px] animate-pulse rounded-full bg-wicket" aria-hidden="true" />}
              {status.text}
            </span>
            <ViewerCount matchId={matchId} role="viewer" className="font-semibold text-ink-muted" />
          </span>
          <h1 className="max-w-[220px] truncate text-[13px] text-ink-muted md:max-w-md">
            {title} · {overs} over{overs === 1 ? "" : "s"}{venue ? ` · ${venue}` : ""}
          </h1>
        </div>
        <div className="flex gap-2">
          <SoundToggle on={fx.soundOn} onToggle={fx.toggleSound} />
          <ThemeToggle />
        </div>
      </header>

      {canScore && (
        <Link
          href={`/score/${matchId}`}
          className="flex min-h-12 items-center justify-between gap-3 rounded-2xl bg-pitch px-4 py-2.5 font-bold text-on-pitch"
        >
          <span className="flex flex-col">
            <span className="text-xs font-semibold opacity-80">You&apos;re the umpire</span>
            <span>{state.status === "finished" ? "Open the scorer" : state.status === "upcoming" ? "Start scoring" : "Score this match"}</span>
          </span>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </Link>
      )}

      <div className="flex flex-col gap-2.5 md:grid md:grid-cols-2 md:items-start md:gap-4 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)]">
        <div className={`flex flex-col gap-2.5 ${upcoming ? "md:col-span-2 md:mx-auto md:w-full md:max-w-xl" : ""}`}>
          <ScoreHeader state={state} teams={byId} tossLine={tossLine} />

          <div role="tablist" aria-label="Match views" className={`grid grid-cols-2 rounded-xl bg-surface-2 p-1 md:hidden ${upcoming ? "hidden" : ""}`}>
            {(["live", "scorecard"] as const).map((t) => (
              <button
                key={t}
                role="tab"
                type="button"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className="h-10 rounded-[9px] text-sm font-semibold text-ink-muted aria-selected:bg-surface aria-selected:font-bold aria-selected:text-ink"
              >
                {t === "live" ? "Live" : "Scorecard"}
              </button>
            ))}
          </div>

          {upcoming ? (
            <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
              <p className="font-semibold">The match hasn&apos;t started yet.</p>
              <p className="text-sm text-ink-muted">This page updates by itself when the first ball is bowled.</p>
              {teams.map((t) => (
                <p key={t.id} className="text-sm">
                  <span className="font-semibold">{t.name}:</span>{" "}
                  <span className="text-ink-muted">{t.players.map((p) => p.name).join(", ")}</span>
                </p>
              ))}
            </section>
          ) : (
            <div className={`flex-col gap-2.5 md:flex ${tab === "live" ? "flex" : "hidden"}`}>
              <RatesBar state={state} />
              <OverChips state={state} bowlerName={bowlerName} />
              {state.status === "live" && (state.striker || state.bowler) && (
                <section aria-label="Batters and bowler" className="flex flex-col gap-2 rounded-2xl border border-line bg-surface px-3.5 py-3">
                  <BattersCard striker={state.striker} nonStriker={state.nonStriker} />
                  <div className="my-0.5 h-px bg-line" />
                  <BowlerCard bowler={state.bowler} />
                </section>
              )}
              <YetToBat state={state} />
            </div>
          )}
        </div>

        {!upcoming && (
          <div className={`flex-col gap-2.5 md:flex ${scorecardOnPhone ? "flex" : "hidden"}`}>
            <FullScorecard state={state} teams={byId} />
          </div>
        )}
      </div>

      <EventBanner event={fx.event} colourOf={colourOf} />
      <AskButton matchId={matchId} />
    </main>
  );
}
