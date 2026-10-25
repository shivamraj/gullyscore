"use client";

// Recording a wicket, in one sheet:
//   1. How out (only the dismissals possible on this ball; a free hit allows only run out and retired)
//   2. Fielder (caught, run out, stumped)
//   3. Who's out and runs completed (run out), or who retired
//   4. Incoming batter (next in the batting order is pre-selected)

import { useState } from "react";
import { allowedWickets, type BallEvent, type Player, type WicketType } from "@/engine";
import { Button } from "@/components/ui/Button";
import { Sheet } from "./ExtrasPicker";

const LABELS: Record<WicketType, string> = {
  bowled: "Bowled",
  caught: "Caught",
  lbw: "LBW",
  runout: "Run out",
  stumped: "Stumped",
  hitwicket: "Hit wicket",
  retired: "Retired",
};

const chip =
  "min-h-12 rounded-xl border bg-surface px-3 text-[15px] font-semibold transition border-line " +
  "aria-pressed:border-2 aria-pressed:border-wicket aria-pressed:bg-wicket/10";
const personChip =
  "min-h-11 rounded-full border bg-surface px-4 text-[15px] border-line " +
  "aria-pressed:border-2 aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-ground";

interface Props {
  striker: Player;
  nonStriker: Player | null;
  bowler: Player;
  fielders: Player[];
  yetToBat: Player[];
  /** False when this wicket ends the innings (side all out), so nobody comes in. */
  needsIncoming: boolean;
  freeHit: boolean;
  onSave: (input: { runsBat: number; wicket: NonNullable<BallEvent["wicket"]> }) => void;
  onClose: () => void;
}

export function WicketFlow({ striker, nonStriker, bowler, fielders, yetToBat, needsIncoming, freeHit, onSave, onClose }: Props) {
  const types = allowedWickets({ seq: 0, innings: 1, striker: "", nonStriker: null, bowler: "", runsBat: 0, extraRuns: 0 }, freeHit);
  const [type, setType] = useState<WicketType | null>(null);
  const [fielder, setFielder] = useState<string | null>(null);
  const [playerOut, setPlayerOut] = useState<string>(striker.id);
  const [runs, setRuns] = useState(0);
  const [incoming, setIncoming] = useState<string | null>(yetToBat[0]?.id ?? null);

  const needsFielder = type === "caught" || type === "runout" || type === "stumped";
  const choosesWhoIsOut = type === "runout" || type === "retired";
  const outName = playerOut === striker.id ? striker.name : (nonStriker?.name ?? "");
  const ready = type !== null && (!needsIncoming || incoming !== null);

  function save() {
    if (!type) return;
    const wicket: NonNullable<BallEvent["wicket"]> = { type, playerOut: choosesWhoIsOut ? playerOut : striker.id };
    // Caught with no fielder picked = caught and bowled.
    const f = type === "caught" ? (fielder ?? bowler.id) : fielder;
    if (needsFielder && f) wicket.fielder = f;
    if (needsIncoming && incoming) wicket.incoming = incoming;
    onSave({ runsBat: type === "runout" ? runs : 0, wicket });
  }

  return (
    <Sheet title="Wicket" onClose={onClose}>
      {freeHit && <p className="rounded-xl bg-gold/15 px-3 py-2 text-sm font-semibold text-gold-ink">Free hit: only a run out is possible.</p>}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-bold text-ink-muted">1 · How out?</legend>
        <div className="grid grid-cols-3 gap-2">
          {types.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={type === t}
              onClick={() => {
                setType(t);
                setFielder(null);
                setPlayerOut(striker.id);
                setRuns(0);
              }}
              className={chip}
            >
              {LABELS[t]}
            </button>
          ))}
        </div>
      </fieldset>

      {needsFielder && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-bold text-ink-muted">
            2 · {type === "caught" ? "Caught by" : type === "stumped" ? "Stumped by (keeper)" : "Run out by (optional)"}
          </legend>
          <div className="flex flex-wrap gap-2">
            {fielders.map((p) => (
              <button key={p.id} type="button" aria-pressed={fielder === p.id} onClick={() => setFielder(p.id)} className={personChip}>
                {p.name}
                {p.id === bowler.id ? " (bowler)" : ""}
              </button>
            ))}
          </div>
          {type === "caught" && !fielder && <p className="text-sm text-ink-muted">No fielder picked = caught and bowled by {bowler.name}.</p>}
        </fieldset>
      )}

      {choosesWhoIsOut && nonStriker && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-bold text-ink-muted">{type === "retired" ? "Who retired?" : "Who is out?"}</legend>
          <div className="grid grid-cols-2 gap-2">
            {[striker, nonStriker].map((p, i) => (
              <button key={p.id} type="button" aria-pressed={playerOut === p.id} onClick={() => setPlayerOut(p.id)} className={chip}>
                {p.name}
                <span className="block text-xs font-normal text-ink-muted">{i === 0 ? "striker" : "non-striker"}</span>
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {type === "runout" && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-bold text-ink-muted">Runs completed before the run out</legend>
          <div className="grid grid-cols-4 gap-2">
            {[0, 1, 2, 3].map((n) => (
              <button key={n} type="button" aria-pressed={runs === n} onClick={() => setRuns(n)} className={`${chip} font-score text-xl`}>
                {n}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {type && needsIncoming && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-bold text-ink-muted">Next batter</legend>
          <div className="flex flex-wrap gap-2">
            {yetToBat.map((p, i) => (
              <button key={p.id} type="button" aria-pressed={incoming === p.id} onClick={() => setIncoming(p.id)} className={personChip}>
                {p.name}
                {i === 0 ? " · next in order" : ""}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      {type && !needsIncoming && <p className="text-sm font-semibold text-ink-muted">This is the last wicket: the innings ends.</p>}

      <Button variant="danger" size="lg" disabled={!ready} onClick={save}>
        {type ? `Save: ${type === "retired" ? `${outName} retired` : `${outName} ${LABELS[type].toLowerCase()}`}` : "Pick how out"}
      </Button>
    </Sheet>
  );
}
