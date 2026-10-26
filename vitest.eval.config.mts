import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

// `npm run eval:ask`: runs the Ask agent against the REAL Gemini model on a sample match and
// checks the answers. Reads GEMINI_API_KEY (and GEMINI_MODEL) from .env.local. Kept apart from
// `npm test` because it needs the internet, a key, and a few minutes.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.eval.ts"],
    env: loadEnv("development", process.cwd(), ""),
    testTimeout: 20 * 60_000,
    reporters: ["verbose"],
  },
});
