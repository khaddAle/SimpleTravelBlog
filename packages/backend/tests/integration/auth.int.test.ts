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

  describe('change password', () => {
    /** Log in as editor1 and return an agent + its CSRF token. */
    async function authed(): Promise<{ agent: ReturnType<typeof request.agent>; csrf: string }> {
      const agent = request.agent(app.server);
      const res = await agent
        .post('/api/auth/login')
        .send({ username: 'editor1', password: 'correct-password' });
      return { agent, csrf: cookieValue(res.headers['set-cookie'], 'csrf')! };
    }

    it('changes the password and lets the user log in with the new one', async () => {
      const { agent, csrf } = await authed();
      const res = await agent.post('/api/auth/change-password').set('x-csrf-token', csrf).send({
        oldPassword: 'correct-password',
        newPassword: 'brand-new-password',
        newPasswordConfirm: 'brand-new-password',
      });
      expect(res.status).toBe(200);

      // Old password no longer works; new one does.
      expect((await login('editor1', 'correct-password')).status).toBe(401);
      expect((await login('editor1', 'brand-new-password')).status).toBe(200);
    });

    it('keeps the current session valid after a password change', async () => {
      const { agent, csrf } = await authed();
      await agent.post('/api/auth/change-password').set('x-csrf-token', csrf).send({
        oldPassword: 'correct-password',
        newPassword: 'brand-new-password',
        newPasswordConfirm: 'brand-new-password',
      });
      // Same agent (same session cookie) is still authenticated.
      expect((await agent.get('/api/auth/me')).status).toBe(200);
    });

    it('rejects a wrong current password without changing it', async () => {
      const { agent, csrf } = await authed();
      const res = await agent.post('/api/auth/change-password').set('x-csrf-token', csrf).send({
        oldPassword: 'wrong-current',
        newPassword: 'brand-new-password',
        newPasswordConfirm: 'brand-new-password',
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_current_password');
      // Original password still works.
      expect((await login('editor1', 'correct-password')).status).toBe(200);
    });

    it('rejects mismatched new passwords (400)', async () => {
      const { agent, csrf } = await authed();
      const res = await agent.post('/api/auth/change-password').set('x-csrf-token', csrf).send({
        oldPassword: 'correct-password',
        newPassword: 'brand-new-password',
        newPasswordConfirm: 'different-typo',
      });
      expect(res.status).toBe(400);
    });

    it('requires CSRF to change the password', async () => {
      const { agent } = await authed();
      const res = await agent.post('/api/auth/change-password').send({
        oldPassword: 'correct-password',
        newPassword: 'brand-new-password',
        newPasswordConfirm: 'brand-new-password',
      });
      expect(res.status).toBe(403);
    });

    it('blocks an unauthenticated password change (401)', async () => {
      const res = await request(app.server).post('/api/auth/change-password').send({
        oldPassword: 'correct-password',
        newPassword: 'brand-new-password',
        newPasswordConfirm: 'brand-new-password',
      });
      expect(res.status).toBe(401);
    });
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
