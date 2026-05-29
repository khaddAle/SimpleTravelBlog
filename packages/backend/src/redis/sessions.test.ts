import { describe, it, expect, beforeEach } from 'vitest';
import RedisMock from 'ioredis-mock';
import type { Redis } from 'ioredis';
import {
  createSession,
  getSession,
  touchSession,
  destroySession,
} from './sessions.js';

let redis: Redis;
beforeEach(() => {
  redis = new RedisMock() as unknown as Redis;
});

describe('sessions', () => {
  const data = { userId: 'u1', csrfSecret: 'secret' };

  it('creates a session and reads it back', async () => {
    const sid = await createSession(redis, data, 1000);
    expect(sid).toHaveLength(32);
    expect(await getSession(redis, sid)).toEqual(data);
  });

  it('sets a TTL on the session key', async () => {
    const sid = await createSession(redis, data, 1000);
    const ttl = await redis.ttl(`sess:${sid}`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(1000);
  });

  it('returns null for an unknown session', async () => {
    expect(await getSession(redis, 'nope')).toBeNull();
  });

  it('slides expiry forward and reports success', async () => {
    const sid = await createSession(redis, data, 10);
    expect(await touchSession(redis, sid, 5000)).toBe(true);
    expect(await redis.ttl(`sess:${sid}`)).toBeGreaterThan(10);
  });

  it('reports failure when touching a missing session', async () => {
    expect(await touchSession(redis, 'gone', 5000)).toBe(false);
  });

  it('destroys a session', async () => {
    const sid = await createSession(redis, data, 1000);
    await destroySession(redis, sid);
    expect(await getSession(redis, sid)).toBeNull();
  });
});
