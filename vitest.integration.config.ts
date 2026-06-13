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
    // Stub env vars (DATABASE_URL, RESEND_API_KEY, …) so modules that validate
    // the environment at import time (lib/env, imported transitively by worker
    // code under test) load under the integration suite too. The stub uses
    // `??=`, so real CI-supplied values still win (same as the unit suite).
    setupFiles: ["./test/setup-env.ts"],
    include: ["tests/integration/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/.next/**"],
  },
});
