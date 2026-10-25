// /umpire — the umpire's dashboard: their matches (live first) with Score buttons, New match,
// and My teams.
// Only for logged-in umpires; everyone else is sent to the login page.

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ClaimDeviceMatches, SignOutButton } from "@/components/auth/AuthButtons";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { buttonClasses } from "@/components/ui/Button";
import { MatchCard } from "@/components/viewer/MatchCard";
import { claimDeviceMatches, listMatches } from "@/lib/db/matches";
import type { MatchCard as MatchCardData } from "@/lib/db/types";
import { currentUmpire } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My matches" };

/** Server action: move this phone's earlier matches and teams to the logged-in umpire. */
async function claim(deviceKey: string): Promise<number> {
  "use server";
  const umpire = await currentUmpire();
  if (!umpire) return 0;
  return claimDeviceMatches(umpire.id, deviceKey);
}

function Group({ title, matches }: { title: string; matches: MatchCardData[] }) {
  if (!matches.length) return null;
  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <h2 className="text-[13px] font-bold tracking-[1.2px] text-ink-muted uppercase">
        {title} · {matches.length}
      </h2>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {matches.map((m) => (
          <div key={m.id} className="flex flex-col gap-2">
            <MatchCard match={m} />
            <div className="grid grid-cols-2 gap-2">
              <Link href={`/score/${m.id}`} className={buttonClasses(m.status === "finished" ? "secondary" : "primary", "md")}>
                {m.status === "finished" ? "Open scorer" : m.status === "upcoming" ? "Start scoring" : "Score"}
              </Link>
              <Link href={`/match/${m.id}`} className={buttonClasses("secondary", "md")}>
                Viewer page
              </Link>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default async function UmpireDashboard() {
  const umpire = await currentUmpire();
  if (!umpire) redirect("/login?next=/umpire");

  const matches = await listMatches(undefined, 100, umpire.id);
  const live = matches.filter((m) => m.status === "live" || m.status === "innings_break");
  const upcoming = matches.filter((m) => m.status === "upcoming");
  const finished = matches.filter((m) => m.status === "finished");

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-5 pt-5 pb-10 md:max-w-3xl md:px-8 lg:max-w-6xl">
      <header className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/" aria-label="Back to all matches" className={buttonClasses("secondary", "md", "w-11 shrink-0 px-0")}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </Link>
          {umpire.avatarUrl ? (
            <img src={umpire.avatarUrl} alt="" width={40} height={40} referrerPolicy="no-referrer" className="size-10 shrink-0 rounded-full" />
          ) : (
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-pitch font-bold text-on-pitch" aria-hidden="true">
              {umpire.name.slice(0, 1).toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <p className="text-xs font-semibold text-ink-muted">Umpire</p>
            <h1 className="truncate text-lg leading-tight font-bold">{umpire.name}</h1>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <ThemeToggle />
          <SignOutButton />
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 md:max-w-md">
        <Link href="/match/new" className={buttonClasses("primary", "lg")}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New match
        </Link>
        <Link href="/teams" className={buttonClasses("secondary", "lg")}>
          My teams
        </Link>
      </div>

      {matches.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line px-5 py-8 text-center">
          <p className="font-semibold">No matches yet</p>
          <p className="text-sm text-ink-muted">Tap New match to set one up. Viewers can follow it live from the home page.</p>
        </div>
      ) : (
        <>
          <Group title="Live now" matches={live} />
          <Group title="Upcoming" matches={upcoming} />
          <Group title="Finished" matches={finished} />
        </>
      )}

      <ClaimDeviceMatches claim={claim} />
    </main>
  );
}
