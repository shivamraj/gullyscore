// Full scorecard: for each innings, batting (with how out), extras, total, fall of wickets, bowling.

import type { InningsState, MatchState } from "@/engine";
import type { ViewerTeam } from "./Scoreboard";

function Innings({ inn, team, didNotBat }: { inn: InningsState; team: ViewerTeam; didNotBat: string[] }) {
  const e = inn.extras;
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-3.5" aria-label={`${team.name} innings`}>
      <h2 className="flex items-center justify-between">
        <span className="flex items-center gap-2 font-bold">
          <span className="size-3 rounded" style={{ background: team.colour }} aria-hidden="true" />
          {team.name}
        </span>
        <span className="font-score text-xl font-bold">
          {inn.runs}/{inn.wickets} <span className="text-sm font-semibold text-ink-muted">({inn.overs} ov)</span>
        </span>
      </h2>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-ink-muted">
            <th className="text-left font-semibold">Batter</th>
            <th className="w-9 text-right font-semibold">R</th>
            <th className="w-8 text-right font-semibold">B</th>
            <th className="w-7 text-right font-semibold">4s</th>
            <th className="w-7 text-right font-semibold">6s</th>
            <th className="w-12 text-right font-semibold">SR</th>
          </tr>
        </thead>
        <tbody>
          {inn.batting.map((b) => (
            <tr key={b.playerId} className="border-t border-line align-top">
              <td className="py-1.5 pr-2">
                <span className="font-semibold">{b.name}</span>
                <span className="block text-xs text-ink-muted">{b.howOut}</span>
              </td>
              <td className="py-1.5 text-right font-bold">{b.runs}</td>
              <td className="py-1.5 text-right text-ink-muted">{b.balls}</td>
              <td className="py-1.5 text-right text-ink-muted">{b.fours}</td>
              <td className="py-1.5 text-right text-ink-muted">{b.sixes}</td>
              <td className="py-1.5 text-right text-ink-muted">{b.strikeRate.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="text-sm">
        <span className="font-semibold">Extras {e.total}</span>{" "}
        <span className="text-ink-muted">
          (wd {e.wides}, nb {e.noballs}, b {e.byes}, lb {e.legbyes})
        </span>
      </p>
      {didNotBat.length > 0 && (
        <p className="text-sm">
          <span className="font-semibold">{inn.complete ? "Did not bat" : "Yet to bat"}</span>{" "}
          <span className="text-ink-muted">{didNotBat.join(", ")}</span>
        </p>
      )}
      {inn.fallOfWickets.length > 0 && (
        <p className="text-sm">
          <span className="font-semibold">Fall of wickets</span>{" "}
          <span className="text-ink-muted">
            {inn.fallOfWickets.map((f) => `${f.runs}-${f.wicket} (${f.name}, ${f.overs})`).join(", ")}
          </span>
        </p>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-ink-muted">
            <th className="text-left font-semibold">Bowler</th>
            <th className="w-9 text-right font-semibold">O</th>
            <th className="w-7 text-right font-semibold">M</th>
            <th className="w-8 text-right font-semibold">R</th>
            <th className="w-7 text-right font-semibold">W</th>
            <th className="w-12 text-right font-semibold">Econ</th>
          </tr>
        </thead>
        <tbody>
          {inn.bowling.map((b) => (
            <tr key={b.playerId} className="border-t border-line">
              <td className="py-1.5 font-semibold">{b.name}</td>
              <td className="py-1.5 text-right text-ink-muted">{b.overs}</td>
              <td className="py-1.5 text-right text-ink-muted">{b.maidens}</td>
              <td className="py-1.5 text-right text-ink-muted">{b.runs}</td>
              <td className="py-1.5 text-right font-bold">{b.wickets}</td>
              <td className="py-1.5 text-right text-ink-muted">{b.economy.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function FullScorecard({ state, teams }: { state: MatchState; teams: Record<string, ViewerTeam> }) {
  const played = state.inningsList.filter((i) => i.batting.length > 0);
  if (!played.length) return <p className="py-8 text-center text-ink-muted">The scorecard appears after the first ball.</p>;
  return (
    <div className="flex flex-col gap-3">
      {played.map((inn) => {
        const team = teams[inn.battingTeam]!;
        const batted = new Set(inn.batting.map((b) => b.playerId));
        const didNotBat = team.players.filter((p) => !batted.has(p.id)).map((p) => p.name);
        return <Innings key={inn.number} inn={inn} team={team} didNotBat={didNotBat} />;
      })}
    </div>
  );
}
