"use client";

// Editable list of players: name and role per row, add and remove.
// Used when creating or editing a saved team, and for a quick team typed in at match setup.

import { useState } from "react";
import { newId } from "@/lib/apiClient";
import type { PlayerInput, PlayerRole } from "@/lib/db/types";
import { Button } from "@/components/ui/Button";

const ROLES: { value: PlayerRole | ""; label: string }[] = [
  { value: "", label: "Role" },
  { value: "batter", label: "Batter" },
  { value: "bowler", label: "Bowler" },
  { value: "allrounder", label: "All-rounder" },
  { value: "keeper", label: "Keeper" },
];

interface Props {
  players: PlayerInput[];
  onChange: (players: PlayerInput[]) => void;
  /** Optional cap, e.g. players per side for a quick team. */
  max?: number;
}

export function PlayerList({ players, onChange, max = 30 }: Props) {
  const [draft, setDraft] = useState("");

  const update = (id: string, patch: Partial<PlayerInput>) =>
    onChange(players.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const remove = (id: string) => onChange(players.filter((p) => p.id !== id));
  const add = () => {
    const name = draft.trim();
    if (!name || players.length >= max) return;
    onChange([...players, { id: newId(), name }]);
    setDraft("");
  };

  return (
    <div className="flex flex-col gap-2">
      <ol className="flex flex-col gap-2">
        {players.map((p, i) => (
          <li key={p.id} className="flex items-center gap-2">
            <span className="w-6 shrink-0 text-right text-sm font-semibold text-ink-muted">{i + 1}</span>
            <label className="sr-only" htmlFor={`name-${p.id}`}>
              Player {i + 1} name
            </label>
            <input
              id={`name-${p.id}`}
              value={p.name}
              maxLength={40}
              onChange={(e) => update(p.id, { name: e.target.value })}
              className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-[15px] text-ink"
            />
            <label className="sr-only" htmlFor={`role-${p.id}`}>
              Player {i + 1} role
            </label>
            <select
              id={`role-${p.id}`}
              value={p.role ?? ""}
              onChange={(e) => update(p.id, { role: (e.target.value || undefined) as PlayerRole | undefined })}
              className="h-11 w-28 rounded-xl border border-line bg-surface px-2 text-sm text-ink"
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => remove(p.id)}
              aria-label={`Remove ${p.name || `player ${i + 1}`}`}
              className="flex size-11 shrink-0 items-center justify-center rounded-xl text-ink-muted hover:bg-surface-2"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </li>
        ))}
      </ol>

      {players.length < max && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <label className="sr-only" htmlFor="new-player">
            New player name
          </label>
          <input
            id="new-player"
            value={draft}
            maxLength={40}
            placeholder="Add player name"
            onChange={(e) => setDraft(e.target.value)}
            className="h-11 min-w-0 flex-1 rounded-xl border border-dashed border-line bg-transparent px-3 text-[15px] text-ink placeholder:text-ink-muted"
          />
          <Button type="submit" variant="secondary" disabled={!draft.trim()}>
            Add
          </Button>
        </form>
      )}
      <p className="text-sm text-ink-muted">
        {players.length} player{players.length === 1 ? "" : "s"}
        {max < 30 ? ` of ${max}` : ""}
      </p>
    </div>
  );
}
