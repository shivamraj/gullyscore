"use client";

// /teams — the scorer's saved teams. Create a team, or tap one to edit its players.

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/apiClient";
import type { Team } from "@/lib/db/types";
import { Button, buttonClasses } from "@/components/ui/Button";
import { TeamForm } from "@/components/setup/TeamForm";

export default function TeamsPage() {
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Team | "new" | null>(null);

  useEffect(() => {
    api<{ teams: Team[] }>("/api/teams")
      .then((r) => setTeams(r.teams))
      .catch((e: Error) => setError(e.message));
  }, []);

  function onSaved(team: Team) {
    setTeams((list) => [team, ...(list ?? []).filter((t) => t.id !== team.id)]);
    setEditing(null);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-4 py-5">
      <header className="flex items-center gap-3">
        <Link href="/" aria-label="Back to home" className={buttonClasses("secondary", "md", "w-11 px-0")}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        <h1 className="flex-1 text-xl font-bold">My teams</h1>
        {editing === null && <Button onClick={() => setEditing("new")}>New team</Button>}
      </header>

      {editing !== null && (
        <TeamForm initial={editing === "new" ? undefined : editing} onSaved={onSaved} onCancel={() => setEditing(null)} />
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-wicket/10 px-3 py-2 text-sm font-semibold text-wicket">
          {error}
        </p>
      )}
      {teams === null && !error && <p className="text-ink-muted">Loading teams…</p>}
      {teams?.length === 0 && editing === null && (
        <p className="rounded-2xl border border-dashed border-line p-5 text-center text-ink-muted">
          No saved teams yet. Create one to reuse it in every match.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {teams?.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => setEditing(t)}
              className="flex min-h-16 w-full items-center gap-3 rounded-2xl border border-line bg-surface px-4 text-left"
            >
              <span
                className="flex size-10 items-center justify-center rounded-xl text-xs font-bold text-white"
                style={{ background: t.colour }}
              >
                {t.shortCode}
              </span>
              <span className="flex flex-1 flex-col">
                <span className="font-semibold">{t.name}</span>
                <span className="text-sm text-ink-muted">{t.players.length} players</span>
              </span>
              <span className="text-sm font-semibold text-pitch">Edit</span>
            </button>
          </li>
        ))}
      </ul>

      <Link href="/match/new" className={buttonClasses("primary", "lg", "mt-auto")}>
        Start a new match
      </Link>
    </main>
  );
}
