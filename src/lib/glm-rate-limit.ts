// In-memory token bucket rate limiter for GLM AI Advisor calls.
// Process-local Map — fine for v1 (single container deployment).

const WINDOW_MS = 60 * 60 * 1000; // 1 hour

const LIMITS: Record<"live" | "cron", number> = {
  live: 30,
  cron: 100,
};

type BucketEntry = {
  count: number;
  windowStart: number;
};

// Keyed by `${userId}:${bucket}`
const store = new Map<string, BucketEntry>();

export function checkRateLimit(
  userId: string,
  bucket: "live" | "cron",
): { allowed: boolean; remaining: number; resetAt: number } {
  const key = `${userId}:${bucket}`;
  const limit = LIMITS[bucket];
  const now = Date.now();

  let entry = store.get(key);

  if (!entry || now - entry.windowStart > WINDOW_MS) {
    entry = { count: 0, windowStart: now };
    store.set(key, entry);
  }

  const resetAt = entry.windowStart + WINDOW_MS;

  if (entry.count >= limit) {
    return { allowed: false, remaining: 0, resetAt };
  }

  entry.count += 1;
  return { allowed: true, remaining: limit - entry.count, resetAt };
}
