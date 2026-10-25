// POST /api/ask { matchId, question, history? } → { answer, asOf, source }
//
// Answers from the match's latest saved state. Limits each viewer to 10 questions a minute
// (free-tier friendly) and caches answers until the next ball.

import { answerQuestion, MAX_QUESTION_LENGTH, type HistoryTurn } from "@/lib/agent/agent";
import type { AgentContext } from "@/lib/agent/tools";
import { getMatchConfig } from "@/lib/db/matches";
import { ApiError, errorResponse, isUuid, readJson } from "@/lib/db/types";
import { getServerSupabase } from "@/lib/supabase/server";
import type { MatchState } from "@/engine";

export const dynamic = "force-dynamic";

const LIMIT_PER_MINUTE = 10;
const hits = new Map<string, number[]>();
const cache = new Map<string, { answer: string; source: string; at: number }>();
const CACHE_MS = 5 * 60_000;

function rateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5_000) hits.clear(); // simple memory bound
  return recent.length > LIMIT_PER_MINUTE;
}

function parseHistory(v: unknown): HistoryTurn[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((t): t is HistoryTurn => typeof t?.text === "string" && (t.role === "user" || t.role === "assistant"))
    .slice(-4)
    .map((t) => ({ role: t.role, text: t.text.slice(0, MAX_QUESTION_LENGTH) }));
}

export async function POST(request: Request) {
  try {
    const body = (await readJson(request)) as Record<string, unknown>;
    const matchId = body?.matchId;
    if (!isUuid(matchId)) throw new ApiError(400, "matchId is required.");
    const question = typeof body.question === "string" ? body.question.trim() : "";
    if (!question) throw new ApiError(400, "Ask a question.");
    if (question.length > MAX_QUESTION_LENGTH) throw new ApiError(400, `Keep questions under ${MAX_QUESTION_LENGTH} characters.`);

    const viewer = request.headers.get("x-viewer-id") ?? request.headers.get("x-forwarded-for") ?? "anonymous";
    if (rateLimited(`${viewer}:${matchId}`)) throw new ApiError(429, "That's a lot of questions! Wait a minute and ask again.");

    const { match, config } = await getMatchConfig(matchId);
    const { data, error } = await getServerSupabase().from("match_state_cache").select("state").eq("match_id", matchId).maybeSingle();
    if (error) throw error;
    if (!data) throw new ApiError(404, "Match not found.");
    const state = data.state as MatchState;

    const history = parseHistory(body.history);
    const key = `${matchId}:${state.lastSeq}:${question.toLowerCase().replace(/\s+/g, " ")}`;
    const hit = !history.length ? cache.get(key) : undefined;
    if (hit && Date.now() - hit.at < CACHE_MS) {
      return Response.json({ answer: hit.answer, asOf: state.score.overs, source: hit.source });
    }

    const tossWinner = [config.teamA, config.teamB].find((t) => t.id === match.toss_winner)?.name ?? "";
    const ctx: AgentContext = {
      state,
      title: match.title,
      overs: match.overs,
      tossLine: `${tossWinner} won the toss and chose to ${match.toss_decision}`,
      teams: [config.teamA, config.teamB].map((t) => ({ id: t.id, name: t.name, shortCode: t.shortCode, players: t.players })),
    };
    const answer = await answerQuestion(ctx, question, history);
    if (!history.length) cache.set(key, { answer: answer.text, source: answer.source, at: Date.now() });
    if (cache.size > 2_000) cache.clear();

    return Response.json({ answer: answer.text, asOf: state.score.overs, source: answer.source });
  } catch (e) {
    return errorResponse(e);
  }
}
