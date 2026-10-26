// /match/[matchId] — the public page viewers open from the shared link.
// The server sends the latest saved state so the score shows instantly; then it updates live.
// If the logged-in umpire created this match, the page also offers a way back to scoring.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { computeState } from "@/engine";
import { isMatchOwner } from "@/lib/db/balls";
import { getMatchConfig } from "@/lib/db/matches";
import { ApiError } from "@/lib/db/types";
import { currentUmpire } from "@/lib/supabase/auth";
import { getServerSupabase } from "@/lib/supabase/server";
import { Scoreboard, type ViewerTeam } from "@/components/viewer/Scoreboard";

export const dynamic = "force-dynamic";

// cache(): the page and its <title> (generateMetadata) share one load per request instead of two.
const load = cache(async function load(matchId: string) {
  try {
    const { match, config } = await getMatchConfig(matchId);
    const db = getServerSupabase();
    const [colours, cache] = await Promise.all([
      db.from("teams").select("id, colour").in("id", [match.team_a, match.team_b]),
      db.from("match_state_cache").select("state, updated_at").eq("match_id", matchId).maybeSingle(),
    ]);
    if (colours.error) throw colours.error;
    if (cache.error) throw cache.error;
    const colourOf = new Map((colours.data as { id: string; colour: string }[]).map((t) => [t.id, t.colour]));
    const teams: ViewerTeam[] = [config.teamA, config.teamB].map((t) => ({
      id: t.id,
      name: t.name,
      shortCode: t.shortCode,
      colour: colourOf.get(t.id) ?? "#3E4A42",
      players: t.players,
    }));
    const toss = teams.find((t) => t.id === match.toss_winner)?.name ?? "";
    // The cache is written on every change; fall back to the engine if it's ever missing.
    const initial = cache.data ?? { state: computeState(config, []), updated_at: new Date(0).toISOString() };
    return { match, teams, tossLine: `${toss} won the toss and chose to ${match.toss_decision}`, initial };
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
});

/** Did the logged-in umpire (if any) create this match? Never breaks the public page. */
async function viewerCanScore(matchId: string): Promise<boolean> {
  try {
    const umpire = await currentUmpire();
    return umpire ? await isMatchOwner(matchId, umpire.id) : false;
  } catch {
    return false;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ matchId: string }> }): Promise<Metadata> {
  const { matchId } = await params;
  const data = await load(matchId).catch(() => null);
  if (!data) return { title: "Match not found" };
  const [a, b] = data.teams;
  return {
    title: `${a!.name} vs ${b!.name}`,
    description: `${data.match.title}: live score, scorecard and answers to your questions.`,
  };
}

export default async function MatchPage({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  // The match and the umpire check run at the same time.
  const [data, canScore] = await Promise.all([load(matchId), viewerCanScore(matchId)]);
  if (!data) notFound();
  return (
    <Scoreboard
      matchId={matchId}
      title={data.match.title}
      venue={data.match.venue}
      overs={data.match.overs}
      tossLine={data.tossLine}
      teams={data.teams}
      initial={data.initial}
      canScore={canScore}
    />
  );
}
