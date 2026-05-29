import type { Redis } from 'ioredis';

export interface LoginRateOptions {
  /** Number of failures at which further attempts are blocked. */
  max: number;
  /** Sliding window length in seconds. */
  windowSeconds: number;
}

export interface RateLimitResult {
  count: number;
  limited: boolean;
}

const failKey = (key: string): string => `loginfails:${key}`;

/**
 * Record one login failure for `key` (typically `<username>:<ip>`) and report
 * whether the caller is now rate-limited. The window TTL is set on the first
 * failure so the counter expires `windowSeconds` after the first bad attempt.
 */
export async function recordLoginFailure(
  redis: Redis,
  key: string,
  opts: LoginRateOptions,
): Promise<RateLimitResult> {
  const k = failKey(key);
  const count = await redis.incr(k);
  if (count === 1) {
    await redis.expire(k, opts.windowSeconds);
  }
  return { count, limited: count >= opts.max };
}

/** True if `key` has already reached the failure threshold. */
export async function isLoginLimited(
  redis: Redis,
  key: string,
  max: number,
): Promise<boolean> {
  const raw = await redis.get(failKey(key));
  return Number(raw ?? 0) >= max;
}

/** Clear the failure counter (call on a successful login). */
export async function clearLoginFailures(redis: Redis, key: string): Promise<void> {
  await redis.del(failKey(key));
}
