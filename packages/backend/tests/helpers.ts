import RedisMock from 'ioredis-mock';
import request from 'supertest';
import type { Redis } from 'ioredis';
import type { FastifyInstance } from 'fastify';
import type { S3Client } from '@aws-sdk/client-s3';
import { loadConfig } from '../src/config.js';
import { buildApp } from '../src/app.js';
import type { ObjectStorage } from '../src/storage/s3.js';
import { User } from '../src/db/models/User.js';
import { hashPassword } from '../src/auth/hash.js';
import type { Role } from '../src/auth/requireAuth.js';

/**
 * In-memory {@link ObjectStorage} for integration tests: stores object bodies in
 * a Map and records every put/delete key so tests can assert the pipeline wrote
 * (or removed) exactly the expected objects without a live S3/MinIO.
 */
export interface MemoryStorage extends ObjectStorage {
  readonly objects: Map<string, { body: Buffer; contentType: string }>;
  readonly puts: string[];
  readonly deletes: string[];
}

export function createMemoryStorage(bucket = 'test-bucket'): MemoryStorage {
  const objects = new Map<string, { body: Buffer; contentType: string }>();
  const puts: string[] = [];
  const deletes: string[] = [];
  return {
    client: {} as S3Client,
    bucket,
    objects,
    puts,
    deletes,
    async putObject(key, body, contentType) {
      objects.set(key, { body, contentType });
      puts.push(key);
    },
    async getObject(key) {
      const obj = objects.get(key);
      if (!obj) throw new Error(`no object at ${key}`);
      return obj.body;
    },
    async deleteObject(key) {
      objects.delete(key);
      deletes.push(key);
    },
  };
}

export interface TestApp {
  app: FastifyInstance;
  redis: Redis;
  storage: MemoryStorage;
}

/**
 * Build a fully-wired app for integration tests: an in-process Redis (ioredis-
 * mock), in-memory object storage, and a config from a fixed test environment.
 * Mongo is provided separately by `useTestDatabase()`, so MONGO_URI here is only
 * a placeholder.
 */
export async function buildTestApp(): Promise<TestApp> {
  const redis = new RedisMock() as unknown as Redis;
  const storage = createMemoryStorage();
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
  const app = await buildApp({ redis, config, storage });
  await app.ready();
  return { app, redis, storage };
}

/** Pull a single cookie's value out of a Set-Cookie response header. */
export function cookieValue(
  setCookie: string[] | string | undefined,
  name: string,
): string | undefined {
  const lines = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const line = lines.find((c) => c.startsWith(`${name}=`));
  return line?.split(';')[0]?.split('=')[1];
}

/** Create a user row directly (bypassing the admin API) for test setup. */
export async function seedUser(opts: {
  username: string;
  password: string;
  role: Role;
}): Promise<string> {
  const user = await User.create({
    username: opts.username.toLowerCase(),
    passwordHash: await hashPassword(opts.password),
    role: opts.role,
  });
  return String(user._id);
}

export interface AuthedAgent {
  agent: ReturnType<typeof request.agent>;
  csrf: string;
  userId: string;
}

/**
 * Seed a user and return a supertest agent already logged in, plus the CSRF
 * token to echo on mutations. Cookies persist on the agent across requests.
 */
export async function authedAgent(
  app: FastifyInstance,
  opts: { username?: string; password?: string; role?: Role } = {},
): Promise<AuthedAgent> {
  const username = opts.username ?? 'editor1';
  const password = opts.password ?? 'correct-password';
  const role = opts.role ?? 'editor';
  const userId = await seedUser({ username, password, role });

  const agent = request.agent(app.server);
  const res = await agent.post('/api/auth/login').send({ username, password });
  if (res.status !== 200) throw new Error(`login failed: ${res.status}`);
  const csrf = cookieValue(res.headers['set-cookie'], 'csrf');
  if (!csrf) throw new Error('no csrf cookie after login');
  return { agent, csrf, userId };
}
