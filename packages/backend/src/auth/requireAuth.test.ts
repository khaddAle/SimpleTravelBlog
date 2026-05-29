import { describe, it, expect, beforeEach } from 'vitest';
import RedisMock from 'ioredis-mock';
import type { Redis } from 'ioredis';
import { createSession } from '../redis/sessions.js';
import { signSessionId } from './sessionCookie.js';
import { resolveSession } from './requireAuth.js';

const secret = 's'.repeat(32);
let redis: Redis;
beforeEach(() => {
  redis = new RedisMock() as unknown as Redis;
});

describe('resolveSession', () => {
  it('returns null when there is no cookie', async () => {
    expect(await resolveSession(redis, undefined, secret)).toBeNull();
  });

  it('returns null for a badly-signed cookie', async () => {
    expect(await resolveSession(redis, 'garbage', secret)).toBeNull();
  });

  it('returns null when the session is not in redis', async () => {
    const signed = signSessionId('missing-sid', secret);
    expect(await resolveSession(redis, signed, secret)).toBeNull();
  });

  it('returns the session data + id for a valid cookie', async () => {
    const sid = await createSession(redis, { userId: 'u1', csrfSecret: 'c1' }, 1000);
    const signed = signSessionId(sid, secret);
    const resolved = await resolveSession(redis, signed, secret);
    expect(resolved).toEqual({ userId: 'u1', csrfSecret: 'c1', id: sid });
  });
});
