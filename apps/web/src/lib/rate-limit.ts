import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export type RateLimitResult = {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
};

export interface RateLimiter {
  limit(identifier: string): Promise<RateLimitResult>;
}

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

if (!redis) {
  console.warn(
    "[rate-limit] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are not set — " +
      "using an in-memory rate limiter. This only works correctly on a single, " +
      "persistent Node process. On serverless or multi-instance deployments each " +
      "instance gets its own counters, so limits are NOT actually enforced across " +
      "the whole app. Set both env vars (from an Upstash Redis database) before " +
      "deploying to production.",
  );
}

/** Single-process fallback so local dev works without an Upstash account.
 * NOT safe across multiple instances — see the warning above. */
class InMemoryRateLimiter implements RateLimiter {
  private hits = new Map<string, { count: number; reset: number }>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  async limit(identifier: string): Promise<RateLimitResult> {
    const now = Date.now();
    const entry = this.hits.get(identifier);
    if (!entry || now > entry.reset) {
      const reset = now + this.windowMs;
      this.hits.set(identifier, { count: 1, reset });
      return { success: true, limit: this.max, remaining: this.max - 1, reset };
    }
    entry.count += 1;
    return {
      success: entry.count <= this.max,
      limit: this.max,
      remaining: Math.max(0, this.max - entry.count),
      reset: entry.reset,
    };
  }
}

function createLimiter(tokens: number, windowSeconds: number, prefix: string): RateLimiter {
  if (redis) {
    return new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(tokens, `${windowSeconds} s`),
      prefix: `ratelimit:${prefix}`,
      analytics: false,
    });
  }
  return new InMemoryRateLimiter(tokens, windowSeconds * 1000);
}

/** Broad protection applied to every /api/* request, keyed by IP (src/proxy.ts). */
export const generalLimiter = createLimiter(60, 60, "general");

/** Stricter, per-user limits for endpoints that trigger expensive external
 * calls (GitHub API, local AI model) — applied inside the route handlers,
 * after the session is already resolved. */
export const importLimiter = createLimiter(5, 60, "import");
export const analysisLimiter = createLimiter(3, 60, "analysis");
export const semanticLimiter = createLimiter(2, 60, "semantic");

export function rateLimitResponse(result: RateLimitResult) {
  return new Response(
    JSON.stringify({
      error: "Too many requests. Please slow down and try again shortly.",
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": Math.max(0, Math.ceil((result.reset - Date.now()) / 1000)).toString(),
        "X-RateLimit-Limit": result.limit.toString(),
        "X-RateLimit-Remaining": result.remaining.toString(),
        "X-RateLimit-Reset": result.reset.toString(),
      },
    },
  );
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
