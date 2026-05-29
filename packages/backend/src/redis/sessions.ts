import type { Redis } from 'ioredis';
import { nanoid } from 'nanoid';

export interface SessionData {
  userId: string;
  /** Per-session secret used to derive/verify the double-submit CSRF token. */
  csrfSecret: string;
}

const sessionKey = (sid: string): string => `sess:${sid}`;

/** Create a session, returning the opaque session id (cookie value). */
export async function createSession(
  redis: Redis,
  data: SessionData,
  ttlSeconds: number,
): Promise<string> {
  const sid = nanoid(32);
  await redis.set(sessionKey(sid), JSON.stringify(data), 'EX', ttlSeconds);
  return sid;
}

export async function getSession(
  redis: Redis,
  sid: string,
): Promise<SessionData | null> {
  const raw = await redis.get(sessionKey(sid));
  if (!raw) return null;
  return JSON.parse(raw) as SessionData;
}

/** Slide the session's expiry forward. Returns false if the session is gone. */
export async function touchSession(
  redis: Redis,
  sid: string,
  ttlSeconds: number,
): Promise<boolean> {
  return (await redis.expire(sessionKey(sid), ttlSeconds)) === 1;
}

export async function destroySession(redis: Redis, sid: string): Promise<void> {
  await redis.del(sessionKey(sid));
}
