import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Integration suite: runs ONLY tests/integration, which require external
// services (e.g. a solana-test-validator on localhost:8899) and therefore run
// in their own CI job via `pnpm test:integration`. Kept separate from the unit
// config so the fast unit job never depends on those services.
export default defineConfig({
  // Mirror the `@/*` -> repo-root alias from tsconfig.json so app/lib modules
  // that import via `@/...` resolve under vitest (same as vitest.config.ts).
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/.next/**"],
  },
});
