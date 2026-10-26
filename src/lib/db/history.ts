// Past matches, for the Ask agent's history tools: a player's earlier matches, and earlier
// meetings between two teams. Only matches scored on GullyScore are known, and a player is
// recognised across matches when they were picked from a saved team (same player id).

import type { BatterLine, BowlerLine, MatchState } from "@/engine";
import { getServerSupabase } from "@/lib/supabase/server";

export interface PlayerPastMatch {
  date: string;
  match: string;
  for: string;
  against: string;
  status: string;
  result: string | null;
  batting: { runs: number; balls: number; fours: number; sixes: number; out: boolean; how_out: string }[];
  bowling: { overs: string; runs: number; wickets: number; maidens: number }[];
}

export interface MeetingResult {
  date: string;
  match: string;
  status: string;
  result: string | null;
  winner: string | null;
  scores: string[];
}

type MatchRowLite = { id: string; title: string; created_at: string; status: string; result: string | null; team_a: string; team_b: string };

async function teamNames(ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const { data, error } = await getServerSupabase().from("teams").select("id, name").in("id", [...new Set(ids)]);
  if (error) throw error;
  return new Map((data as { id: string; name: string }[]).map((t) => [t.id, t.name]));
}

async function states(matchIds: string[]): Promise<Map<string, MatchState>> {
  if (!matchIds.length) return new Map();
  const { data, error } = await getServerSupabase().from("match_state_cache").select("match_id, state").in("match_id", matchIds);
  if (error) throw error;
  return new Map((data as { match_id: string; state: MatchState }[]).map((r) => [r.match_id, r.state]));
}

const date = (iso: string) => iso.slice(0, 10);

/** A player's other matches, newest first (up to `limit`), with their batting and bowling in each. */
export async function playerPastMatches(playerId: string, excludeMatchId: string, limit = 10): Promise<PlayerPastMatch[]> {
  const db = getServerSupabase();
  const { data: rows, error } = await db.from("match_players").select("match_id, team_id").eq("player_id", playerId);
  if (error) throw error;
  const teamOfMatch = new Map((rows as { match_id: string; team_id: string }[]).filter((r) => r.match_id !== excludeMatchId).map((r) => [r.match_id, r.team_id]));
  if (!teamOfMatch.size) return [];

  const { data: matches, error: mErr } = await db
    .from("matches")
    .select("id, title, created_at, status, result, team_a, team_b")
    .in("id", [...teamOfMatch.keys()])
    .order("created_at", { ascending: false })
    .limit(limit);
  if (mErr) throw mErr;
  const list = matches as MatchRowLite[];
  const [names, byMatch] = await Promise.all([teamNames(list.flatMap((m) => [m.team_a, m.team_b])), states(list.map((m) => m.id))]);

  return list.map((m) => {
    const mine = teamOfMatch.get(m.id)!;
    const state = byMatch.get(m.id);
    const bat = (state?.inningsList ?? []).flatMap((i) => i.batting.filter((b: BatterLine) => b.playerId === playerId));
    const bowl = (state?.inningsList ?? []).flatMap((i) => i.bowling.filter((b: BowlerLine) => b.playerId === playerId));
    return {
      date: date(m.created_at),
      match: m.title,
      for: names.get(mine) ?? "",
      against: names.get(mine === m.team_a ? m.team_b : m.team_a) ?? "",
      status: m.status,
      result: m.result,
      batting: bat.map((b) => ({ runs: b.runs, balls: b.balls, fours: b.fours, sixes: b.sixes, out: b.out, how_out: b.howOut })),
      bowling: bowl.map((b) => ({ overs: b.overs, runs: b.runs, wickets: b.wickets, maidens: b.maidens })),
    };
  });
}

/** Earlier matches between these two teams (either way round), newest first. */
export async function teamMeetings(teamA: string, teamB: string, excludeMatchId: string, limit = 10): Promise<MeetingResult[]> {
  const db = getServerSupabase();
  const cols = "id, title, created_at, status, result, team_a, team_b";
  const [ab, ba] = await Promise.all([
    db.from("matches").select(cols).eq("team_a", teamA).eq("team_b", teamB),
    db.from("matches").select(cols).eq("team_a", teamB).eq("team_b", teamA),
  ]);
  if (ab.error) throw ab.error;
  if (ba.error) throw ba.error;
  const list = [...(ab.data as MatchRowLite[]), ...(ba.data as MatchRowLite[])]
    .filter((m) => m.id !== excludeMatchId)
    .sort((x, y) => y.created_at.localeCompare(x.created_at))
    .slice(0, limit);
  const [names, byMatch] = await Promise.all([teamNames([teamA, teamB]), states(list.map((m) => m.id))]);
  return list.map((m) => {
    const s = byMatch.get(m.id);
    return {
      date: date(m.created_at),
      match: m.title,
      status: m.status,
      result: m.result,
      winner: s?.winner ? (names.get(s.winner) ?? null) : null,
      scores: (s?.inningsList ?? []).filter((i) => i.legalBalls > 0 || i.runs > 0).map((i) => `${names.get(i.battingTeam) ?? ""} ${i.runs}/${i.wickets} (${i.overs})`),
    };
  });
}
