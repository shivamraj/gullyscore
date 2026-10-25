"use client";

// The scorer screen: top strip + button grid, with sheets for extras, the next bowler and
// the start of the second innings.

import Link from "next/link";
import { useMemo, useState } from "react";
import type { BallEvent, ExtraType, MatchConfig, TeamConfig } from "@/engine";
import { useScorer } from "@/hooks/useScorer";
import { buttonClasses } from "@/components/ui/Button";
import { BowlerPicker, InningsStartSheet } from "./BowlerPicker";
import { ButtonGrid } from "./ButtonGrid";
import { ExtrasPicker } from "./ExtrasPicker";
import { TopStrip } from "./TopStrip";

interface Props {
  matchId: string;
  token: string;
  title: string;
  config: MatchConfig;
  initialBalls: BallEvent[];
}

export function ScorerPanel({ matchId, token, title, config, initialBalls }: Props) {
  const scorer = useScorer({ matchId, token, config, initialBalls });
  const { state, next, sync, notice, setNotice, record, swapStrike, chooseBowler, startInnings } = scorer;
  const [extra, setExtra] = useState<ExtraType | null>(null);
  const [changingBowler, setChangingBowler] = useState(false);

  const nameOf = useMemo(() => {
    const names = new Map([...config.teamA.players, ...config.teamB.players].map((p) => [p.id, p.name]));
    return (id: string) => names.get(id) ?? "Unknown";
  }, [config]);

  const innings = state.inningsList.at(-1)!;
  const team = (id: string): TeamConfig => (config.teamA.id === id ? config.teamA : config.teamB);
  const batting = team(innings.battingTeam);
  const bowling = team(innings.bowlingTeam);
  const finished = state.status === "finished";
  const blocked = Boolean(next.needs) || finished;

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <TopStrip title={title} state={state} next={next} nameOf={nameOf} sync={sync} />

      {notice && (
        <div role="alert" className="mx-4 mt-3 flex items-start gap-3 rounded-xl bg-wicket/10 px-3 py-2.5 text-sm font-semibold text-wicket">
          <span className="flex-1">{notice}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className="font-bold">
            ×
          </button>
        </div>
      )}

      {finished ? (
        <section className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="text-sm font-bold text-pitch">MATCH OVER</p>
          <h2 className="text-2xl font-bold">{state.result}</h2>
          <Link href={`/match/${matchId}`} className={buttonClasses("secondary", "lg")}>
            Open the viewer page
          </Link>
        </section>
      ) : (
        <ButtonGrid
          disabled={blocked}
          onRuns={(runs) => record({ runsBat: runs })}
          onExtra={(type) => setExtra(type)}
          onSwap={swapStrike}
          onChangeBowler={() => setChangingBowler(true)}
        />
      )}

      {extra && (
        <ExtrasPicker
          type={extra}
          onClose={() => setExtra(null)}
          onPick={({ runsBat, extraRuns }) => {
            record({ extraType: extra, runsBat, extraRuns });
            setExtra(null);
          }}
        />
      )}

      {next.needs === "innings-start" && !finished && (
        <InningsStartSheet
          battingTeam={{ name: batting.name, players: state.yetToBat }}
          bowlingTeam={{ name: bowling.name, players: bowling.players }}
          target={state.target}
          onStart={startInnings}
        />
      )}

      {((next.needs === "bowler" && !finished) || changingBowler) && (
        <BowlerPicker
          title={next.needs === "bowler" ? `Over ${Math.floor(state.score.legalBalls / 6) + 1}: who bowls?` : "Change bowler"}
          players={bowling.players}
          figures={innings.bowling}
          blocked={state.lastOverBowler && (next.needs === "bowler" || state.thisOver.length === 0) ? state.lastOverBowler : null}
          current={next.bowler}
          onPick={(id) => {
            chooseBowler(id);
            setChangingBowler(false);
          }}
          onClose={changingBowler ? () => setChangingBowler(false) : undefined}
        />
      )}
    </div>
  );
}
