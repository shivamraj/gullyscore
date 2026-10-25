import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Test runner settings. Tests live next to the code in __tests__ folders.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
