// Database row types (matching supabase/schema.sql), API input/output types,
// and small helpers for checking request bodies.

import type { InningsOpeners, MatchState, MatchStatus } from "@/engine";

// ---------- rows ----------

export type PlayerRole = "batter" | "bowler" | "allrounder" | "keeper";

export interface TeamRow {
  id: string;
  name: string;
  short_code: string;
  colour: string;
  owner_key: string;
  is_saved: boolean;
  created_at: string;
}

export interface PlayerRow {
  id: string;
  team_id: string | null;
  name: string;
  role: PlayerRole | null;
  bat_style: string | null;
  bowl_style: string | null;
}

export interface MatchRow {
  id: string;
  title: string;
  venue: string | null;
  team_a: string;
  team_b: string;
  overs: number;
  players_per_side: number;
  last_man_stands: boolean;
  toss_winner: string;
  toss_decision: "bat" | "bowl";
  batting_first: string;
  openers: InningsOpeners[];
  ended_innings: (1 | 2)[];
  status: MatchStatus;
  result: string | null;
  created_at: string;
}

export interface MatchPlayerRow {
  match_id: string;
  player_id: string;
  team_id: string;
  batting_order: number;
}

// ---------- API shapes ----------

export interface PlayerInput {
  /** Existing player id, or a new id made on the phone with crypto.randomUUID(). */
  id: string;
  name: string;
  role?: PlayerRole;
  batStyle?: string;
  bowlStyle?: string;
}

export interface Team {
  id: string;
  name: string;
  shortCode: string;
  colour: string;
  players: (PlayerInput & { role?: PlayerRole })[];
}

/** POST /api/teams — create a team, or update it when `id` is an existing team of yours. */
export interface SaveTeamInput {
  id?: string;
  name: string;
  shortCode: string;
  colour: string;
  players: PlayerInput[];
}

/** One side at match setup. */
export interface MatchSideInput {
  /** A saved team… */
  teamId?: string;
  /** …or a quick team typed in now. */
  newTeam?: { name: string; shortCode: string; colour: string; save: boolean };
  /**
   * Today's players in batting order. Existing players by id; new ones (guests, or a
   * quick team's players) with `isNew: true` and an id made on the phone.
   */
  players: (PlayerInput & { isNew?: boolean; saveToTeam?: boolean })[];
}

/** POST /api/matches */
export interface CreateMatchInput {
  title: string;
  venue?: string;
  overs: number;
  lastManStands: boolean;
  /** Each side lists 2–15 players; the sides can be different sizes. */
  sides: [MatchSideInput, MatchSideInput];
  toss: { winner: 0 | 1; decision: "bat" | "bowl" };
  openers: InningsOpeners;
}

export interface CreateMatchResult {
  matchId: string;
  viewerUrl: string;
  /** The scorer screen. Only the umpire who created the match can use it (no secret token). */
  scoringUrl: string;
}

/** A row on the home page. */
export interface MatchCard {
  id: string;
  title: string;
  venue: string | null;
  overs: number;
  status: MatchStatus;
  result: string | null;
  createdAt: string;
  teamA: { id: string; name: string; shortCode: string; colour: string };
  teamB: { id: string; name: string; shortCode: string; colour: string };
  state: MatchState | null;
}

// ---------- errors and input checks ----------

/** An error that becomes an HTTP response with this status and message. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLOUR_RE = /^#[0-9A-Fa-f]{6}$/;
const ROLES: PlayerRole[] = ["batter", "bowler", "allrounder", "keeper"];

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

export function requireUuid(v: unknown, field: string): string {
  if (!isUuid(v)) throw new ApiError(400, `${field} must be a valid id.`);
  return v;
}

export function requireText(v: unknown, field: string, max: number): string {
  if (typeof v !== "string" || v.trim().length === 0) throw new ApiError(400, `${field} is required.`);
  const t = v.trim();
  if (t.length > max) throw new ApiError(400, `${field} must be at most ${max} characters.`);
  return t;
}

export function optionalText(v: unknown, field: string, max: number): string | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  return requireText(v, field, max);
}

export function requireInt(v: unknown, field: string, min: number, max: number): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) {
    throw new ApiError(400, `${field} must be a whole number from ${min} to ${max}.`);
  }
  return v;
}

export function requireColour(v: unknown, field: string): string {
  if (typeof v !== "string" || !COLOUR_RE.test(v)) throw new ApiError(400, `${field} must be a colour like #1E6FD9.`);
  return v.toUpperCase();
}

export function optionalRole(v: unknown): PlayerRole | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  if (!ROLES.includes(v as PlayerRole)) throw new ApiError(400, `Role must be one of: ${ROLES.join(", ")}.`);
  return v as PlayerRole;
}

export function parsePlayer(v: unknown, index: number): PlayerInput {
  if (typeof v !== "object" || v === null) throw new ApiError(400, `Player ${index + 1} is invalid.`);
  const p = v as Record<string, unknown>;
  return {
    id: requireUuid(p.id, `Player ${index + 1} id`),
    name: requireText(p.name, `Player ${index + 1} name`, 40),
    role: optionalRole(p.role),
    batStyle: optionalText(p.batStyle, "Batting style", 30),
    bowlStyle: optionalText(p.bowlStyle, "Bowling style", 30),
  };
}

/**
 * Turns any error into a JSON response: ApiError keeps its status and message,
 * missing configuration says what to set, anything else is a generic 500 (details go to the server log).
 */
export function errorResponse(e: unknown): Response {
  if (e instanceof ApiError) return Response.json({ error: e.message }, { status: e.status });
  if (e instanceof Error && e.name === "ConfigError") return Response.json({ error: e.message }, { status: 500 });
  console.error(e);
  return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}

/** Reads a JSON request body, with a clear error if it isn't JSON. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiError(400, "Request body must be valid JSON.");
  }
}
