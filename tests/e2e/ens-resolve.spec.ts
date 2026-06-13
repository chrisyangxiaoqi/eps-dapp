import { expect, test } from "@playwright/test";

/**
 * T104 E2E — ENS resolve endpoint. Resolution depends on an external RPC that
 * isn't guaranteed in CI, so we assert the endpoint *contract* rather than a
 * specific address: too-short input is rejected (400), and a valid name yields
 * a JSON response that either carries a resolved address (200) or fails
 * gracefully (5xx) — never a hang or a non-JSON crash.
 */
test("rejects too-short input with 400", async ({ request }) => {
  const res = await request.get("/api/ens/resolve?input=ab");
  expect(res.status()).toBe(400);
});

test("resolves vitalik.eth to an address (or fails gracefully)", async ({ request }) => {
  const res = await request.get("/api/ens/resolve?input=vitalik.eth");
  const body = await res.json();

  if (res.status() === 200) {
    // When the RPC is reachable, the resolver returns an address for the name.
    const addr = body.address ?? body.resolvedAddress ?? body.evmAddress;
    expect(typeof addr === "string" && addr.length > 0).toBe(true);
  } else {
    // No RPC in this environment — the route must degrade to a JSON error.
    expect(body).toHaveProperty("error");
  }
});
