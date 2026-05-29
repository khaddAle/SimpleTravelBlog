/**
 * Standalone E2E harness server. Boots the *real* Fastify app against hermetic,
 * in-process backing services so Playwright can drive the actual SPA + API with
 * no external infrastructure:
 *
 *   - Mongo:   an in-memory `MongoMemoryReplSet` (replica set → `$text` + txns),
 *   - Redis:   `ioredis-mock` (in-process; same process as the app),
 *   - Storage: an in-memory {@link ObjectStorage} (the integration-test double),
 *   - SPA:     the built `packages/frontend/dist` served via `@fastify/static`,
 *              with a catch-all that returns `index.html` for client routes.
 *
 * One admin user is seeded so the auth journeys have credentials. This file is
 * test-only (under `tests/`, excluded from the backend build) and is launched by
 * Playwright's `webServer` block via `tsx`. It is NOT the production entrypoint
 * (`src/server.ts`), which talks to real Mongo/Redis/MinIO.
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import RedisMock from 'ioredis-mock';
import type { Redis } from 'ioredis';
import { loadConfig } from '../src/config.js';
import { connectMongo, disconnectMongo } from '../src/db/connection.js';
import { buildApp } from '../src/app.js';
import { ensureFirstAdmin } from '../src/bootstrap/firstAdmin.js';
import { createMemoryStorage } from './helpers.js';

const PORT = Number(process.env.E2E_PORT ?? 4000);
const HOST = process.env.E2E_HOST ?? '127.0.0.1';
const ADMIN_USERNAME = process.env.E2E_ADMIN_USERNAME ?? 'admin';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'admin-password-123';

const frontendDist = path.resolve(
  fileURLToPath(import.meta.url),
  '../../../frontend/dist',
);

async function main(): Promise<void> {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await connectMongo(replSet.getUri(), { autoIndex: true });

  const redis = new RedisMock() as unknown as Redis;
  const storage = createMemoryStorage('travel-blog-images-e2e');
  const config = loadConfig({
    NODE_ENV: 'test',
    PORT: String(PORT),
    PUBLIC_ORIGIN: `http://${HOST}:${PORT}`,
    MONGO_URI: replSet.getUri(),
    S3_ENDPOINT: 'http://e2e-minio:9000',
    S3_BUCKET: 'travel-blog-images-e2e',
    S3_ACCESS_KEY: 'e2e-access',
    S3_SECRET_KEY: 'e2e-secret',
    SESSION_COOKIE_SECRET: 'e2e-session-secret-0123456789abcdef',
    CSRF_COOKIE_SECRET: 'e2e-csrf-secret-0123456789abcdef',
    ADMIN_BOOTSTRAP_USERNAME: ADMIN_USERNAME,
    ADMIN_BOOTSTRAP_PASSWORD: ADMIN_PASSWORD,
  });

  // Seed the first admin through the real first-run bootstrap module, and serve
  // the built SPA via the real static-serving path (both wired into buildApp).
  await ensureFirstAdmin(config);
  const app = await buildApp({ redis, config, storage, staticRoot: frontendDist });

  await app.listen({ host: HOST, port: PORT });
  console.log(`[e2e-harness] listening on http://${HOST}:${PORT}`);

  async function shutdown(): Promise<void> {
    await app.close();
    await disconnectMongo();
    await replSet.stop();
    process.exit(0);
  }
  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
}

main().catch((err: unknown) => {
  console.error('[e2e-harness] fatal startup error:', err);
  process.exit(1);
});
