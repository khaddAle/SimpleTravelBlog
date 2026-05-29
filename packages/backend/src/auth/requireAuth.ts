import type { preHandlerHookHandler } from 'fastify';
import type { Redis } from 'ioredis';
import { getSession, type SessionData } from '../redis/sessions.js';
import { unsignSessionId, SESSION_COOKIE_NAME } from './sessionCookie.js';
import { verifyCsrfToken, CSRF_HEADER } from './csrf.js';
import { User } from '../db/models/User.js';

export type Role = 'admin' | 'editor';
export interface AuthUser {
  id: string;
  username: string;
  role: Role;
}

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: AuthUser;
    session?: SessionData & { id: string };
  }
}

/**
 * Resolve a session from the (signed) session cookie. Pure-ish and exported so
 * the cookie → sid → redis lookup is unit-testable without a Fastify instance.
 */
export async function resolveSession(
  redis: Redis,
  signedCookie: string | undefined,
  secret: string,
): Promise<(SessionData & { id: string }) | null> {
  if (!signedCookie) return null;
  const sid = unsignSessionId(signedCookie, secret);
  if (!sid) return null;
  const data = await getSession(redis, sid);
  if (!data) return null;
  return { ...data, id: sid };
}

export interface AuthHooks {
  requireAuth: preHandlerHookHandler;
  requireCsrf: preHandlerHookHandler;
  requireRole: (role: Role) => preHandlerHookHandler;
}

export function createAuthHooks(deps: { redis: Redis; sessionSecret: string }): AuthHooks {
  const requireAuth: preHandlerHookHandler = async (req) => {
    const signed = req.cookies[SESSION_COOKIE_NAME];
    const session = await resolveSession(deps.redis, signed, deps.sessionSecret);
    if (!session) throw req.server.httpErrors.unauthorized();

    const user = await User.findById(session.userId).lean();
    if (!user || user.deactivatedAt) throw req.server.httpErrors.unauthorized();

    req.authUser = { id: String(user._id), username: user.username, role: user.role as Role };
    req.session = session;
  };

  const requireCsrf: preHandlerHookHandler = async (req) => {
    const header = req.headers[CSRF_HEADER];
    const provided = Array.isArray(header) ? header[0] : header;
    if (!req.session || !verifyCsrfToken(req.session.csrfSecret, provided)) {
      throw req.server.httpErrors.forbidden('invalid CSRF token');
    }
  };

  const requireRole =
    (role: Role): preHandlerHookHandler =>
    async (req) => {
      if (req.authUser?.role !== role) throw req.server.httpErrors.forbidden();
    };

  return { requireAuth, requireCsrf, requireRole };
}
