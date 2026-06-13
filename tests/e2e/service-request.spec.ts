import { expect, test } from "@playwright/test";

/**
 * T104 E2E — service request intake. Note: there is no public `/service-requests`
 * page; the intake form lives at `/dashboard/new` (auth-protected) and the API
 * is `POST /api/service-requests`. We assert both surfaces behave: the form
 * route is wired (loads or redirects to sign-in, never 5xx), and the API
 * rejects an unauthenticated submission rather than staging a request.
 */
test("/dashboard/new intake form loads or redirects without crashing", async ({ page }) => {
  const res = await page.goto("/dashboard/new");
  expect(res, "navigation should yield a response").not.toBeNull();
  expect(res!.status(), "intake route must not 5xx").toBeLessThan(500);
});

test("POST /api/service-requests rejects an unauthenticated submission", async ({ request }) => {
  const res = await request.post("/api/service-requests", {
    data: { caseCaption: "x", plaintiffName: "p", defendantName: "d", recipientWallet: "w", attested: true },
  });
  // Unauthenticated → 401 (or 429 if a prior test exhausted the IP budget);
  // the one thing it must never be is a 2xx that staged a real request.
  expect([401, 429]).toContain(res.status());
});
