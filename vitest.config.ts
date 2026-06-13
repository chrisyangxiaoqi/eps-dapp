import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit suite: every *.test.ts under the repo EXCEPT the integration suite,
// which requires external services (solana-test-validator, etc.) and runs in
// its own CI job via `pnpm test:integration` (vitest run tests/integration).
export default defineConfig({
  // Mirror the `@/*` -> repo-root alias from tsconfig.json so app/lib modules
  // that import via `@/...` resolve under vitest.
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  // tsconfig.json uses `jsx: "preserve"` for Next's compiler, which tells the
  // bundler to leave JSX untransformed. The unit suite renders server
  // components (e.g. the public notice page) via react-dom/server, so override
  // to the automatic runtime just for tests. Vitest 4 transforms with oxc, so
  // the override goes here (the `esbuild` option is ignored under oxc).
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "node",
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["**/node_modules/**", "**/.next/**", "tests/integration/**"],
  },
});
