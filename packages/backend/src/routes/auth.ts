import type { FastifyInstance } from 'fastify';
import { loginRequestSchema, changePasswordRequestSchema } from '@stb/shared';
import type { Redis } from 'ioredis';
import type { Config } from '../config.js';
import type { AuthHooks } from '../auth/requireAuth.js';
import { User } from '../db/models/User.js';
import { verifyPassword, hashPassword } from '../auth/hash.js';
import { createSession, destroySession } from '../redis/sessions.js';
import {
  isLoginLimited,
  recordLoginFailure,
  clearLoginFailures,
} from '../redis/rateLimit.js';
import {
  signSessionId,
  sessionCookieOptions,
  clearSessionCookieOptions,
  SESSION_COOKIE_NAME,
} from '../auth/sessionCookie.js';
import { generateCsrfToken, CSRF_COOKIE_NAME } from '../auth/csrf.js';

const LOGIN_MAX = 6;
const LOGIN_WINDOW_SECONDS = 900;

export interface AuthRouteDeps {
  redis: Redis;
  config: Config;
  hooks: AuthHooks;
}

export function registerAuthRoutes(app: FastifyInstance, deps: AuthRouteDeps): void {
  const { redis, config, hooks } = deps;
  const secure = config.nodeEnv === 'production';

  app.post('/api/auth/login', async (req, reply) => {
    const parsed = loginRequestSchema.safeParse(req.body);
    if (!parsed.success) throw app.httpErrors.badRequest('invalid credentials payload');

    const username = parsed.data.username.toLowerCase().trim();
    const rlKey = `${username}:${req.ip}`;

    if (await isLoginLimited(redis, rlKey, LOGIN_MAX)) {
      throw app.httpErrors.tooManyRequests('too many login attempts');
    }

    const user = await User.findOne({ username });
    const ok =
      !!user &&
      !user.deactivatedAt &&
      (await verifyPassword(user.passwordHash, parsed.data.password));

    if (!ok) {
      const { limited } = await recordLoginFailure(redis, rlKey, {
        max: LOGIN_MAX,
        windowSeconds: LOGIN_WINDOW_SECONDS,
      });
      if (limited) throw app.httpErrors.tooManyRequests('too many login attempts');
      throw app.httpErrors.unauthorized('invalid credentials');
    }

    await clearLoginFailures(redis, rlKey);

    const csrfSecret = generateCsrfToken();
    const sid = await createSession(
      redis,
      { userId: String(user._id), csrfSecret },
      config.sessionTtlSeconds,
    );

    reply
      .setCookie(
        SESSION_COOKIE_NAME,
        signSessionId(sid, config.sessionCookieSecret),
        sessionCookieOptions({ maxAgeSeconds: config.sessionTtlSeconds, secure }),
      )
      // Readable (non-HttpOnly) so the SPA can echo it in the X-CSRF-Token header.
      .setCookie(CSRF_COOKIE_NAME, csrfSecret, {
        httpOnly: false,
        secure,
        sameSite: 'lax',
        path: '/',
        maxAge: config.sessionTtlSeconds,
      });

    return { user: { id: String(user._id), username: user.username, role: user.role } };
  });

  app.get('/api/auth/me', { preHandler: hooks.requireAuth }, async (req) => {
    return { user: req.authUser };
  });

  app.post(
    '/api/auth/change-password',
    { preHandler: [hooks.requireAuth, hooks.requireCsrf] },
    async (req, reply) => {
      const parsed = changePasswordRequestSchema.safeParse(req.body);
      if (!parsed.success) throw app.httpErrors.badRequest('invalid password payload');

      const user = await User.findById(req.authUser!.id);
      if (!user) throw app.httpErrors.unauthorized('unknown user');

      // The current password must match before we rotate it.
      if (!(await verifyPassword(user.passwordHash, parsed.data.oldPassword))) {
        reply.code(400);
        return { error: 'invalid_current_password' };
      }

      user.passwordHash = await hashPassword(parsed.data.newPassword);
      await user.save();
      // Other sessions are intentionally left valid (see change-password
      // decision); only the password hash changes.
      return { ok: true };
    },
  );

  app.post(
    '/api/auth/logout',
    { preHandler: [hooks.requireAuth, hooks.requireCsrf] },
    async (req, reply) => {
      if (req.session) await destroySession(redis, req.session.id);
      reply.clearCookie(SESSION_COOKIE_NAME, clearSessionCookieOptions(secure));
      reply.clearCookie(CSRF_COOKIE_NAME, { path: '/' });
      return { ok: true };
    },
  );
}
