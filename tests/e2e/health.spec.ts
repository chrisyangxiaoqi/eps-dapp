import { expect, test } from "@playwright/test";

/**
 * T104 E2E — health probe. GET /api/health must always return 200 with
 * `status: "ok"` and a `version`, regardless of whether the DB is reachable
 * (CI runs with stub creds, so `db` may be "error" — we don't assert on it).
 */
test("GET /api/health returns 200 with status ok and a version", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);

  const body = await res.json();
  expect(body.status).toBe("ok");
  expect(typeof body.timestamp).toBe("string");
  expect(body.version).toBe("1.0.0");
  // `db` is "connected" with a real DB, "error" with stub creds — both valid.
  expect(["connected", "error"]).toContain(body.db);
});
