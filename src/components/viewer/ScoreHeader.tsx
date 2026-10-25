// The big score card at the top of the match page: batting team, score, overs, and the one line
// that matters (target and what's needed, the innings break, or the result).

import type { MatchState } from "@/engine";
import type { ViewerTeam } from "./Scoreboard";

export function ScoreHeader({ state, teams, tossLine }: { state: MatchState; teams: Record<string, ViewerTeam>; tossLine: string }) {
  const innings = state.inningsList.at(-1)!;
  const batting = teams[innings.battingTeam]!;
  const first = state.inningsList[0]!;
  const upcoming = state.status === "upcoming";

  let line: { text: string; tone: "good" | "plain" } | null = null;
  if (state.status === "finished") line = { text: state.result ?? "Match over", tone: "good" };
  else if (state.status === "innings_break") line = { text: `Innings break · ${batting.name} need ${state.target} to win`, tone: "good" };
  else if (state.innings === 2 && state.runsNeeded !== undefined)
    line = { text: `Need ${state.runsNeeded} run${state.runsNeeded === 1 ? "" : "s"} off ${state.ballsLeft} ball${state.ballsLeft === 1 ? "" : "s"}`, tone: "good" };
  else if (upcoming) line = { text: tossLine, tone: "plain" };

  return (
    <section className="flex flex-col gap-2.5 rounded-[20px] bg-scoreboard p-4 pb-[18px] text-white" aria-label="Score">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2">
          <span className="size-2.5 rounded-[3px]" style={{ background: batting.colour }} aria-hidden="true" />
          {batting.name}
        </span>
        {state.target !== undefined ? (
          <span className="text-white/70">Target {state.target}</span>
        ) : (
          state.inningsList.length > 1 && <span className="text-white/70">{teams[first.battingTeam]!.shortCode} {first.runs}/{first.wickets}</span>
        )}
      </div>
      <div className="flex items-baseline gap-2.5">
        <span className="font-score text-[72px] leading-[0.9] font-bold tracking-tight">
          {state.score.runs}/{state.score.wickets}
        </span>
        <span className="font-score text-2xl font-semibold text-white/70">{state.score.overs} ov</span>
        {state.freeHit && <span className="ml-auto rounded-md bg-gold px-2 py-0.5 text-xs font-bold text-[#1a1200]">FREE HIT</span>}
      </div>
      {line && (
        <p className={`rounded-xl bg-white/10 px-3 py-2.5 font-semibold ${line.tone === "good" ? "text-emerald-300" : "text-white/80"}`}>{line.text}</p>
      )}
    </section>
  );
}
