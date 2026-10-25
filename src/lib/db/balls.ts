// Saving balls: check the scoring token, validate the ball with the engine, store it,
// then refresh the cached state and the match status.

import { createHash, timingSafeEqual } from "node:crypto";
import { computeState, validateNext, type BallEvent, type MatchConfig, type MatchState } from "@/engine";
import { getServerSupabase } from "@/lib/supabase/server";
import { getMatchConfig } from "./matches";
import { ApiError, isUuid, type MatchRow } from "./types";

export interface BallRow {
  seq: number;
  innings: 1 | 2;
  striker: string;
  non_striker: string | null;
  bowler: string;
  runs_bat: number;
  extra_type: BallEvent["extraType"] | null;
  extra_runs: number;
  wicket_type: NonNullable<BallEvent["wicket"]>["type"] | null;
  player_out: string | null;
  fielder: string | null;
  incoming_batter: string | null;
  client_id: string;
}

const BALL_COLUMNS =
  "seq, innings, striker, non_striker, bowler, runs_bat, extra_type, extra_runs, wicket_type, player_out, fielder, incoming_batter, client_id";

export function rowToBall(r: BallRow): BallEvent {
  const ball: BallEvent = {
    seq: r.seq,
    innings: r.innings,
    striker: r.striker,
    nonStriker: r.non_striker,
    bowler: r.bowler,
    runsBat: r.runs_bat,
    extraRuns: r.extra_runs,
  };
  if (r.extra_type) ball.extraType = r.extra_type;
  if (r.wicket_type && r.player_out) {
    ball.wicket = { type: r.wicket_type, playerOut: r.player_out };
    if (r.fielder) ball.wicket.fielder = r.fielder;
    if (r.incoming_batter) ball.wicket.incoming = r.incoming_batter;
  }
  return ball;
}

function ballToRow(matchId: string, b: BallEvent, clientId: string) {
  return {
    match_id: matchId,
    seq: b.seq,
    innings: b.innings,
    striker: b.striker,
    non_striker: b.nonStriker,
    bowler: b.bowler,
    runs_bat: b.runsBat,
    extra_type: b.extraType ?? null,
    extra_runs: b.extraRuns,
    wicket_type: b.wicket?.type ?? null,
    player_out: b.wicket?.playerOut ?? null,
    fielder: b.wicket?.fielder ?? null,
    incoming_batter: b.wicket?.incoming ?? null,
    client_id: clientId,
  };
}

// ---------- scoring token ----------

function sha256(text: string): Buffer {
  return createHash("sha256").update(text).digest();
}

/** True if this token is the match's scoring token. Compares hashes in constant time. */
export async function isValidScoringToken(matchId: string, token: string | null | undefined): Promise<boolean> {
  if (!isUuid(matchId) || !token || token.length > 100) return false;
  const { data, error } = await getServerSupabase()
    .from("matches")
    .select("scoring_token_hash")
    .eq("id", matchId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return false;
  const stored = Buffer.from(data.scoring_token_hash as string, "hex");
  const given = sha256(token);
  return stored.length === given.length && timingSafeEqual(stored, given);
}

export async function requireScoringToken(matchId: string, token: string | null | undefined): Promise<void> {
  if (!(await isValidScoringToken(matchId, token))) throw new ApiError(403, "This scoring link is not valid.");
}

// ---------- reading ----------

export async function listBalls(matchId: string): Promise<BallEvent[]> {
  const { data, error } = await getServerSupabase()
    .from("balls")
    .select(BALL_COLUMNS)
    .eq("match_id", matchId)
    .order("seq", { ascending: true });
  if (error) throw error;
  return (data as BallRow[]).map(rowToBall);
}

/** Everything the scorer screen needs to start. */
export async function loadScoringData(matchId: string): Promise<{ match: MatchRow; config: MatchConfig; balls: BallEvent[] }> {
  const [{ match, config }, balls] = await Promise.all([getMatchConfig(matchId), listBalls(matchId)]);
  return { match, config, balls };
}

// ---------- writing ----------

/** Recalculates the state and stores it in the cache and on the match row (status, result). */
async function refreshMatch(matchId: string, config: MatchConfig, balls: BallEvent[]): Promise<MatchState> {
  const db = getServerSupabase();
  const state = computeState(config, balls);
  const [cache, match] = await Promise.all([
    db.from("match_state_cache").upsert({ match_id: matchId, state, last_seq: state.lastSeq, updated_at: new Date().toISOString() }),
    db.from("matches").update({ status: state.status, result: state.result ?? null }).eq("id", matchId),
  ]);
  if (cache.error) throw cache.error;
  if (match.error) throw match.error;
  return state;
}

/** Parses a ball sent by the scorer's phone. The engine checks the cricket rules afterwards. */
export function parseBall(v: unknown): BallEvent {
  if (typeof v !== "object" || v === null) throw new ApiError(400, "ball is missing.");
  const b = v as Record<string, unknown>;
  const int = (x: unknown, name: string) => {
    if (typeof x !== "number" || !Number.isInteger(x)) throw new ApiError(400, `${name} must be a whole number.`);
    return x;
  };
  const id = (x: unknown, name: string) => {
    if (!isUuid(x)) throw new ApiError(400, `${name} must be a player id.`);
    return x;
  };
  const innings = int(b.innings, "innings");
  if (innings !== 1 && innings !== 2) throw new ApiError(400, "innings must be 1 or 2.");
  const extraTypes = ["wide", "noball", "bye", "legbye"];
  if (b.extraType !== undefined && !extraTypes.includes(b.extraType as string)) throw new ApiError(400, "Unknown extra type.");

  const ball: BallEvent = {
    seq: int(b.seq, "seq"),
    innings,
    striker: id(b.striker, "striker"),
    nonStriker: b.nonStriker === null ? null : id(b.nonStriker, "nonStriker"),
    bowler: id(b.bowler, "bowler"),
    runsBat: int(b.runsBat, "runsBat"),
    extraRuns: int(b.extraRuns, "extraRuns"),
  };
  if (b.extraType) ball.extraType = b.extraType as BallEvent["extraType"];
  if (b.wicket !== undefined) {
    const w = b.wicket as Record<string, unknown>;
    const types = ["bowled", "caught", "lbw", "runout", "stumped", "hitwicket", "retired"];
    if (!types.includes(w.type as string)) throw new ApiError(400, "Unknown wicket type.");
    ball.wicket = { type: w.type as NonNullable<BallEvent["wicket"]>["type"], playerOut: id(w.playerOut, "playerOut") };
    if (w.fielder !== undefined) ball.wicket.fielder = id(w.fielder, "fielder");
    if (w.incoming !== undefined) ball.wicket.incoming = id(w.incoming, "incoming");
  }
  return ball;
}

export interface SaveBallResult {
  state: MatchState;
  /** True when this exact ball (same clientId) was already saved: a safe retry. */
  duplicate: boolean;
}

/**
 * Saves one ball. Safe to retry: a ball whose clientId is already stored is treated as saved.
 * A ball whose seq is already taken by another ball means the phone is out of date (409).
 */
export async function saveBall(matchId: string, ball: BallEvent, clientId: string): Promise<SaveBallResult> {
  if (!isUuid(clientId)) throw new ApiError(400, "clientId must be an id.");
  const db = getServerSupabase();
  const { config, balls } = await loadScoringData(matchId);

  // Retry of a ball we already have?
  const { data: existing, error: exErr } = await db.from("balls").select("seq").eq("client_id", clientId).maybeSingle();
  if (exErr) throw exErr;
  if (existing) return { state: computeState(config, balls), duplicate: true };

  const check = validateNext(config, balls, ball);
  if (!check.ok) {
    const stale = ball.seq !== (balls.at(-1)?.seq ?? 0) + 1;
    throw new ApiError(stale ? 409 : 400, check.error);
  }

  const { error } = await db.from("balls").insert(ballToRow(matchId, ball, clientId));
  if (error) {
    if (error.code === "23505") throw new ApiError(409, "Another ball was saved first. Reloading the latest score.");
    throw error;
  }
  const state = await refreshMatch(matchId, config, [...balls, ball]);
  return { state, duplicate: false };
}
