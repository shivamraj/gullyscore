"use client";

// Create or edit a saved team: name, short code, colour and players.
// TeamFields (name, code, colour) is also used for a quick team at match setup.

import { useState } from "react";
import { api } from "@/lib/apiClient";
import type { PlayerInput, Team } from "@/lib/db/types";
import { Button } from "@/components/ui/Button";
import { PlayerList } from "./PlayerList";

export const TEAM_COLOURS = ["#1E6FD9", "#E2711D", "#0B7A4B", "#C8322B", "#7A3FD1", "#0E9AA7", "#B7830F", "#3E4A42"];

/** "Riverside XI" → "RIX", "Hilltop Strikers" → "HIL" */
export function suggestShortCode(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2 && words[1]!.length <= 3) return (words[0]!.slice(0, 2) + words[1]![0]).toUpperCase();
  return (words[0] ?? "").slice(0, 3).toUpperCase();
}

export interface TeamFieldsValue {
  name: string;
  shortCode: string;
  colour: string;
}

export function TeamFields({
  value,
  onChange,
  idPrefix,
}: {
  value: TeamFieldsValue;
  onChange: (v: TeamFieldsValue) => void;
  idPrefix: string;
}) {
  const [codeTouched, setCodeTouched] = useState(Boolean(value.shortCode));

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-[1fr_88px] gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${idPrefix}-name`} className="text-sm font-bold text-ink-muted">
            Team name
          </label>
          <input
            id={`${idPrefix}-name`}
            value={value.name}
            maxLength={60}
            placeholder="e.g. Riverside XI"
            onChange={(e) => {
              const name = e.target.value;
              onChange({ ...value, name, shortCode: codeTouched ? value.shortCode : suggestShortCode(name) });
            }}
            className="h-12 rounded-xl border border-line bg-surface px-3 text-base text-ink"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${idPrefix}-code`} className="text-sm font-bold text-ink-muted">
            Code
          </label>
          <input
            id={`${idPrefix}-code`}
            value={value.shortCode}
            maxLength={6}
            onChange={(e) => {
              setCodeTouched(true);
              onChange({ ...value, shortCode: e.target.value.toUpperCase() });
            }}
            className="h-12 rounded-xl border border-line bg-surface px-3 text-base font-semibold uppercase text-ink"
          />
        </div>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-bold text-ink-muted">Team colour</legend>
        <div className="flex flex-wrap gap-2">
          {TEAM_COLOURS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Colour ${c}`}
              aria-pressed={value.colour.toUpperCase() === c}
              onClick={() => onChange({ ...value, colour: c })}
              className="size-11 rounded-xl border-2 transition aria-pressed:scale-105 aria-pressed:border-ink"
              style={{ background: c, borderColor: value.colour.toUpperCase() === c ? undefined : "transparent" }}
            />
          ))}
        </div>
      </fieldset>
    </div>
  );
}

interface Props {
  /** Existing team to edit; omit to create a new one. */
  initial?: Team;
  onSaved: (team: Team) => void;
  onCancel: () => void;
}

export function TeamForm({ initial, onSaved, onCancel }: Props) {
  const [fields, setFields] = useState<TeamFieldsValue>({
    name: initial?.name ?? "",
    shortCode: initial?.shortCode ?? "",
    colour: initial?.colour ?? TEAM_COLOURS[0]!,
  });
  const [players, setPlayers] = useState<PlayerInput[]>(initial?.players ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = fields.name.trim() && fields.shortCode.trim() && players.every((p) => p.name.trim());

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const { team } = await api<{ team: Team }>("/api/teams", {
        method: "POST",
        body: { id: initial?.id, ...fields, players: players.map((p) => ({ ...p, name: p.name.trim() })) },
      });
      onSaved(team);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the team.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-4">
      <h2 className="text-lg font-bold">{initial ? `Edit ${initial.name}` : "New team"}</h2>
      <TeamFields value={fields} onChange={setFields} idPrefix="team" />
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-bold text-ink-muted">Players</h3>
        <PlayerList players={players} onChange={setPlayers} />
      </div>
      {error && (
        <p role="alert" className="rounded-xl bg-wicket/10 px-3 py-2 text-sm font-semibold text-wicket">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button variant="secondary" onClick={onCancel} className="flex-1">
          Cancel
        </Button>
        <Button onClick={save} disabled={!canSave || saving} className="flex-[2]">
          {saving ? "Saving…" : "Save team"}
        </Button>
      </div>
    </section>
  );
}
