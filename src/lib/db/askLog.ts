// The Ask agent's shared memory, in Supabase (table ask_log, supabase/migrations/002_ask_log.sql):
//   - answer cache: same match, same ball, same question → the stored answer, no AI call;
//   - rate limit: questions per viewer per minute, counted across every server;
//   - question log: what people ask, what was answered, tools used and time taken.
//
// Until the table exists (the SQL hasn't been run yet), everything falls back to this server's
// memory, so Ask keeps working; a warning is logged once.

import { createHash } from "node:crypto";
import { getServerSupabase } from "@/lib/supabase/server";

export type AskSource = "ai" | "cache" | "busy" | "unavailable";

export interface AskLogRow {
  matchId: string;
  viewer: string;
  question: string;
  questionKey: string;
  lastSeq: number;
  answer: string;
  source: AskSource;
  tools: string[];
  ms: number;
}

/** "Score?" and "score" share an answer: lower case, letters and digits only (any script). */
export function questionKey(question: string): string {
  return question.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** One-way hash of the viewer's device id or IP: enough to count their questions, not to identify them. */
export function viewerHash(raw: string): string {
  return createHash("sha256").update(`gullyscore-ask:${raw}`).digest("hex").slice(0, 32);
}

// ---------- in-memory fallback (also used when the database is briefly unreachable) ----------

let tableMissing = false;
const memAnswers = new Map<string, string>();
const memHits = new Map<string, number[]>();

function missingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const missing = error.code === "42P01" || error.code === "PGRST205" || /ask_log/.test(error.message ?? "");
  if (missing && !tableMissing) {
    tableMissing = true;
    console.warn("ask_log table not found: run supabase/migrations/002_ask_log.sql. Using in-memory cache meanwhile.");
  }
  return missing;
}

/** The stored answer for this question at this ball, if any. */
export async function cachedAnswer(matchId: string, lastSeq: number, key: string): Promise<string | null> {
  const memKey = `${matchId}:${lastSeq}:${key}`;
  if (!tableMissing) {
    const { data, error } = await getServerSupabase()
      .from("ask_log")
      .select("answer")
      .eq("match_id", matchId)
      .eq("last_seq", lastSeq)
      .eq("question_key", key)
      .eq("source", "ai")
      .order("created_at", { ascending: false })
      .limit(1);
    if (!error) return (data as { answer: string }[])[0]?.answer ?? null;
    if (!missingTable(error)) console.error(JSON.stringify({ askLog: "cache read failed", error: error.message }));
  }
  return memAnswers.get(memKey) ?? null;
}

/** How many questions this viewer asked in the last `windowMs` (including this one, once logged). */
export async function recentQuestions(viewer: string, windowMs = 60_000): Promise<number> {
  const since = new Date(Date.now() - windowMs).toISOString();
  if (!tableMissing) {
    const { data, error } = await getServerSupabase().from("ask_log").select("id").eq("viewer", viewer).gte("created_at", since).limit(100);
    if (!error) return (data as unknown[]).length;
    if (!missingTable(error)) console.error(JSON.stringify({ askLog: "rate read failed", error: error.message }));
  }
  const now = Date.now();
  return (memHits.get(viewer) ?? []).filter((t) => now - t < windowMs).length;
}

/** Records a question and its answer. Never throws: a logging problem must not break Ask. */
export async function logAsk(row: AskLogRow): Promise<void> {
  // Memory copy first, so the fallback always has the latest.
  const now = Date.now();
  memHits.set(row.viewer, [...(memHits.get(row.viewer) ?? []).filter((t) => now - t < 60_000), now]);
  if (row.source === "ai") memAnswers.set(`${row.matchId}:${row.lastSeq}:${row.questionKey}`, row.answer);
  if (memAnswers.size > 2_000) memAnswers.clear();
  if (memHits.size > 5_000) memHits.clear();
  if (tableMissing) return;
  const { error } = await getServerSupabase()
    .from("ask_log")
    .insert({
      match_id: row.matchId,
      viewer: row.viewer,
      question: row.question,
      question_key: row.questionKey,
      last_seq: row.lastSeq,
      answer: row.answer,
      source: row.source,
      tools: row.tools,
      ms: row.ms,
    });
  if (error && !missingTable(error)) console.error(JSON.stringify({ askLog: "write failed", error: error.message }));
}
