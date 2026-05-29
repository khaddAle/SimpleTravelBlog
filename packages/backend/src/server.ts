import { loadConfig } from './config.js';
import { connectMongo } from './db/connection.js';
import { createRedis } from './redis/client.js';
import { buildApp } from './app.js';

/**
 * Process entrypoint. Loads + validates config, opens Mongo/Redis, builds the
 * app and listens. Kept thin and side-effectful (excluded from coverage); all
 * testable logic lives in app.ts and the modules it composes.
 */
async function main(): Promise<void> {
  const config = loadConfig();

  await connectMongo(config.mongoUri, {
    autoIndex: config.nodeEnv !== 'production',
  });

  const redis = createRedis(config.redis);
  await redis.connect();

  const app = await buildApp({ redis, config, logger: true });
  await app.listen({ host: '0.0.0.0', port: config.port });
}

main().catch((err: unknown) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
