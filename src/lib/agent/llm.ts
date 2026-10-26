// LLM adapter. Gemini today; another provider (Groq, a paid model) can replace this file
// without touching the agent, as long as it implements `ChatModel`.
//
// Env: GEMINI_API_KEY (required for Ask), GEMINI_MODEL (optional, default below),
//      GEMINI_API_BASE (optional, defaults to Google's API).

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
  // GEMINI_API_BASE is optional: a proxy, or a stand-in Gemini in end-to-end tests.
  const base = (process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com").replace(/\/$/, "");
  const url = `${base}/v1beta/models/${model}:generateContent`;

  const call = async (body: string): Promise<Response> => {
    try {
      return await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body,
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      return new Response(null, { status: 599 }); // network error or timeout: treated like a 5xx
    }
  };

  return {
    async chat({ system, contents, tools }) {
      const body = JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
        // No tools on the final round (an empty declaration list can be rejected).
        ...(tools.length ? { tools: [{ functionDeclarations: tools }] } : {}),
        generationConfig: { temperature: 0.2, maxOutputTokens: 600 },
      });
      let res = await call(body);
      // One retry for a busy (429) or failing (5xx) service: these are usually momentary.
      if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, 800));
        res = await call(body);
      }
      if (res.status === 429) throw new LlmUnavailableError("The AI is busy right now (rate limit).");
      if (!res.ok) throw new LlmUnavailableError(`The AI service returned an error (${res.status}).`);

      const data = (await res.json()) as { candidates?: { content?: Content }[] };
      const content: Content = data.candidates?.[0]?.content ?? { role: "model", parts: [] };
      content.role = "model";
      content.parts ??= [];
      const text = content.parts
        .map((p) => (typeof p.text === "string" && !p.thought ? p.text : ""))
        .join("")
        .trim();
      const toolCalls = content.parts.filter((p) => p.functionCall).map((p) => p.functionCall as ToolCall);
      return { content, text, toolCalls };
    },
  };
}
