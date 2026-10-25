// LLM adapter. Gemini today; another provider (Groq, a paid model) can replace this file
// without touching the agent, as long as it implements `ChatModel`.
//
// Env: GEMINI_API_KEY (required for AI answers), GEMINI_MODEL (optional, default below).

export interface ToolCall {
  id?: string;
  name: string;
  args: Record<string, unknown>;
}

/** One turn in the conversation, in Gemini's wire format (kept as-is so signatures survive). */
export interface Content {
  role: "user" | "model";
  parts: Record<string, unknown>[];
}

export interface ModelReply {
  /** The model's turn, to append to the conversation unchanged. */
  content: Content;
  text: string;
  toolCalls: ToolCall[];
}

export interface ChatModel {
  chat(input: { system: string; contents: Content[]; tools: { name: string; description: string; parameters: unknown }[] }): Promise<ModelReply>;
}

export class LlmUnavailableError extends Error {
  override name = "LlmUnavailableError";
}

const DEFAULT_MODEL = "gemini-3.8-flash";

export function geminiModel(): ChatModel | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  return {
    async chat({ system, contents, tools }) {
      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents,
            tools: [{ functionDeclarations: tools }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 400 },
          }),
          signal: AbortSignal.timeout(15_000),
        });
      } catch {
        throw new LlmUnavailableError("The AI service did not respond.");
      }
      if (res.status === 429) throw new LlmUnavailableError("The AI is busy right now (free-tier limit).");
      if (!res.ok) throw new LlmUnavailableError(`The AI service returned an error (${res.status}).`);

      const data = (await res.json()) as { candidates?: { content?: Content }[] };
      const content: Content = data.candidates?.[0]?.content ?? { role: "model", parts: [] };
      content.role = "model";
      const text = content.parts
        .map((p) => (typeof p.text === "string" && !p.thought ? p.text : ""))
        .join("")
        .trim();
      const toolCalls = content.parts
        .filter((p) => p.functionCall)
        .map((p) => p.functionCall as ToolCall);
      return { content, text, toolCalls };
    },
  };
}
