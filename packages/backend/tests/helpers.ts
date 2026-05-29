import RedisMock from 'ioredis-mock';
import type { Redis } from 'ioredis';
import type { FastifyInstance } from 'fastify';
import { loadConfig } from '../src/config.js';
import { buildApp } from '../src/app.js';

/**
 * Build a fully-wired app for integration tests: an in-process Redis (ioredis-
 * mock) and a config from a fixed test environment. Mongo is provided separately
 * by `useTestDatabase()`, so MONGO_URI here is only a placeholder.
 */
export async function buildTestApp(): Promise<{ app: FastifyInstance; redis: Redis }> {
  const redis = new RedisMock() as unknown as Redis;
  const config = loadConfig({
    NODE_ENV: 'test',
    MONGO_URI: 'mongodb://placeholder/test',
    S3_ENDPOINT: 'http://minio:9000',
    S3_BUCKET: 'travel-blog-images-test',
    S3_ACCESS_KEY: 'access',
    S3_SECRET_KEY: 'secret',
    SESSION_COOKIE_SECRET: 'x'.repeat(32),
    CSRF_COOKIE_SECRET: 'y'.repeat(32),
  });
  const app = await buildApp({ redis, config });
  await app.ready();
  return { app, redis };
}

/** Pull a single cookie's value out of a Set-Cookie response header. */
export function cookieValue(setCookie: string[] | string | undefined, name: string): string | undefined {
  const lines = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const line = lines.find((c) => c.startsWith(`${name}=`));
  return line?.split(';')[0]?.split('=')[1];
}
