// One match on the home page: both teams with their scores, LIVE badge, and the one line that
// matters most right now (what's needed in a chase, the run rate, the target, or the result).

import Link from "next/link";
import type { InningsState, MatchState } from "@/engine";
import type { MatchCard as MatchCardData } from "@/lib/db/types";

type Team = MatchCardData["teamA"];

function inningsOf(state: MatchState | null, teamId: string): InningsState | undefined {
  return state?.inningsList.find((i) => i.battingTeam === teamId && (i.legalBalls > 0 || i.runs > 0 || i.wickets > 0));
}

function headline(m: MatchCardData): { text: string; tone: "pitch" | "muted" | "ink" } {
  const s = m.state;
  if (m.status === "finished") return { text: m.result ?? s?.result ?? "Match over", tone: "pitch" };
  if (!s || m.status === "upcoming") return { text: `${m.overs} overs · starts soon`, tone: "muted" };
  if (m.status === "innings_break") return { text: `Innings break · target ${s.target}`, tone: "ink" };
  if (s.innings === 2 && s.runsNeeded !== undefined && s.ballsLeft !== undefined) {
    return { text: `Need ${s.runsNeeded} off ${s.ballsLeft} ball${s.ballsLeft === 1 ? "" : "s"}`, tone: "pitch" };
  }
  return { text: `CRR ${s.crr.toFixed(2)} · Projected ${s.projected}`, tone: "ink" };
}

function TeamRow({ team, innings, batting }: { team: Team; innings?: InningsState; batting: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          className="flex size-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold text-white"
          style={{ background: team.colour }}
          aria-hidden="true"
        >
          {team.shortCode.slice(0, 3)}
        </span>
        <span className={`truncate text-base ${batting ? "font-semibold" : "font-medium text-ink-muted"}`}>{team.name}</span>
      </div>
      {innings ? (
        <span className={`shrink-0 font-score font-bold ${batting ? "text-2xl" : "text-xl text-ink-muted"}`}>
          {innings.runs}/{innings.wickets}{" "}
          <span className="text-[15px] font-semibold text-ink-muted">({innings.overs})</span>
        </span>
      ) : (
        <span className="shrink-0 text-sm text-ink-muted">Yet to bat</span>
      )}
    </div>
  );
}

export function MatchCard({ match }: { match: MatchCardData }) {
  const live = match.status === "live" || match.status === "innings_break";
  const current = match.state?.inningsList.at(-1);
  const battingNow = live ? current?.battingTeam : undefined;
  const line = headline(match);
  const toneClass = line.tone === "pitch" ? "text-pitch" : line.tone === "muted" ? "text-ink-muted" : "text-ink";

  return (
    <Link
      href={`/match/${match.id}`}
      className="block overflow-hidden rounded-2xl border border-line bg-surface transition active:scale-[0.99]"
    >
      <div className="flex h-1" aria-hidden="true">
        <span className="flex-1" style={{ background: match.teamA.colour }} />
        <span className="flex-1" style={{ background: match.teamB.colour }} />
      </div>
      <div className="flex flex-col gap-2.5 px-4 pt-3.5 pb-4">
        <div className="flex items-center justify-between gap-3">
          <span className="truncate text-[13px] text-ink-muted">
            {match.title}
            {match.venue ? ` · ${match.venue}` : ""}
          </span>
          {live && (
            <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-wicket/10 px-2 py-1 text-xs font-bold text-wicket">
              <span className="size-1.5 animate-pulse rounded-full bg-wicket" aria-hidden="true" />
              LIVE
            </span>
          )}
        </div>
        <TeamRow team={match.teamA} innings={inningsOf(match.state, match.teamA.id)} batting={battingNow === match.teamA.id} />
        <TeamRow team={match.teamB} innings={inningsOf(match.state, match.teamB.id)} batting={battingNow === match.teamB.id} />
        <p className={`border-t border-line pt-2.5 text-sm font-semibold ${toneClass}`}>{line.text}</p>
      </div>
    </Link>
  );
}
