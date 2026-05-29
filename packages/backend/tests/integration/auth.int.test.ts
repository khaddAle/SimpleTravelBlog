import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';
import { useTestDatabase } from '../db.js';
import { buildTestApp, cookieValue } from '../helpers.js';
import { User } from '../../src/db/models/User.js';
import { hashPassword } from '../../src/auth/hash.js';

describe('auth integration', () => {
  useTestDatabase();

  let app: FastifyInstance;
  let redis: Redis;
  beforeAll(async () => {
    ({ app, redis } = await buildTestApp());
  });
  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await redis.flushall();
    await User.create({
      username: 'editor1',
      passwordHash: await hashPassword('correct-password'),
      role: 'editor',
    });
  });

  const login = (username: string, password: string) =>
    request(app.server).post('/api/auth/login').send({ username, password });

  it('logs in with correct credentials and sets sid + csrf cookies', async () => {
    const res = await login('editor1', 'correct-password');
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ username: 'editor1', role: 'editor' });
    const cookies = res.headers['set-cookie'];
    expect(cookieValue(cookies, 'sid')).toBeTruthy();
    expect(cookieValue(cookies, 'csrf')).toBeTruthy();
  });

  it('rejects a wrong password with 401', async () => {
    const res = await login('editor1', 'nope');
    expect(res.status).toBe(401);
  });

  it('is case-insensitive on the username', async () => {
    const res = await login('EDITOR1', 'correct-password');
    expect(res.status).toBe(200);
  });

  it('serves liveness and readiness endpoints', async () => {
    const health = await request(app.server).get('/healthz');
    expect(health.status).toBe(200);
    expect(health.body).toEqual({ status: 'ok' });
    const ready = await request(app.server).get('/readyz');
    expect(ready.body).toEqual({ status: 'ready' });
  });

  it('blocks /api/auth/me without a session (401)', async () => {
    const res = await request(app.server).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('runs the full login -> me -> CSRF-protected logout flow', async () => {
    const agent = request.agent(app.server);

    const loginRes = await agent.post('/api/auth/login').send({
      username: 'editor1',
      password: 'correct-password',
    });
    expect(loginRes.status).toBe(200);
    const csrf = cookieValue(loginRes.headers['set-cookie'], 'csrf')!;

    const meRes = await agent.get('/api/auth/me');
    expect(meRes.status).toBe(200);
    expect(meRes.body.user.username).toBe('editor1');

    // Mutation without the CSRF header is forbidden.
    const noCsrf = await agent.post('/api/auth/logout');
    expect(noCsrf.status).toBe(403);

    // With the CSRF header it succeeds.
    const logoutRes = await agent.post('/api/auth/logout').set('x-csrf-token', csrf);
    expect(logoutRes.status).toBe(200);

    // Session is gone afterwards.
    const afterLogout = await agent.get('/api/auth/me');
    expect(afterLogout.status).toBe(401);
  });

  it('rate-limits after 6 bad logins (429)', async () => {
    for (let i = 0; i < 5; i++) {
      const r = await login('editor1', 'bad');
      expect(r.status).toBe(401);
    }
    const sixth = await login('editor1', 'bad');
    expect(sixth.status).toBe(429);

    // Even the correct password is now blocked within the window.
    const blocked = await login('editor1', 'correct-password');
    expect(blocked.status).toBe(429);
  });
});
