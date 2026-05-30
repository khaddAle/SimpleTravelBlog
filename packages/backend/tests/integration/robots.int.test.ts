import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from '../helpers.js';

// A private family blog must stay out of search engines (target-picture §11):
// every response carries an X-Robots-Tag and /robots.txt disallows all crawlers.
describe('search-engine exclusion (integration)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    ({ app } = await buildTestApp());
  });
  afterAll(async () => {
    await app.close();
  });

  it('serves /robots.txt disallowing all crawlers', async () => {
    const res = await app.inject({ method: 'GET', url: '/robots.txt' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.body).toContain('User-agent: *');
    expect(res.body).toContain('Disallow: /');
  });

  it('sets X-Robots-Tag: noindex, nofollow on every response', async () => {
    const health = await app.inject({ method: 'GET', url: '/healthz' });
    expect(health.headers['x-robots-tag']).toBe('noindex, nofollow');

    const robots = await app.inject({ method: 'GET', url: '/robots.txt' });
    expect(robots.headers['x-robots-tag']).toBe('noindex, nofollow');
  });
});
