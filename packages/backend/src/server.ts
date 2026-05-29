import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadConfig } from './config.js';
import { connectMongo } from './db/connection.js';
import { createRedis } from './redis/client.js';
import { buildApp } from './app.js';
import { ensureFirstAdmin } from './bootstrap/firstAdmin.js';

/**
 * Built SPA location. In the container, `dist/server.js` runs from `/app` with
 * the frontend copied to `/app/frontend-dist`; resolving relative to this module
 * keeps it correct regardless of cwd. Overridable via `FRONTEND_DIST`.
 */
const staticRoot =
  process.env.FRONTEND_DIST ??
  path.resolve(fileURLToPath(import.meta.url), '../../frontend-dist');

/**
 * Process entrypoint. Loads + validates config, opens Mongo/Redis, bootstraps
 * the first admin, builds the app (API + SPA) and listens. Kept thin and
 * side-effectful (excluded from coverage); all testable logic lives in app.ts
 * and the modules it composes.
 */
async function main(): Promise<void> {
  const config = loadConfig();

  await connectMongo(config.mongoUri, {
    autoIndex: config.nodeEnv !== 'production',
  });

  const redis = createRedis(config.redis);
  await redis.connect();

  const app = await buildApp({ redis, config, logger: true, staticRoot });
  await ensureFirstAdmin(config, app.log);
  await app.listen({ host: '0.0.0.0', port: config.port });
}

main().catch((err: unknown) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
