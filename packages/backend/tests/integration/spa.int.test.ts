import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import RedisMock from 'ioredis-mock';
import type { Redis } from 'ioredis';
import type { FastifyInstance } from 'fastify';
import { loadConfig } from '../../src/config.js';
import { buildApp } from '../../src/app.js';
import { createMemoryStorage } from '../helpers.js';

const INDEX_HTML =
  '<!doctype html><html><head><title>TravelBlog</title></head>' +
  '<body><div id="app"></div></body></html>';
const ASSET_JS = 'console.log("hello from asset");';

/**
 * The built SPA is served by the same Fastify app that serves the API: real
 * asset paths come from disk, every other non-API GET falls back to index.html
 * (the SPA is hash-routed), and API / non-GET misses keep returning JSON 404s.
 */
describe('SPA static serving', () => {
  let app: FastifyInstance;
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'stb-spa-'));
    await writeFile(path.join(root, 'index.html'), INDEX_HTML);
    await mkdir(path.join(root, 'assets'));
    await writeFile(path.join(root, 'assets', 'app.js'), ASSET_JS);

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
    app = await buildApp({
      redis,
      config,
      storage: createMemoryStorage(),
      staticRoot: root,
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await rm(root, { recursive: true, force: true });
  });

  it('serves index.html at the root', async () => {
    const res = await request(app.server).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<div id="app">');
  });

  it('serves real static assets from disk', async () => {
    const res = await request(app.server).get('/assets/app.js');
    expect(res.status).toBe(200);
    expect(res.text).toContain('hello from asset');
  });

  it('falls back to index.html for unknown client routes (GET, non-API)', async () => {
    const res = await request(app.server).get('/archiv/2024');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<div id="app">');
  });

  it('still serves API/health routes without shadowing them', async () => {
    const res = await request(app.server).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('returns JSON 404 for unknown API paths, not index.html', async () => {
    const res = await request(app.server).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.text).not.toContain('<div id="app">');
  });

  it('returns 404 for non-GET unknown routes', async () => {
    const res = await request(app.server).post('/totally/unknown');
    expect(res.status).toBe(404);
  });
});
