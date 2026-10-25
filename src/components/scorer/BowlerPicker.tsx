"use client";

// Picking players on the scorer screen:
// - BowlerPicker: next bowler at the end of an over, or a change mid-over.
//   The bowler of the last over is shown but can't be picked.
// - InningsStartSheet: the two openers and the opening bowler for innings 2.

import { useState } from "react";
import type { BowlerLine, Player } from "@/engine";
import { Button } from "@/components/ui/Button";
import { Sheet } from "./ExtrasPicker";

interface BowlerProps {
  title: string;
  players: Player[];
  /** This innings' bowling figures, to show next to each name. */
  figures: BowlerLine[];
  blocked: string | null;
  current: string | null;
  onPick: (id: string) => void;
  onClose?: () => void;
}

export function BowlerPicker({ title, players, figures, blocked, current, onPick, onClose }: BowlerProps) {
  const fig = new Map(figures.map((f) => [f.playerId, f]));
  // Bowlers who have already bowled first, then everyone else.
  const sorted = [...players].sort((a, b) => Number(fig.has(b.id)) - Number(fig.has(a.id)));

  return (
    <Sheet title={title} onClose={onClose}>
      <ul className="flex flex-col gap-1.5">
        {sorted.map((p) => {
          const f = fig.get(p.id);
          const isBlocked = p.id === blocked;
          return (
            <li key={p.id}>
              <button
                type="button"
                disabled={isBlocked}
                onClick={() => onPick(p.id)}
                className={`flex min-h-14 w-full items-center justify-between rounded-2xl border px-4 text-left disabled:opacity-45 ${
                  p.id === current ? "border-2 border-pitch bg-pitch-soft" : "border-line bg-surface"
                }`}
              >
                <span className="flex flex-col">
                  <span className="font-semibold">{p.name}</span>
                  {isBlocked && <span className="text-xs text-ink-muted">Bowled the last over</span>}
                </span>
                {f && (
                  <span className="font-score text-lg font-bold text-ink-muted">
                    {f.overs}-{f.maidens}-{f.runs}-{f.wickets}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}

interface InningsProps {
  battingTeam: { name: string; players: Player[] };
  bowlingTeam: { name: string; players: Player[] };
  target?: number;
  onStart: (striker: string, nonStriker: string, bowler: string) => void;
}

export function InningsStartSheet({ battingTeam, bowlingTeam, target, onStart }: InningsProps) {
  const [striker, setStriker] = useState(battingTeam.players[0]?.id ?? "");
  const [nonStriker, setNonStriker] = useState(battingTeam.players[1]?.id ?? "");
  const [bowler, setBowler] = useState("");
  const ok = striker && nonStriker && bowler && striker !== nonStriker;

  const select = (id: string, label: string, value: string, set: (v: string) => void, list: Player[]) => (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-bold text-ink-muted">
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => set(e.target.value)} className="h-12 rounded-xl border border-line bg-surface px-3 text-base">
        <option value="">Choose</option>
        {list.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <Sheet title="Start the second innings">
      {target !== undefined && (
        <p className="rounded-xl bg-pitch-soft px-4 py-3 font-semibold text-pitch">
          {battingTeam.name} need {target} to win.
        </p>
      )}
      {select("s2-striker", `On strike (${battingTeam.name})`, striker, setStriker, battingTeam.players)}
      {select("s2-non", "Non-striker", nonStriker, setNonStriker, battingTeam.players)}
      {select("s2-bowler", `Opening bowler (${bowlingTeam.name})`, bowler, setBowler, bowlingTeam.players)}
      {striker && striker === nonStriker && <p className="text-sm font-semibold text-wicket">Pick two different batters.</p>}
      <Button size="lg" disabled={!ok} onClick={() => onStart(striker, nonStriker, bowler)}>
        Start innings
      </Button>
    </Sheet>
  );
}
