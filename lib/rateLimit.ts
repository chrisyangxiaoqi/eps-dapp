/**
 * Minimal in-memory fixed-window rate limiter (T-401).
 *
 * The public notice page must be rate-limited without standing up any external
 * service (Redis et al.) — so this is a process-local LRU of fixed-window
 * counters keyed by an arbitrary string (here, the client IP). It counts the
 * requests seen for a key in the current window and resets when the window
 * elapses. In a multi-instance deploy each instance throttles independently,
 * which is acceptable for abuse-throttling a public read-only page.
 */

interface Bucket {
  count: number;
  /** Epoch ms at which this window expires and the count resets. */
  resetAt: number;
}

// Bounded so a flood of distinct keys (e.g. spoofed IPs) cannot grow memory
// without limit. `Map` preserves insertion order, giving us cheap LRU eviction.
const MAX_KEYS = 10_000;
const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  /** True when this request is within the limit; false when it should be rejected. */
  ok: boolean;
  /** Requests still allowed in the current window (0 once over the limit). */
  remaining: number;
  /** Epoch ms when the current window resets. */
  resetAt: number;
}

/**
 * Record one request against `key` and report whether it is within `limit`
 * requests per `windowMs`. `now` is injectable for deterministic tests.
 */
export function rateLimit(
  key: string,
  opts: { limit: number; windowMs: number },
  now: number = Date.now(),
): RateLimitResult {
  const { limit, windowMs } = opts;
  const existing = buckets.get(key);

  let bucket: Bucket;
  if (!existing || now >= existing.resetAt) {
    // Fresh window (new key or the previous window has elapsed).
    bucket = { count: 0, resetAt: now + windowMs };
  } else {
    // Same window: drop and re-insert so the key moves to the LRU "newest" end.
    buckets.delete(key);
    bucket = existing;
  }

  bucket.count += 1;
  buckets.set(key, bucket);

  // Evict the least-recently-used keys if we exceed the cap.
  while (buckets.size > MAX_KEYS) {
    const oldest = buckets.keys().next().value;
    if (oldest === undefined) break;
    buckets.delete(oldest);
  }

  return {
    ok: bucket.count <= limit,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
  };
}

/**
 * Best-effort client IP from standard proxy headers. Returns the first hop in
 * `x-forwarded-for` (the original client), falling back to `x-real-ip`, then a
 * constant so the limiter still buckets requests with no forwarding header.
 */
export function clientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}

/** Test-only: clear all rate-limit state. */
export function __resetRateLimit(): void {
  buckets.clear();
}
