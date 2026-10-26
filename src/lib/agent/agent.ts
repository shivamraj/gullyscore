// The Ask agent: answers a viewer's question about one match.
//
// Every question goes to the AI with a live snapshot of the match (prompt.ts). The AI answers
// straight away when the snapshot is enough, or calls read-only tools (tools.ts) to look things
// up (ball-by-ball, a player, over-by-over, the scorecard, arithmetic) for up to MAX_TOOL_ROUNDS
// rounds before it must answer. Two tools read past matches from the database. No keyword
// lists: the AI understands the question.

import { geminiModel, LlmUnavailableError, type ChatModel, type Content } from "./llm";
import { systemPrompt } from "./prompt";
import { runTool, TOOLS, type AgentContext } from "./tools";

const MAX_TOOL_ROUNDS = 5;
export const MAX_QUESTION_LENGTH = 300;

export interface HistoryTurn {
  role: "user" | "assistant";
  text: string;
}

export interface Answer {
  text: string;
  /** ai = answered by the model; unavailable = no AI configured; busy = AI down or rate-limited. */
  source: "ai" | "unavailable" | "busy";
  /** Tools the model used, in order (for logs and tests). */
  tools: string[];
}

// Shown when there is no AI to ask. The viewer's language isn't known without the AI, so these
// are bilingual.
export const UNAVAILABLE =
  "Ask isn't switched on for this site yet. The live score above is always up to date. / Ask abhi chalu nahi hai; upar ka live score hamesha sahi hai.";
export const BUSY =
  "The assistant is busy right now. Please ask again in a minute; the live score above is always up to date. / Abhi busy hai, ek minute baad poochhiye.";
const NO_ANSWER = "Sorry, I couldn't work that out from the match data. Try asking it another way.";

export async function answerQuestion(
  ctx: AgentContext,
  question: string,
  history: HistoryTurn[] = [],
  model: ChatModel | null = geminiModel(),
): Promise<Answer> {
  const q = question.trim().slice(0, MAX_QUESTION_LENGTH);
  if (!model) return { text: UNAVAILABLE, source: "unavailable", tools: [] };

  // Earlier turns let follow-ups work ("and the other batter?").
  const contents: Content[] = history
    .slice(-4)
    .map((t) => ({ role: t.role === "user" ? "user" : "model", parts: [{ text: t.text.slice(0, MAX_QUESTION_LENGTH) }] }));
  contents.push({ role: "user", parts: [{ text: q }] });
  const declarations = TOOLS.map(({ name, description, parameters }) => ({ name, description, parameters }));
  const system = systemPrompt(ctx);
  const used: string[] = [];

  try {
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      // On the last round the tools are withheld, so the model has to answer with what it has.
      const reply = await model.chat({ system, contents, tools: round < MAX_TOOL_ROUNDS ? declarations : [] });
      if (!reply.toolCalls.length) {
        return { text: reply.text || NO_ANSWER, source: "ai", tools: used };
      }
      contents.push(reply.content);
      // Several calls in one round run at the same time (some read the database).
      used.push(...reply.toolCalls.map((c) => c.name));
      const results = await Promise.all(reply.toolCalls.map((call) => runTool(ctx, call.name, call.args ?? {})));
      contents.push({
        role: "user",
        parts: reply.toolCalls.map((call, i) => ({ functionResponse: { name: call.name, response: results[i], ...(call.id ? { id: call.id } : {}) } })),
      });
    }
    return { text: NO_ANSWER, source: "ai", tools: used };
  } catch (e) {
    if (e instanceof LlmUnavailableError) return { text: BUSY, source: "busy", tools: used };
    throw e;
  }
}
