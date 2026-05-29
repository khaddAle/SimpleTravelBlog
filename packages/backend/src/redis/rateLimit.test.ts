import { describe, it, expect, beforeEach } from 'vitest';
import RedisMock from 'ioredis-mock';
import type { Redis } from 'ioredis';
import {
  recordLoginFailure,
  isLoginLimited,
  clearLoginFailures,
} from './rateLimit.js';

let redis: Redis;
beforeEach(() => {
  redis = new RedisMock() as unknown as Redis;
});

const opts = { max: 6, windowSeconds: 900 };

describe('login rate limiting', () => {
  it('counts failures and flags the limit at the threshold', async () => {
    let result = { count: 0, limited: false };
    for (let i = 0; i < 5; i++) {
      result = await recordLoginFailure(redis, 'alice:1.2.3.4', opts);
    }
    expect(result).toEqual({ count: 5, limited: false });

    result = await recordLoginFailure(redis, 'alice:1.2.3.4', opts);
    expect(result).toEqual({ count: 6, limited: true });
  });

  it('sets the window TTL on the first failure only', async () => {
    await recordLoginFailure(redis, 'bob:1.1.1.1', opts);
    const ttl1 = await redis.ttl('loginfails:bob:1.1.1.1');
    expect(ttl1).toBeGreaterThan(0);
    expect(ttl1).toBeLessThanOrEqual(900);
  });

  it('reports isLoginLimited once the threshold is reached', async () => {
    for (let i = 0; i < 6; i++) {
      await recordLoginFailure(redis, 'carol:8.8.8.8', opts);
    }
    expect(await isLoginLimited(redis, 'carol:8.8.8.8', 6)).toBe(true);
    expect(await isLoginLimited(redis, 'unknown:0.0.0.0', 6)).toBe(false);
  });

  it('clears failures on a successful login', async () => {
    await recordLoginFailure(redis, 'dave:9.9.9.9', opts);
    await clearLoginFailures(redis, 'dave:9.9.9.9');
    expect(await isLoginLimited(redis, 'dave:9.9.9.9', 1)).toBe(false);
  });
});
