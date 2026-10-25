"use client";

// Home: every match, grouped into Live now, Upcoming and Recently finished, with search.
// Scores on the cards update live (see src/lib/realtime.ts).
// Phones show one column of cards; tablets two and desktops three.
// Viewers never log in. Umpires use the "Umpire login" button (or "My matches" once logged in)
// to reach their dashboard, where they create and score matches.

import Link from "next/link";
import { useMemo, useState } from "react";
import type { MatchCard as MatchCardData } from "@/lib/db/types";
import { useMatchList } from "@/hooks/useMatchList";
import { MatchCard } from "@/components/viewer/MatchCard";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { buttonClasses } from "@/components/ui/Button";
import { useUmpireSession } from "@/components/auth/AuthButtons";

const RECENT_DAYS = 7;

function matchesSearch(m: MatchCardData, q: string): boolean {
  if (!q) return true;
  const text = [m.title, m.venue ?? "", m.teamA.name, m.teamA.shortCode, m.teamB.name, m.teamB.shortCode].join(" ").toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .every((word) => text.includes(word));
}

function Section({ title, live, matches, empty }: { title: string; live?: boolean; matches: MatchCardData[]; empty?: string }) {
  if (!matches.length && !empty) return null;
  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <h2 className="flex items-center gap-2 text-[13px] font-bold tracking-[1.2px] text-ink-muted uppercase">
        {live && <span className="size-2 rounded-full bg-wicket shadow-[0_0_0_4px_rgba(200,50,43,0.18)]" aria-hidden="true" />}
        {title}
        {matches.length > 0 && ` · ${matches.length}`}
      </h2>
      {matches.length ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {matches.map((m) => (
            <MatchCard key={m.id} match={m} />
          ))}
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-line px-4 py-5 text-center text-sm text-ink-muted">{empty}</p>
      )}
    </section>
  );
}

export default function HomePage() {
  const { matches, error } = useMatchList();
  const [query, setQuery] = useState("");
  const session = useUmpireSession();

  const groups = useMemo(() => {
    const list = (matches ?? []).filter((m) => matchesSearch(m, query.trim()));
    const cutoff = Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000;
    return {
      live: list.filter((m) => m.status === "live" || m.status === "innings_break"),
      upcoming: list.filter((m) => m.status === "upcoming"),
      finished: list.filter((m) => m.status === "finished" && Date.parse(m.createdAt) >= cutoff),
    };
  }, [matches, query]);

  const nothingFound = matches && query && !groups.live.length && !groups.upcoming.length && !groups.finished.length;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-5 pt-5 pb-10 md:max-w-3xl md:px-8 lg:max-w-6xl">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-[10px] bg-pitch" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="8" />
              <path d="M8.5 6.5c2 3.5 2 7.5 0 11" />
              <path d="M15.5 6.5c-2 3.5-2 7.5 0 11" />
            </svg>
          </span>
          <h1 className="font-score text-2xl font-bold tracking-wide">GullyScore</h1>
        </div>
        <div className="flex gap-2">
          <ThemeToggle />
          <Link
            href={session?.loggedIn ? "/umpire" : "/login"}
            className={buttonClasses(session?.loggedIn ? "primary" : "secondary", "md", "px-3.5 whitespace-nowrap")}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21a8 8 0 0 1 16 0" />
            </svg>
            {session?.loggedIn ? "My matches" : "Umpire login"}
          </Link>
        </div>
      </header>

      <div className="flex h-12 items-center gap-2.5 rounded-xl border border-line bg-surface px-3.5 md:max-w-md">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-ink-muted" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <label htmlFor="search" className="sr-only">
          Search matches
        </label>
        <input
          id="search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search team or match"
          className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-muted"
        />
      </div>

      {error && !matches && (
        <p role="alert" className="rounded-xl bg-wicket/10 px-3 py-2 text-sm font-semibold text-wicket">
          {error}
        </p>
      )}
      {!matches && !error && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2" aria-label="Loading matches">
          {[0, 1].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl bg-surface-2" />
          ))}
        </div>
      )}

      {matches && (
        <>
          <Section title="Live now" live matches={groups.live} empty={query ? undefined : "No matches being played right now."} />
          <Section title="Upcoming" matches={groups.upcoming} />
          <Section title="Recently finished" matches={groups.finished} />
          {nothingFound && <p className="text-center text-ink-muted">No matches found for “{query}”.</p>}
          {matches.length === 0 && (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line px-5 py-8 text-center">
              <p className="font-semibold">No matches yet</p>
              <p className="text-sm text-ink-muted">Umpires log in to set up a match. Everyone can then follow the score live here.</p>
              <Link href="/umpire" className={buttonClasses("primary", "md")}>
                Umpire login
              </Link>
            </div>
          )}
        </>
      )}
    </main>
  );
}
