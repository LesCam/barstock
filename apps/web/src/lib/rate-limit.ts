/**
 * Sliding-window rate limiter with a pluggable store interface.
 *
 * Uses Upstash Redis when UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 * are set (shared across instances). Falls back to in-memory (single-process).
 */

import { Redis } from "@upstash/redis";

// ─── Store Interface ─────────────────────────────────────────────────────────

export interface RateLimitStore {
  /** Increment the counter for `key`, return the current count within the window. */
  increment(key: string, windowMs: number): Promise<{ count: number; resetMs: number }>;
}

// ─── In-Memory Store (fallback) ─────────────────────────────────────────────

interface MemEntry { timestamps: number[] }

class InMemoryStore implements RateLimitStore {
  private data = new Map<string, MemEntry>();

  constructor() {
    // Periodic cleanup every 60s to prevent unbounded growth
    if (typeof setInterval !== "undefined") {
      setInterval(() => {
        const now = Date.now();
        for (const [key, entry] of this.data) {
          entry.timestamps = entry.timestamps.filter((t) => now - t < 300_000);
          if (entry.timestamps.length === 0) this.data.delete(key);
        }
      }, 60_000).unref?.();
    }
  }

  async increment(key: string, windowMs: number): Promise<{ count: number; resetMs: number }> {
    const now = Date.now();
    let entry = this.data.get(key);
    if (!entry) {
      entry = { timestamps: [] };
      this.data.set(key, entry);
    }
    entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);
    entry.timestamps.push(now);
    const resetMs = entry.timestamps.length > 0
      ? windowMs - (now - entry.timestamps[0])
      : windowMs;
    return { count: entry.timestamps.length, resetMs };
  }
}

// ─── Upstash Redis Store ────────────────────────────────────────────────────

class UpstashStore implements RateLimitStore {
  private redis: Redis;

  constructor(redis: Redis) {
    this.redis = redis;
  }

  async increment(key: string, windowMs: number): Promise<{ count: number; resetMs: number }> {
    const now = Date.now();
    const windowStart = now - windowMs;
    const rKey = `rl:${key}`;

    // Atomic sliding window: remove expired, add current, count, set TTL
    const pipeline = this.redis.pipeline();
    pipeline.zremrangebyscore(rKey, 0, windowStart);
    pipeline.zadd(rKey, { score: now, member: `${now}:${Math.random()}` });
    pipeline.zcard(rKey);
    pipeline.pexpire(rKey, windowMs);

    const results = await pipeline.exec();
    const count = (results[2] as number) ?? 0;

    return { count, resetMs: windowMs };
  }
}

// ─── Limiter Factory ─────────────────────────────────────────────────────────

interface RateLimiterOptions {
  /** Max requests allowed in the window */
  limit: number;
  /** Window size in milliseconds */
  windowMs: number;
  /** Optional custom store (defaults to auto-detected) */
  store?: RateLimitStore;
}

function createDefaultStore(): RateLimitStore {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    return new UpstashStore(new Redis({ url, token }));
  }
  return new InMemoryStore();
}

const defaultStore = createDefaultStore();

export function createRateLimiter(options: RateLimiterOptions) {
  const store = options.store ?? defaultStore;

  return {
    /**
     * Check + increment. Returns { limited: false } or { limited: true, retryAfterMs }.
     * Key should be a compound string, e.g. `ip:${ip}` or `ip:${ip}:user:${userId}`.
     */
    async check(key: string): Promise<{ limited: boolean; retryAfterMs?: number }> {
      const { count, resetMs } = await store.increment(key, options.windowMs);
      if (count > options.limit) {
        return { limited: true, retryAfterMs: resetMs };
      }
      return { limited: false };
    },
  };
}

// ─── Pre-configured Limiters ─────────────────────────────────────────────────

/** Login, magic link, callbacks: 10 per 15 min per key */
export const authLimiter = createRateLimiter({
  limit: 10,
  windowMs: 15 * 60 * 1000,
});

/** PIN/passcode verification: 5 per 15 min per key */
export const pinLimiter = createRateLimiter({
  limit: 5,
  windowMs: 15 * 60 * 1000,
});

/** Search, exports, reporting: 30 per minute per key */
export const expensiveLimiter = createRateLimiter({
  limit: 30,
  windowMs: 60 * 1000,
});

/** Cron endpoints: 6 per 5 min per key */
export const cronLimiter = createRateLimiter({
  limit: 6,
  windowMs: 5 * 60 * 1000,
});

/** Public endpoints (guide, uploads): 60 per minute per key */
export const publicLimiter = createRateLimiter({
  limit: 60,
  windowMs: 60 * 1000,
});

// ─── Key Helpers ─────────────────────────────────────────────────────────────

/** Extract client IP from request headers */
export function getClientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0].trim()
    ?? request.headers.get("x-real-ip")
    ?? "unknown";
}

/** Build a compound rate-limit key: always includes IP, optionally includes userId */
export function rateLimitKey(ip: string, userId?: string): string {
  return userId ? `ip:${ip}:user:${userId}` : `ip:${ip}`;
}

/** Return a 429 Response with Retry-After header */
export function rateLimitResponse(retryAfterMs: number): Response {
  const retryAfterSec = Math.ceil(retryAfterMs / 1000);
  return new Response(JSON.stringify({ error: "Too Many Requests" }), {
    status: 429,
    headers: {
      "Content-Type": "application/json",
      "Retry-After": String(retryAfterSec),
    },
  });
}
