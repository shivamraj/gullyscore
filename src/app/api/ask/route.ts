// POST /api/ask { matchId, question, history? } → { answer, asOf, source }
//
// Answers from the match's latest saved state. Limits each viewer to 10 questions a minute
// (free-tier friendly), reuses answers until the next ball, and logs every question. The cache,
// limit and log are shared by all servers through the ask_log table (src/lib/db/askLog.ts).

import { answerQuestion, MAX_QUESTION_LENGTH, type HistoryTurn } from "@/lib/agent/agent";
import type { AgentContext } from "@/lib/agent/tools";
import { cachedAnswer, logAsk, questionKey, recentQuestions, viewerHash } from "@/lib/db/askLog";
import { listBalls } from "@/lib/db/balls";
import { playerPastMatches, teamMeetings } from "@/lib/db/history";
import { getMatchConfig } from "@/lib/db/matches";
import { ApiError, errorResponse, isUuid, readJson } from "@/lib/db/types";
import { getServerSupabase } from "@/lib/supabase/server";
import type { MatchState } from "@/engine";

export const dynamic = "force-dynamic";

const LIMIT_PER_MINUTE = 10;

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

    const started = Date.now();
    const viewer = viewerHash(request.headers.get("x-viewer-id") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous");
    const [asked, [{ match, config }, { data, error }, balls]] = await Promise.all([
      recentQuestions(viewer),
      Promise.all([
        getMatchConfig(matchId),
        getServerSupabase().from("match_state_cache").select("state").eq("match_id", matchId).maybeSingle(),
        listBalls(matchId),
      ]),
    ]);
    if (asked >= LIMIT_PER_MINUTE) throw new ApiError(429, "That's a lot of questions! Wait a minute and ask again.");
    if (error) throw error;
    if (!data) throw new ApiError(404, "Match not found.");
    const state = data.state as MatchState;

    const history = parseHistory(body.history);
    const key = questionKey(question);
    const base = { matchId, viewer, question, questionKey: key, lastSeq: state.lastSeq };

    // Same match, same ball, same question (ignoring case and punctuation) → the stored answer.
    // Follow-ups depend on the conversation, so they always go to the AI.
    const hit = history.length ? null : await cachedAnswer(matchId, state.lastSeq, key);
    if (hit) {
      await logAsk({ ...base, answer: hit, source: "cache", tools: [], ms: Date.now() - started });
      return Response.json({ answer: hit, asOf: state.score.overs, source: "cache" });
    }

    const tossWinner = [config.teamA, config.teamB].find((t) => t.id === match.toss_winner)?.name ?? "";
    const ctx: AgentContext = {
      state,
      title: match.title,
      venue: match.venue,
      overs: match.overs,
      tossLine: `${tossWinner} won the toss and chose to ${match.toss_decision}`,
      teams: [config.teamA, config.teamB].map((t) => ({ id: t.id, name: t.name, shortCode: t.shortCode, players: t.players })),
      balls,
      history: {
        playerMatches: (playerId, limit) => playerPastMatches(playerId, matchId, limit),
        teamMeetings: (limit) => teamMeetings(config.teamA.id, config.teamB.id, matchId, limit),
      },
    };
    const answer = await answerQuestion(ctx, question, history);
    const ms = Date.now() - started;
    // Logged "ai" rows are the cache ("busy" and "unavailable" never are). A follow-up's answer
    // depends on the conversation, so its key gets a "#followup" mark that a plain question
    // (letters and digits only) can never match.
    await logAsk({ ...base, questionKey: history.length ? `${key} #followup` : key, answer: answer.text, source: answer.source, tools: answer.tools, ms });
    console.info(JSON.stringify({ ask: matchId, ball: state.lastSeq, source: answer.source, tools: answer.tools, ms }));

    return Response.json({ answer: answer.text, asOf: state.score.overs, source: answer.source });
  } catch (e) {
    return errorResponse(e);
  }
}
