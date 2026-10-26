// LLM adapter. Gemini today; another provider (Groq, a paid model) can replace this file
// without touching the agent, as long as it implements `ChatModel`.
//
// Env: GEMINI_API_KEY (required for Ask), GEMINI_MODEL (optional, default below),
//      GEMINI_FALLBACK_MODELS (optional, comma-separated, tried when the main model is busy),
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
// Tried in order when the main model is overloaded (503) or rate-limited (429). Google's busiest
// model is often the newest one, so an older Flash usually still answers.
const DEFAULT_FALLBACKS = "gemini-3.6-flash,gemini-3.5-flash-lite";
// A model that said "busy" is skipped for this long by this server, so later questions go
// straight to one that works instead of waiting on the busy one first.
const COOLDOWN_MS = 60_000;
const busyUntil = new Map<string, number>();

/** For tests: forget which models were busy. */
export function resetGeminiCooldowns(): void {
  busyUntil.clear();
}

function modelList(): string[] {
  const primary = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const fallbacks = (process.env.GEMINI_FALLBACK_MODELS ?? DEFAULT_FALLBACKS)
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return [...new Set([primary, ...fallbacks])];
}

export function geminiModel(): ChatModel | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const models = modelList();
  // GEMINI_API_BASE is optional: a proxy, or a stand-in Gemini in end-to-end tests.
  const base = (process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com").replace(/\/$/, "");
  // Once a model answers, the rest of this question stays on it: tool rounds carry that model's
  // thought signatures, which another model may not accept.
  let sticky: string | null = null;

  const call = async (model: string, body: string): Promise<Response> => {
    try {
      return await fetch(`${base}/v1beta/models/${model}:generateContent`, {
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
        // Gemini 3 models think before answering, and those thought tokens count against
        // maxOutputTokens. With a small limit the thinking used it all up and the reply came back
        // empty. "low" thinking keeps answers quick; the larger limit leaves room for the answer.
        // Gemini 3 is tuned for its default temperature, so none is set.
        generationConfig: {
          maxOutputTokens: 4096,
          thinkingConfig: { thinkingLevel: process.env.GEMINI_THINKING_LEVEL || "low" },
        },
      });

      // The sticky model first; otherwise models not cooling down, then the cooling ones as a
      // last resort (better a slow try than no answer).
      const now = Date.now();
      const order = sticky
        ? [sticky, ...models.filter((m) => m !== sticky)]
        : [...models.filter((m) => (busyUntil.get(m) ?? 0) <= now), ...models.filter((m) => (busyUntil.get(m) ?? 0) > now)];

      let lastStatus = 0;
      for (const model of order) {
        const res = await call(model, body);
        if (!res.ok) {
          lastStatus = res.status;
          // Google's own message (busy, bad key, unknown model, quota) goes to the server logs
          // instead of hiding behind the viewer's "busy" reply. The key is never logged.
          const detail = (await res.text().catch(() => "")).slice(0, 300);
          console.error(JSON.stringify({ gemini: "request failed", status: res.status, model, detail }));
          if (res.status === 429 || res.status >= 500) busyUntil.set(model, Date.now() + COOLDOWN_MS);
          continue; // try the next model
        }
        busyUntil.delete(model);
        sticky = model;

        const data = (await res.json()) as { candidates?: { content?: Content; finishReason?: string }[]; promptFeedback?: unknown };
        const finish = data.candidates?.[0]?.finishReason;
        if (finish && finish !== "STOP") {
          console.warn(JSON.stringify({ gemini: "unusual finish", finishReason: finish, model, promptFeedback: data.promptFeedback }));
        }
        const content: Content = data.candidates?.[0]?.content ?? { role: "model", parts: [] };
        content.role = "model";
        content.parts ??= [];
        const text = content.parts
          .map((p) => (typeof p.text === "string" && !p.thought ? p.text : ""))
          .join("")
          .trim();
        const toolCalls = content.parts.filter((p) => p.functionCall).map((p) => p.functionCall as ToolCall);
        return { content, text, toolCalls };
      }
      if (lastStatus === 429) throw new LlmUnavailableError("The AI is busy right now (rate limit).");
      throw new LlmUnavailableError(`The AI service returned an error (${lastStatus}).`);
    },
  };
}
