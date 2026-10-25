// The agent: answers a viewer's question about one match.
//
// 1. Quick path: common questions are answered straight from the match state (quickAnswers.ts).
// 2. AI path: anything else goes to the LLM, which may call read-only tools (tools.ts) up to
//    MAX_TOOL_ROUNDS times before it must answer.

import { geminiModel, LlmUnavailableError, type ChatModel, type Content } from "./llm";
import { systemPrompt } from "./prompt";
import { detectLang, quickAnswer, type Lang } from "./quickAnswers";
import { runTool, TOOLS, type AgentContext } from "./tools";

const MAX_TOOL_ROUNDS = 3;
export const MAX_QUESTION_LENGTH = 300;

export interface HistoryTurn {
  role: "user" | "assistant";
  text: string;
}

export interface Answer {
  text: string;
  source: "quick" | "ai" | "fallback";
}

const FALLBACK: Record<Lang, string> = {
  en: "I can't answer that one yet. Try: What's the score? Who's batting? How many needed? Who's next? When was the last boundary? How many sixes? Last wicket? Last 6 balls? Top scorer? How did a player get out?",
  hinglish: "Iska jawaab abhi nahi de sakta. Ye poochhein: score kya hai? Kaun bat kar raha hai? Kitne run chahiye? Agla batter kaun? Aakhri boundary kab lagi? Kitne chhakke? Aakhri wicket? Top scorer?",
  hi: "इसका जवाब अभी नहीं दे सकता। ये पूछें: स्कोर क्या है? कौन बल्लेबाज़ी कर रहा है? कितने रन चाहिए? अगला बल्लेबाज़ कौन? आखिरी विकेट कब गिरा? कितने छक्के लगे?",
};

const BUSY: Record<Lang, string> = {
  en: "The AI is busy right now. Try one of the quick questions, or ask again in a minute.",
  hinglish: "AI abhi busy hai. Quick questions try karein, ya ek minute baad poochhein.",
  hi: "AI अभी व्यस्त है। कोई आसान सवाल पूछें, या एक मिनट बाद फिर पूछें।",
};

export async function answerQuestion(
  ctx: AgentContext,
  question: string,
  history: HistoryTurn[] = [],
  model: ChatModel | null = geminiModel(),
): Promise<Answer> {
  const q = question.trim().slice(0, MAX_QUESTION_LENGTH);
  const lang = detectLang(q);

  const quick = quickAnswer(ctx, q);
  if (quick) return { text: quick.text, source: "quick" };
  if (!model) return { text: FALLBACK[lang], source: "fallback" };

  // Earlier turns give the AI context for follow-ups ("and the other batter?").
  const contents: Content[] = history.slice(-4).map((t) => ({ role: t.role === "user" ? "user" : "model", parts: [{ text: t.text.slice(0, MAX_QUESTION_LENGTH) }] }));
  contents.push({ role: "user", parts: [{ text: q }] });
  const tools = TOOLS.map(({ name, description, parameters }) => ({ name, description, parameters }));
  const system = systemPrompt(ctx);

  try {
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const reply = await model.chat({ system, contents, tools: round < MAX_TOOL_ROUNDS ? tools : [] });
      if (!reply.toolCalls.length) {
        return reply.text ? { text: reply.text, source: "ai" } : { text: FALLBACK[lang], source: "fallback" };
      }
      contents.push(reply.content);
      contents.push({
        role: "user",
        parts: reply.toolCalls.map((call) => ({
          functionResponse: { name: call.name, response: runTool(ctx, call.name, call.args ?? {}), ...(call.id ? { id: call.id } : {}) },
        })),
      });
    }
    return { text: FALLBACK[lang], source: "fallback" };
  } catch (e) {
    if (e instanceof LlmUnavailableError) return { text: BUSY[lang], source: "fallback" };
    throw e;
  }
}
