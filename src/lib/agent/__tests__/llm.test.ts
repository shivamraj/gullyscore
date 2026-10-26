import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { geminiModel, LlmUnavailableError, resetGeminiCooldowns } from "../llm";

// A fake Gemini: each model answers with the status given, or 200 with a text reply.
function fakeGemini(statusFor: Record<string, number>) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    const model = /models\/([^:]+):/.exec(url)?.[1] ?? "";
    calls.push(model);
    const status = statusFor[model] ?? 200;
    if (status !== 200) return new Response(JSON.stringify({ error: { code: status, message: "busy" } }), { status });
    return new Response(JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ text: `from ${model}` }] }, finishReason: "STOP" }] }), {
      status: 200,
    });
  });
  return calls;
}

const input = { system: "s", contents: [{ role: "user" as const, parts: [{ text: "score?" }] }], tools: [] };

describe("Gemini model fallback", () => {
  beforeEach(() => {
    resetGeminiCooldowns();
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("GEMINI_MODEL", "main");
    vi.stubEnv("GEMINI_FALLBACK_MODELS", "backup1,backup2");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("uses the main model when it answers", async () => {
    const calls = fakeGemini({});
    const reply = await geminiModel()!.chat(input);
    expect(reply.text).toBe("from main");
    expect(calls).toEqual(["main"]);
  });

  it("falls back when the main model is overloaded (503)", async () => {
    const calls = fakeGemini({ main: 503 });
    const reply = await geminiModel()!.chat(input);
    expect(reply.text).toBe("from backup1");
    expect(calls).toEqual(["main", "backup1"]);
  });

  it("skips a busy model for later questions", async () => {
    const calls = fakeGemini({ main: 503 });
    await geminiModel()!.chat(input);
    calls.length = 0;
    const reply = await geminiModel()!.chat(input);
    expect(reply.text).toBe("from backup1");
    expect(calls).toEqual(["backup1"]);
  });

  it("stays on the model that answered for the rest of the question", async () => {
    const calls = fakeGemini({ main: 429 });
    const model = geminiModel()!;
    await model.chat(input);
    await model.chat(input);
    expect(calls).toEqual(["main", "backup1", "backup1"]);
  });

  it("reports busy only when every model fails", async () => {
    fakeGemini({ main: 503, backup1: 503, backup2: 429 });
    await expect(geminiModel()!.chat(input)).rejects.toBeInstanceOf(LlmUnavailableError);
  });
});
