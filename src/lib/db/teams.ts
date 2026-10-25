// Saved teams and their players. Each scorer sees only the teams made with their own device key.

import { getServerSupabase } from "@/lib/supabase/server";
import {
  ApiError,
  parsePlayer,
  requireColour,
  requireText,
  type PlayerRow,
  type SaveTeamInput,
  type Team,
  type TeamRow,
} from "./types";

const MAX_PLAYERS = 30;

function toTeam(row: Pick<TeamRow, "id" | "name" | "short_code" | "colour">, players: PlayerRow[]): Team {
  return {
    id: row.id,
    name: row.name,
    shortCode: row.short_code,
    colour: row.colour,
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role ?? undefined,
      batStyle: p.bat_style ?? undefined,
      bowlStyle: p.bowl_style ?? undefined,
    })),
  };
}

function toPlayerRow(p: SaveTeamInput["players"][number], teamId: string | null) {
  return {
    id: p.id,
    team_id: teamId,
    name: p.name,
    role: p.role ?? null,
    bat_style: p.batStyle ?? null,
    bowl_style: p.bowlStyle ?? null,
  };
}

/** Checks the body of POST /api/teams. */
export function parseSaveTeamInput(body: unknown): SaveTeamInput {
  if (typeof body !== "object" || body === null) throw new ApiError(400, "Request body must be JSON.");
  const b = body as Record<string, unknown>;
  if (!Array.isArray(b.players)) throw new ApiError(400, "players must be a list.");
  if (b.players.length > MAX_PLAYERS) throw new ApiError(400, `A team can have at most ${MAX_PLAYERS} players.`);
  const players = b.players.map(parsePlayer);
  if (new Set(players.map((p) => p.id)).size !== players.length) throw new ApiError(400, "Each player needs a different id.");
  return {
    id: b.id === undefined ? undefined : requireText(b.id, "Team id", 36),
    name: requireText(b.name, "Team name", 60),
    shortCode: requireText(b.shortCode, "Short code", 6).toUpperCase(),
    colour: requireColour(b.colour ?? "#1E6FD9", "Team colour"),
    players,
  };
}

/** Saved teams for this device, with players, newest first. */
export async function listTeams(ownerKey: string): Promise<Team[]> {
  const db = getServerSupabase();
  const { data: teams, error } = await db
    .from("teams")
    .select("id, name, short_code, colour")
    .eq("owner_key", ownerKey)
    .eq("is_saved", true)
    .order("created_at", { ascending: false });
  if (error) throw error;
  if (!teams.length) return [];

  const { data: players, error: pErr } = await db
    .from("players")
    .select("id, team_id, name, role, bat_style, bowl_style")
    .in("team_id", teams.map((t) => t.id))
    .order("created_at", { ascending: true });
  if (pErr) throw pErr;

  return teams.map((t) => toTeam(t, (players as PlayerRow[]).filter((p) => p.team_id === t.id)));
}

/**
 * Creates a team, or updates one this device owns when `input.id` is set.
 * Players left out of an update are removed from the team but kept in old scorecards.
 */
export async function saveTeam(ownerKey: string, input: SaveTeamInput, isSaved = true): Promise<Team> {
  const db = getServerSupabase();
  const fields = { name: input.name, short_code: input.shortCode, colour: input.colour };

  let teamId: string;
  if (input.id) {
    const { data: existing, error } = await db
      .from("teams")
      .select("id")
      .eq("id", input.id)
      .eq("owner_key", ownerKey)
      .maybeSingle();
    if (error) throw error;
    if (!existing) throw new ApiError(404, "Team not found.");
    const { error: uErr } = await db.from("teams").update(fields).eq("id", input.id);
    if (uErr) throw uErr;
    teamId = input.id;
  } else {
    const { data, error } = await db
      .from("teams")
      .insert({ ...fields, owner_key: ownerKey, is_saved: isSaved })
      .select("id")
      .single();
    if (error) throw error;
    teamId = data.id;
  }

  // A player id that already belongs to a different team can't be taken over.
  const ids = input.players.map((p) => p.id);
  if (ids.length) {
    const { data: clash, error } = await db.from("players").select("id, team_id").in("id", ids);
    if (error) throw error;
    const taken = (clash as Pick<PlayerRow, "id" | "team_id">[]).find((p) => p.team_id !== null && p.team_id !== teamId);
    if (taken) throw new ApiError(409, "A player in this list belongs to another team.");
  }

  if (input.players.length) {
    const { error } = await db.from("players").upsert(input.players.map((p) => toPlayerRow(p, teamId)));
    if (error) throw error;
  }

  // Remove players dropped from the team (team_id → null keeps old scorecards intact).
  let drop = db.from("players").update({ team_id: null }).eq("team_id", teamId);
  if (ids.length) drop = drop.not("id", "in", `(${ids.join(",")})`);
  const { error: dErr } = await drop;
  if (dErr) throw dErr;

  const { data: players, error: pErr } = await db
    .from("players")
    .select("id, team_id, name, role, bat_style, bowl_style")
    .eq("team_id", teamId)
    .order("created_at", { ascending: true });
  if (pErr) throw pErr;

  return toTeam({ id: teamId, ...fields }, players as PlayerRow[]);
}
