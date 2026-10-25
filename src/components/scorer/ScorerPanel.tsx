"use client";

// The scorer screen: top strip + button grid, with sheets for extras, wickets, the next bowler,
// the start of the second innings and the More menu. Undo is always one tap away: in the grid,
// above the bowler / innings sheets, and on the result screen.

import Link from "next/link";
import { useMemo, useState } from "react";
import { maxWickets, type BallEvent, type ExtraType, type MatchConfig, type Player, type TeamConfig } from "@/engine";
import { useScorer } from "@/hooks/useScorer";
import { Button, buttonClasses } from "@/components/ui/Button";
import { BowlerPicker, InningsStartSheet } from "./BowlerPicker";
import { ButtonGrid } from "./ButtonGrid";
import { ExtrasPicker } from "./ExtrasPicker";
import { MoreMenu } from "./MoreMenu";
import { TopStrip } from "./TopStrip";
import { WicketFlow } from "./WicketFlow";

interface Props {
  matchId: string;
  token: string;
  title: string;
  config: MatchConfig;
  initialBalls: BallEvent[];
}

function UndoIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h11a5 5 0 0 1 0 10h-3" />
    </svg>
  );
}

export function ScorerPanel({ matchId, token, title, config: initialConfig, initialBalls }: Props) {
  const scorer = useScorer({ matchId, token, config: initialConfig, initialBalls });
  const { config, state, balls, next, nameOf, sync, notice, setNotice, toast, busy, voice } = scorer;
  const [extra, setExtra] = useState<ExtraType | null>(null);
  const [changingBowler, setChangingBowler] = useState(false);
  const [wicketOpen, setWicketOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const innings = state.inningsList.at(-1)!;
  const team = (id: string): TeamConfig => (config.teamA.id === id ? config.teamA : config.teamB);
  const batting = team(innings.battingTeam);
  const bowling = team(innings.bowlingTeam);
  const finished = state.status === "finished";
  const blocked = Boolean(next.needs) || finished || busy;
  const canUndo = balls.length > 0 && !busy;
  const player = (id: string | null): Player | null => (id ? { id, name: nameOf(id) } : null);

  const needsIncoming = useMemo(
    () => state.yetToBat.length > 0 && state.score.wickets + 1 < maxWickets(config, batting),
    [state, config, batting],
  );
  const ballsThisInnings = balls.filter((b) => b.innings === state.innings).length;

  const undoAboveSheet = (
    <button
      type="button"
      onClick={() => void scorer.undo()}
      disabled={!canUndo}
      className="fixed top-4 right-4 z-50 flex min-h-11 items-center gap-2 rounded-full bg-surface px-4 font-semibold text-ink shadow-lg disabled:opacity-50"
    >
      <UndoIcon />
      Undo last ball
    </button>
  );

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
          <Button variant="ghost" disabled={!canUndo} onClick={() => void scorer.undo()}>
            <UndoIcon />
            Undo last ball
          </Button>
        </section>
      ) : (
        <ButtonGrid
          disabled={blocked}
          onRuns={(runs) => scorer.record({ runsBat: runs })}
          onExtra={(type) => setExtra(type)}
          onWicket={() => setWicketOpen(true)}
          onUndo={canUndo ? () => void scorer.undo() : undefined}
          onSwap={scorer.swapStrike}
          onChangeBowler={() => setChangingBowler(true)}
          onMore={() => setMoreOpen(true)}
        />
      )}

      {toast && (
        <div role="status" className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-ground shadow-lg">
          {toast}
        </div>
      )}

      {extra && (
        <ExtrasPicker
          type={extra}
          onClose={() => setExtra(null)}
          onPick={({ runsBat, extraRuns }) => {
            scorer.record({ extraType: extra, runsBat, extraRuns });
            setExtra(null);
          }}
        />
      )}

      {wicketOpen && next.striker && next.bowler && (
        <WicketFlow
          striker={player(next.striker)!}
          nonStriker={player(next.nonStriker)}
          bowler={player(next.bowler)!}
          fielders={bowling.players}
          yetToBat={state.yetToBat}
          needsIncoming={needsIncoming}
          freeHit={state.freeHit}
          onClose={() => setWicketOpen(false)}
          onSave={(input) => {
            if (!scorer.record(input)) setWicketOpen(false);
          }}
        />
      )}

      {moreOpen && (
        <MoreMenu
          matchId={matchId}
          innings={state.innings}
          canEndInnings={ballsThisInnings > 0 && state.status === "live"}
          busy={busy}
          voice={voice}
          onVoice={scorer.changeVoice}
          onEndInnings={scorer.endInnings}
          onClose={() => setMoreOpen(false)}
        />
      )}

      {next.needs === "innings-start" && !finished && (
        <>
          <InningsStartSheet
            battingTeam={{ name: batting.name, players: state.yetToBat }}
            bowlingTeam={{ name: bowling.name, players: bowling.players }}
            target={state.target}
            onStart={scorer.startInnings}
          />
          {canUndo && undoAboveSheet}
        </>
      )}

      {((next.needs === "bowler" && !finished) || changingBowler) && (
        <>
          <BowlerPicker
            title={next.needs === "bowler" ? `Over ${Math.floor(state.score.legalBalls / 6) + 1}: who bowls?` : "Change bowler"}
            players={bowling.players}
            figures={innings.bowling}
            blocked={state.lastOverBowler && (next.needs === "bowler" || state.thisOver.length === 0) ? state.lastOverBowler : null}
            current={next.bowler}
            onPick={(id) => {
              scorer.chooseBowler(id);
              setChangingBowler(false);
            }}
            onClose={changingBowler ? () => setChangingBowler(false) : undefined}
          />
          {next.needs === "bowler" && canUndo && undoAboveSheet}
        </>
      )}
    </div>
  );
}
