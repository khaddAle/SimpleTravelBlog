import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import sensible from '@fastify/sensible';
import multipart from '@fastify/multipart';
import sharp from 'sharp';
import type { Redis } from 'ioredis';
import type { Config } from './config.js';
import { createAuthHooks } from './auth/requireAuth.js';
import { createStorage, type ObjectStorage } from './storage/s3.js';
import { createProgressHub, type ProgressHub } from './images/progress.js';
import { createSemaphore, type Semaphore } from './lib/semaphore.js';
import type { RouteContext } from './routes/context.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerRobots } from './robots.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerPostRoutes } from './routes/posts.js';
import { registerTripRoutes } from './routes/trips.js';
import { registerImageRoutes } from './routes/images.js';
import { registerUserRoutes } from './routes/users.js';
import { registerSettingsRoutes } from './routes/settings.js';
import { registerPublicRoutes } from './routes/public.js';
import { registerSpaStatic } from './spa.js';

export interface AppDeps {
  redis: Redis;
  config: Config;
  /** Enable Fastify's built-in pino logger (JSON to stdout). Off in tests. */
  logger?: boolean;
  /** Injectable for tests; defaults to a real S3/MinIO-backed store. */
  storage?: ObjectStorage;
  /** Injectable for tests; defaults to a fresh in-process hub. */
  progress?: ProgressHub;
  /** Injectable for tests/observation; defaults to one sized from config. */
  limiter?: Semaphore;
  /**
   * Absolute path to the built SPA (`packages/frontend/dist`). When set, the app
   * also serves the static frontend with an index.html fallback for client
   * routes. Omitted in API-only tests; set by the production entrypoint.
   */
  staticRoot?: string;
}

/**
 * Compose the Fastify application (plugins + routes) without binding a socket.
 * `server.ts` is the thin entrypoint that builds this and calls `listen`; tests
 * build it directly and drive it with supertest/inject.
 */
export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: deps.logger ?? false, trustProxy: true });

  // Pin libvips to one thread per pipeline: without this each concurrent sharp
  // decode spawns `cores` threads, multiplying CPU and memory. Global and
  // idempotent, so a per-buildApp call is harmless in tests.
  sharp.concurrency(1);

  await app.register(sensible);
  await app.register(cookie);
  await app.register(multipart, {
    limits: { fileSize: deps.config.maxUploadBytes, files: 1 },
  });

  const hooks = createAuthHooks({
    redis: deps.redis,
    sessionSecret: deps.config.sessionCookieSecret,
  });

  const ctx: RouteContext = {
    redis: deps.redis,
    config: deps.config,
    hooks,
    storage: deps.storage ?? createStorage(deps.config.s3),
    progress: deps.progress ?? createProgressHub(deps.redis),
    limiter: deps.limiter ?? createSemaphore(deps.config.imagePipelineConcurrency),
  };

  registerRobots(app);
  registerHealthRoutes(app);
  registerAuthRoutes(app, { redis: deps.redis, config: deps.config, hooks });
  registerPostRoutes(app, ctx);
  registerTripRoutes(app, ctx);
  registerImageRoutes(app, ctx);
  registerUserRoutes(app, ctx);
  registerSettingsRoutes(app, ctx);
  registerPublicRoutes(app, ctx);

  // Registered last so the SPA wildcard never shadows the API routes above.
  if (deps.staticRoot) {
    await registerSpaStatic(app, { root: deps.staticRoot });
  }

  return app;
}
