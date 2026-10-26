"use client";

// The scorer screen: top strip + button grid, with sheets for extras, wickets, the next bowler,
// the start of the second innings and the More menu. Undo is always one tap away: in the grid,
// above the bowler / innings sheets, and on the result screen.
// Right after a match is created, a banner offers to share the viewer link.
//
// Layout: one column on phones held upright (wider on tablets). In landscape on a phone, tablet
// or laptop (768 px and wider), the summary sits on the left and the buttons on the right, so
// everything fits on one screen without scrolling.

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
  title: string;
  /** Just created: show the "share with viewers" banner. */
  justCreated?: boolean;
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

/** "Match ready" banner with the public viewer link: share sheet, WhatsApp, or copy. */
function ShareBanner({ matchId, title, onClose }: { matchId: string; title: string; onClose: () => void }) {
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    setUrl(`${window.location.origin}/match/${matchId}`);
    // Drop "?new=1" so a reload doesn't show the banner again.
    window.history.replaceState(null, "", `/score/${matchId}`);
  }, [matchId]);
  const text = `Follow ${title} live on GullyScore: ${url}`;

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title, text: `Follow ${title} live on GullyScore`, url });
        return;
      } catch {
        // cancelled: fall through to copying
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link:", url);
    }
  }

  return (
    <section aria-label="Share with viewers" className="mx-4 mt-3 flex flex-col gap-2.5 rounded-2xl border border-pitch/30 bg-pitch-soft px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold text-pitch">Match ready. You&apos;re the scorer.</p>
          <p className="text-sm text-ink-muted">Share the link so everyone can watch live. It&apos;s also on the home page.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="-mt-1 -mr-1 flex size-9 shrink-0 items-center justify-center rounded-lg text-xl font-bold text-ink-muted">
          ×
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={() => void share()}>{copied ? "Link copied" : "Share link"}</Button>
        <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer" className={buttonClasses("secondary", "md")}>
          WhatsApp
        </a>
      </div>
    </section>
  );
}

export function ScorerPanel({ matchId, title, config: initialConfig, initialBalls, justCreated = false }: Props) {
  const scorer = useScorer({ matchId, config: initialConfig, initialBalls });
  const [sharing, setSharing] = useState(justCreated);
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
    <div className="mx-auto flex min-h-dvh max-w-md flex-col md:max-w-2xl md:landscape:grid md:landscape:h-dvh md:landscape:max-w-6xl md:landscape:grid-cols-2">
      <TopStrip matchId={matchId} title={title} state={state} next={next} nameOf={nameOf} sync={sync} />
      <div className="flex flex-1 flex-col md:landscape:min-h-0 md:landscape:overflow-y-auto">
        {sharing && <ShareBanner matchId={matchId} title={title} onClose={() => setSharing(false)} />}

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
      </div>

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
