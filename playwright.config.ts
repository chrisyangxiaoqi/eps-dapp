import { defineConfig } from "@playwright/test";

/**
 * Playwright e2e smoke suite (T-507). Runs against a locally built+started
 * Next.js server. The smoke tests deliberately exercise only endpoints/pages
 * that work without a real Clerk/Stripe/DB backend, so CI can run them with
 * stub env vars (see `.github/workflows/ci.yml`).
 */
export default defineConfig({
  testDir: "./tests/e2e",
  // Fail the build on CI if test.only is committed; retry once to absorb the
  // occasional cold-start flake of the freshly built server.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: process.env.BASE_URL || "http://localhost:3000",
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium", headless: true },
    },
  ],
  webServer: {
    command: "pnpm build && pnpm start",
    url: "http://localhost:3000",
    timeout: 120_000,
    reuseExistingServer: !!process.env.CI,
  },
});
