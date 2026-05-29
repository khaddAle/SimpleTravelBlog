import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import sensible from '@fastify/sensible';
import type { Redis } from 'ioredis';
import type { Config } from './config.js';
import { createAuthHooks } from './auth/requireAuth.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerAuthRoutes } from './routes/auth.js';

export interface AppDeps {
  redis: Redis;
  config: Config;
  /** Enable Fastify's built-in pino logger (JSON to stdout). Off in tests. */
  logger?: boolean;
}

/**
 * Compose the Fastify application (plugins + routes) without binding a socket.
 * `server.ts` is the thin entrypoint that builds this and calls `listen`; tests
 * build it directly and drive it with supertest/inject.
 */
export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: deps.logger ?? false, trustProxy: true });

  await app.register(sensible);
  await app.register(cookie);

  const hooks = createAuthHooks({
    redis: deps.redis,
    sessionSecret: deps.config.sessionCookieSecret,
  });

  registerHealthRoutes(app);
  registerAuthRoutes(app, { redis: deps.redis, config: deps.config, hooks });

  return app;
}
