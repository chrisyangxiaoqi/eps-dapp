import { expect, test } from "@playwright/test";

/**
 * T104 E2E — dashboard. The dashboard is auth-protected, so an unauthenticated
 * visit redirects to sign-in (that's expected and OK). We assert only that the
 * route is wired and never 5xx-crashes: `page.goto` follows the redirect chain
 * and we check the final response.
 */
test("/dashboard loads or redirects to sign-in without crashing", async ({ page }) => {
  const res = await page.goto("/dashboard");
  expect(res, "navigation should yield a response").not.toBeNull();
  expect(res!.status(), "dashboard route must not 5xx").toBeLessThan(500);
});
