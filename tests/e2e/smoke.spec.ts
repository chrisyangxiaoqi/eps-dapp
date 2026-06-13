import { expect, test } from "@playwright/test";

/**
 * P5 gate smoke tests (T-507). These verify the app boots and serves its
 * unauthenticated surfaces correctly. They MUST NOT depend on a real
 * Clerk/Stripe/DB backend — CI runs them with stub env vars, so we only assert
 * on behaviour that holds when those services are absent.
 */

test("health endpoint returns 200 with status ok", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);

  const body = await res.json();
  // `status` is always 'ok' (liveness). The `db` field may be 'error' with
  // stub DB creds — that's expected here and we deliberately don't assert on it.
  expect(body.status).toBe("ok");
});

test("home page loads without crashing and has a title", async ({ page }) => {
  // Accept a 200 or any redirect chain (e.g. to a Clerk sign-in page) — just
  // assert the server didn't 5xx. `page.goto` returns the final response.
  const res = await page.goto("/");
  expect(res, "navigation should yield a response").not.toBeNull();
  expect(res!.status(), "home page must not 5xx").toBeLessThan(500);

  const title = await page.title();
  expect(title.trim().length).toBeGreaterThan(0);
});

test("unknown route returns 404", async ({ request }) => {
  const res = await request.get("/no-such-page");
  expect(res.status()).toBe(404);
});

test("notice page returns 404 for an invalid token", async ({ request }) => {
  // The public notice route 404s on an unknown/malformed token (no enumeration).
  const res = await request.get("/n/not-a-real-token");
  expect(res.status()).toBe(404);
});
