// Creating matches, listing them for the home page, and loading a match's settings for the engine.

import { createHash, randomBytes } from "node:crypto";
import { computeState, type MatchConfig, type MatchState, type MatchStatus, type TeamConfig } from "@/engine";
import { getServerSupabase } from "@/lib/supabase/server";
import {
  ApiError,
  isUuid,
  optionalText,
  parsePlayer,
  requireColour,
  requireInt,
  requireText,
  requireUuid,
  type CreateMatchInput,
  type CreateMatchResult,
  type MatchCard,
  type MatchPlayerRow,
  type MatchRow,
  type MatchSideInput,
  type PlayerRow,
  type TeamRow,
} from "./types";

const STATUSES: MatchStatus[] = ["upcoming", "live", "innings_break", "finished"];
/** Players per side: at least 2 (a striker and a non-striker); at most 15 (the database limit). */
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 15;
const MATCH_COLUMNS =
  "id, title, venue, team_a, team_b, overs, players_per_side, last_man_stands, toss_winner, toss_decision, batting_first, openers, ended_innings, status, result, created_at";

// ---------- scoring token ----------

/** 32 random bytes, URL-safe. Only its hash is stored. */
export function newScoringToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// ---------- input checks ----------

function parseSide(v: unknown, index: number): MatchSideInput {
  const label = `Team ${index + 1}`;
  if (typeof v !== "object" || v === null) throw new ApiError(400, `${label} is missing.`);
  const s = v as Record<string, unknown>;
  if (!Array.isArray(s.players)) throw new ApiError(400, `${label}: players must be a list.`);

  const players = s.players.map((raw, i) => {
    const p = parsePlayer(raw, i);
    const r = raw as Record<string, unknown>;
    return { ...p, isNew: r.isNew === true, saveToTeam: r.saveToTeam === true };
  });

  if (s.teamId !== undefined) {
    return { teamId: requireUuid(s.teamId, `${label} id`), players };
  }
  if (typeof s.newTeam !== "object" || s.newTeam === null) throw new ApiError(400, `${label}: pick a saved team or add a new one.`);
  const t = s.newTeam as Record<string, unknown>;
  return {
    newTeam: {
      name: requireText(t.name, `${label} name`, 60),
      shortCode: requireText(t.shortCode, `${label} short code`, 6).toUpperCase(),
      colour: requireColour(t.colour ?? "#1E6FD9", `${label} colour`),
      save: t.save === true,
    },
    players: players.map((p) => ({ ...p, isNew: true })),
  };
}

/** Checks the body of POST /api/matches. */
export function parseCreateMatchInput(body: unknown): CreateMatchInput {
  if (typeof body !== "object" || body === null) throw new ApiError(400, "Request body must be JSON.");
  const b = body as Record<string, unknown>;
  if (!Array.isArray(b.sides) || b.sides.length !== 2) throw new ApiError(400, "sides must list exactly two teams.");

  const toss = (b.toss ?? {}) as Record<string, unknown>;
  if (toss.winner !== 0 && toss.winner !== 1) throw new ApiError(400, "toss.winner must be 0 or 1.");
  if (toss.decision !== "bat" && toss.decision !== "bowl") throw new ApiError(400, "toss.decision must be bat or bowl.");

  const o = (b.openers ?? {}) as Record<string, unknown>;
  return {
    title: requireText(b.title, "Match name", 80),
    venue: optionalText(b.venue, "Venue", 80),
    overs: requireInt(b.overs, "Overs", 1, 50),
    lastManStands: b.lastManStands === true,
    sides: [parseSide(b.sides[0], 0), parseSide(b.sides[1], 1)],
    toss: { winner: toss.winner, decision: toss.decision },
    openers: {
      striker: requireUuid(o.striker, "Opening striker"),
      nonStriker: requireUuid(o.nonStriker, "Opening non-striker"),
      bowler: requireUuid(o.bowler, "Opening bowler"),
    },
  };
}

// ---------- loading a match for the engine ----------

function toTeamConfig(team: Pick<TeamRow, "id" | "name" | "short_code">, roster: MatchPlayerRow[], names: Map<string, string>): TeamConfig {
  const ordered = roster.filter((r) => r.team_id === team.id).sort((a, b) => a.batting_order - b.batting_order);
  return {
    id: team.id,
    name: team.name,
    shortCode: team.short_code,
    players: ordered.map((r) => ({ id: r.player_id, name: names.get(r.player_id) ?? "Unknown" })),
    battingOrder: ordered.map((r) => r.player_id),
  };
}

export function buildConfig(
  match: MatchRow,
  teams: Pick<TeamRow, "id" | "name" | "short_code">[],
  roster: MatchPlayerRow[],
  players: Pick<PlayerRow, "id" | "name">[],
): MatchConfig {
  const names = new Map(players.map((p) => [p.id, p.name]));
  const teamA = teams.find((t) => t.id === match.team_a);
  const teamB = teams.find((t) => t.id === match.team_b);
  if (!teamA || !teamB) throw new Error(`Teams missing for match ${match.id}`);
  return {
    overs: match.overs,
    playersPerSide: match.players_per_side,
    lastManStands: match.last_man_stands,
    teamA: toTeamConfig(teamA, roster, names),
    teamB: toTeamConfig(teamB, roster, names),
    battingFirst: match.batting_first,
    openers: [match.openers[0], match.openers[1]],
    endedInnings: match.ended_innings,
  };
}

/** A match row plus its engine config. Used by the scorer and agent APIs in later PRs. */
export async function getMatchConfig(matchId: string): Promise<{ match: MatchRow; config: MatchConfig }> {
  if (!isUuid(matchId)) throw new ApiError(404, "Match not found.");
  const db = getServerSupabase();
  const { data: match, error } = await db.from("matches").select(MATCH_COLUMNS).eq("id", matchId).maybeSingle();
  if (error) throw error;
  if (!match) throw new ApiError(404, "Match not found.");
  const m = match as MatchRow;

  const [teams, roster] = await Promise.all([
    db.from("teams").select("id, name, short_code").in("id", [m.team_a, m.team_b]),
    db.from("match_players").select("match_id, player_id, team_id, batting_order").eq("match_id", matchId),
  ]);
  if (teams.error) throw teams.error;
  if (roster.error) throw roster.error;

  const ids = (roster.data as MatchPlayerRow[]).map((r) => r.player_id);
  const players = await db.from("players").select("id, name").in("id", ids);
  if (players.error) throw players.error;

  return { match: m, config: buildConfig(m, teams.data, roster.data as MatchPlayerRow[], players.data) };
}

// ---------- creating a match ----------

interface ResolvedSide {
  teamId: string;
  name: string;
  shortCode: string;
  playerIds: string[];
}

async function resolveSide(ownerKey: string, side: MatchSideInput, label: string): Promise<ResolvedSide> {
  const db = getServerSupabase();
  let teamId: string;
  let name: string;
  let shortCode: string;

  if (side.teamId) {
    const { data, error } = await db
      .from("teams")
      .select("id, name, short_code")
      .eq("id", side.teamId)
      .eq("owner_key", ownerKey)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new ApiError(404, `${label}: saved team not found.`);
    ({ id: teamId, name, short_code: shortCode } = data);
  } else {
    const t = side.newTeam!;
    const { data, error } = await db
      .from("teams")
      .insert({ name: t.name, short_code: t.shortCode, colour: t.colour, owner_key: ownerKey, is_saved: t.save })
      .select("id, name, short_code")
      .single();
    if (error) throw error;
    ({ id: teamId, name, short_code: shortCode } = data);
  }

  // Existing players must belong to this team.
  const existing = side.players.filter((p) => !p.isNew).map((p) => p.id);
  if (existing.length) {
    const { data, error } = await db.from("players").select("id, team_id").in("id", existing);
    if (error) throw error;
    const ok = new Set((data as Pick<PlayerRow, "id" | "team_id">[]).filter((p) => p.team_id === teamId).map((p) => p.id));
    if (existing.some((id) => !ok.has(id))) throw new ApiError(400, `${label}: a player is not in this team.`);
  }

  // New players: a quick team's players join the team; guests join only if "save to team" is ticked.
  const fresh = side.players.filter((p) => p.isNew);
  if (fresh.length) {
    const rows = fresh.map((p) => ({
      id: p.id,
      team_id: side.newTeam || p.saveToTeam ? teamId : null,
      name: p.name,
      role: p.role ?? null,
      bat_style: p.batStyle ?? null,
      bowl_style: p.bowlStyle ?? null,
    }));
    const { error } = await db.from("players").insert(rows);
    if (error) {
      if (error.code === "23505") throw new ApiError(409, `${label}: a new player's id is already used.`);
      throw error;
    }
  }

  return { teamId, name, shortCode, playerIds: side.players.map((p) => p.id) };
}

export async function createMatch(ownerKey: string, input: CreateMatchInput, origin: string): Promise<CreateMatchResult> {
  // Checks that don't need the database. Sides may differ in size (local cricket often does).
  for (const [i, side] of input.sides.entries()) {
    const n = side.players.length;
    if (n < MIN_PLAYERS || n > MAX_PLAYERS) {
      throw new ApiError(400, `Team ${i + 1} needs ${MIN_PLAYERS} to ${MAX_PLAYERS} players (has ${n}).`);
    }
    if (new Set(side.players.map((p) => p.id)).size !== side.players.length) {
      throw new ApiError(400, `Team ${i + 1} lists the same player twice.`);
    }
  }
  const sideA = new Set(input.sides[0].players.map((p) => p.id));
  if (input.sides[1].players.some((p) => sideA.has(p.id))) throw new ApiError(400, "A player can't play for both teams.");

  const battingIndex = input.toss.decision === "bat" ? input.toss.winner : 1 - input.toss.winner;
  const batting = input.sides[battingIndex]!.players.map((p) => p.id);
  const bowling = input.sides[1 - battingIndex]!.players.map((p) => p.id);
  const { striker, nonStriker, bowler } = input.openers;
  if (!batting.includes(striker) || !batting.includes(nonStriker) || striker === nonStriker) {
    throw new ApiError(400, "Pick two different opening batters from the batting side.");
  }
  if (!bowling.includes(bowler)) throw new ApiError(400, "Pick the opening bowler from the bowling side.");

  const [a, b] = [
    await resolveSide(ownerKey, input.sides[0], "Team 1"),
    await resolveSide(ownerKey, input.sides[1], "Team 2"),
  ];
  if (a.teamId === b.teamId) throw new ApiError(400, "Pick two different teams.");
  const tossWinner = input.toss.winner === 0 ? a.teamId : b.teamId;
  const battingFirst = battingIndex === 0 ? a.teamId : b.teamId;

  const token = newScoringToken();
  const db = getServerSupabase();
  const { data: match, error } = await db
    .from("matches")
    .insert({
      title: input.title,
      venue: input.venue ?? null,
      team_a: a.teamId,
      team_b: b.teamId,
      overs: input.overs,
      // The larger side, for display. All out uses each batting side's own size (see the engine).
      players_per_side: Math.max(input.sides[0].players.length, input.sides[1].players.length),
      last_man_stands: input.lastManStands,
      toss_winner: tossWinner,
      toss_decision: input.toss.decision,
      batting_first: battingFirst,
      openers: [input.openers],
      scoring_token_hash: hashToken(token),
      owner_key: ownerKey,
    })
    .select(MATCH_COLUMNS)
    .single();
  if (error) throw error;
  const m = match as MatchRow;

  try {
    const roster: MatchPlayerRow[] = [a, b].flatMap((side) =>
      side.playerIds.map((playerId, i) => ({ match_id: m.id, player_id: playerId, team_id: side.teamId, batting_order: i + 1 })),
    );
    const { error: rErr } = await db.from("match_players").insert(roster);
    if (rErr) throw rErr;

    const names = input.sides.flatMap((s) => s.players.map((p) => ({ id: p.id, name: p.name })));
    const config = buildConfig(
      m,
      [
        { id: a.teamId, name: a.name, short_code: a.shortCode },
        { id: b.teamId, name: b.name, short_code: b.shortCode },
      ],
      roster,
      names,
    );
    const state = computeState(config, []);
    const { error: cErr } = await db.from("match_state_cache").insert({ match_id: m.id, state, last_seq: 0 });
    if (cErr) throw cErr;
  } catch (e) {
    // Don't leave a half-made match behind (deleting the match cascades to its rows).
    await db.from("matches").delete().eq("id", m.id);
    throw e;
  }

  return {
    matchId: m.id,
    viewerUrl: `${origin}/match/${m.id}`,
    scoringUrl: `${origin}/score/${m.id}?t=${token}`,
  };
}

// ---------- listing ----------

interface TeamEmbed {
  id: string;
  name: string;
  short_code: string;
  colour: string;
}

function one<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

/** Matches for the home page, newest first. Pass a status to filter (e.g. "live"). */
/** Matches for the home page (everyone's), or one umpire's matches when `ownerId` is given. */
export async function listMatches(status?: string, limit = 50, ownerId?: string): Promise<MatchCard[]> {
  if (status !== undefined && !STATUSES.includes(status as MatchStatus)) {
    throw new ApiError(400, `status must be one of: ${STATUSES.join(", ")}.`);
  }
  const db = getServerSupabase();
  let q = db
    .from("matches")
    .select(
      `id, title, venue, overs, status, result, created_at,
       team_a_info:teams!matches_team_a_fkey (id, name, short_code, colour),
       team_b_info:teams!matches_team_b_fkey (id, name, short_code, colour),
       match_state_cache (state)`,
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (status) q = q.eq("status", status);
  if (ownerId) q = q.eq("owner_key", ownerId);

  const { data, error } = await q;
  if (error) throw error;

  return (data as unknown as Record<string, unknown>[]).map((r) => {
    const ta = one(r.team_a_info as TeamEmbed | TeamEmbed[])!;
    const tb = one(r.team_b_info as TeamEmbed | TeamEmbed[])!;
    const cache = one(r.match_state_cache as { state: MatchState } | { state: MatchState }[] | null);
    return {
      id: r.id as string,
      title: r.title as string,
      venue: (r.venue as string | null) ?? null,
      overs: r.overs as number,
      status: r.status as MatchStatus,
      result: (r.result as string | null) ?? null,
      createdAt: r.created_at as string,
      teamA: { id: ta.id, name: ta.name, shortCode: ta.short_code, colour: ta.colour },
      teamB: { id: tb.id, name: tb.name, shortCode: tb.short_code, colour: tb.colour },
      state: cache?.state ?? null,
    };
  });
}

/**
 * Moves matches created on this device (before logins existed) to the umpire's account, so they
 * show on their dashboard. `owner_key` holds the umpire's user id from now on. Runs on every
 * dashboard visit; does nothing once a device's matches have moved. Returns how many moved.
 */
export async function claimDeviceMatches(userId: string, deviceKey: string): Promise<number> {
  if (!isUuid(userId) || !isUuid(deviceKey) || userId === deviceKey) return 0;
  const { data, error } = await getServerSupabase().from("matches").update({ owner_key: userId }).eq("owner_key", deviceKey).select("id");
  if (error) throw error;
  return data?.length ?? 0;
}
