/**
 * Rate limiter using D1.
 *
 * Why D1 instead of in-memory?
 * - Cloudflare Workers reuses isolates but new requests can hit fresh isolates.
 * - In-memory counters are unreliable for rate limiting across the fleet.
 * - D1 has eventual consistency (writes visible in <1s globally) which is fine
 *   for this use case.
 *
 * Strategy: sliding window counter per (IP, route).
 * - Each request reads count, increments, writes back.
 * - If count > limit → throw TooManyRequestsError.
 * - Window resets by deleting old rows on schedule (defer to Phase 6 cleanup job).
 *
 * For MVP we cap attempts per minute per IP. Stricter limits can be added later.
 */

import type { MiddlewareHandler } from "hono";
import type { Env } from "../index";
import { TooManyRequestsError } from "../lib/errors";

const DEFAULT_WINDOW_SECONDS = 60;
const DEFAULT_MAX_REQUESTS = 10; // 10 attempts per minute per IP per route

interface RateLimitOptions {
  windowSeconds?: number;
  maxRequests?: number;
}

export function rateLimit(options: RateLimitOptions = {}): MiddlewareHandler<{ Bindings: Env }> {
  const window = options.windowSeconds ?? DEFAULT_WINDOW_SECONDS;
  const max = options.maxRequests ?? DEFAULT_MAX_REQUESTS;

  return async (c, next) => {
    const ip =
      c.req.header("cf-connecting-ip") ??
      c.req.header("x-forwarded-for") ??
      "unknown";
    const route = c.req.path;
    const now = Math.floor(Date.now() / 1000);

    // Strategy: fixed-window counter.
    // Bucket = floor(now / window). All requests in the same window share one row.
    const bucket = Math.floor(now / window);
    const key = `${ip}:${route}:${bucket}`;

    try {
      // Upsert: increment count
      const result = await c.env.DB.prepare(
        `INSERT INTO rate_limit_buckets (key, count, expires_at)
         VALUES (?, 1, ?)
         ON CONFLICT(key) DO UPDATE SET count = count + 1
         RETURNING count`,
      )
        .bind(key, now + window)
        .first<{ count: number } | null>();

      const count = result?.count ?? 1;
      if (count > max) {
        throw new TooManyRequestsError(
          `Quá nhiều request. Vui lòng thử lại sau ${window} giây.`,
        );
      }
    } catch (err) {
      if (err instanceof TooManyRequestsError) throw err;
      // Don't block request if rate-limit infra fails — log and continue.
      console.error("[rate-limit] check failed:", err instanceof Error ? err.message : err);
    }

    await next();
  };
}