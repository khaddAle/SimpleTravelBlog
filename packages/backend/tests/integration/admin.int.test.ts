import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';
import { useTestDatabase } from '../db.js';
import { buildTestApp, authedAgent } from '../helpers.js';

describe('admin (users + settings) integration', () => {
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
  });

  describe('users', () => {
    it('forbids editors from listing users (403)', async () => {
      const editor = await authedAgent(app, { username: 'ed', role: 'editor' });
      const res = await editor.agent.get('/api/users');
      expect(res.status).toBe(403);
    });

    it('lets an admin create, list, and deactivate users', async () => {
      const admin = await authedAgent(app, { username: 'boss', role: 'admin' });

      const created = await admin.agent
        .post('/api/users')
        .set('x-csrf-token', admin.csrf)
        .send({ username: 'NewEditor', password: 'longenough', role: 'editor' });
      expect(created.status).toBe(201);
      expect(created.body.user).toMatchObject({
        username: 'neweditor',
        role: 'editor',
        deactivated: false,
      });
      const newId = created.body.user.id;

      const list = await admin.agent.get('/api/users');
      expect(list.status).toBe(200);
      expect(list.body.users.map((u: { username: string }) => u.username)).toContain(
        'neweditor',
      );

      // Deactivate, then the user can no longer log in.
      const deactivated = await admin.agent
        .patch(`/api/users/${newId}`)
        .set('x-csrf-token', admin.csrf)
        .send({ deactivated: true });
      expect(deactivated.body.user.deactivated).toBe(true);

      const login = await admin.agent
        .post('/api/auth/login')
        .send({ username: 'neweditor', password: 'longenough' });
      expect(login.status).toBe(401);
    });

    it('rejects a duplicate username with 409', async () => {
      const admin = await authedAgent(app, { username: 'boss', role: 'admin' });
      const body = { username: 'dupe', password: 'longenough', role: 'editor' as const };
      await admin.agent.post('/api/users').set('x-csrf-token', admin.csrf).send(body);
      const dup = await admin.agent
        .post('/api/users')
        .set('x-csrf-token', admin.csrf)
        .send(body);
      expect(dup.status).toBe(409);
    });

    it('requires the CSRF header to create a user (403)', async () => {
      const admin = await authedAgent(app, { username: 'boss', role: 'admin' });
      const res = await admin.agent
        .post('/api/users')
        .send({ username: 'x', password: 'longenough', role: 'editor' });
      expect(res.status).toBe(403);
    });

    it('updates password and role, and can reactivate a user', async () => {
      const admin = await authedAgent(app, { username: 'boss', role: 'admin' });
      const created = await admin.agent
        .post('/api/users')
        .set('x-csrf-token', admin.csrf)
        .send({ username: 'changeme', password: 'longenough', role: 'editor' });
      const id = created.body.user.id;

      const promoted = await admin.agent
        .patch(`/api/users/${id}`)
        .set('x-csrf-token', admin.csrf)
        .send({ password: 'newpassword1', role: 'admin' });
      expect(promoted.body.user.role).toBe('admin');

      // The new password works (checked on a fresh connection, not the agent).
      const login = await request(app.server)
        .post('/api/auth/login')
        .send({ username: 'changeme', password: 'newpassword1' });
      expect(login.status).toBe(200);

      await admin.agent
        .patch(`/api/users/${id}`)
        .set('x-csrf-token', admin.csrf)
        .send({ deactivated: true });
      const reactivated = await admin.agent
        .patch(`/api/users/${id}`)
        .set('x-csrf-token', admin.csrf)
        .send({ deactivated: false });
      expect(reactivated.body.user.deactivated).toBe(false);
    });

    it('404s a patch against an invalid id', async () => {
      const admin = await authedAgent(app, { username: 'boss', role: 'admin' });
      const res = await admin.agent
        .patch('/api/users/not-an-objectid')
        .set('x-csrf-token', admin.csrf)
        .send({ role: 'admin' });
      expect(res.status).toBe(404);
    });
  });

  describe('settings', () => {
    it('returns default branding then persists an update', async () => {
      const editor = await authedAgent(app, { username: 'ed', role: 'editor' });

      const initial = await editor.agent.get('/api/settings');
      expect(initial.status).toBe(200);
      expect(initial.body.settings.siteTitle).toBeTruthy();

      const updated = await editor.agent
        .put('/api/settings')
        .set('x-csrf-token', editor.csrf)
        .send({ siteTitle: 'Unsere Reise', accentColor: '#2b6cb0' });
      expect(updated.status).toBe(200);
      expect(updated.body.settings).toMatchObject({
        siteTitle: 'Unsere Reise',
        accentColor: '#2b6cb0',
      });

      const reread = await editor.agent.get('/api/settings');
      expect(reread.body.settings.siteTitle).toBe('Unsere Reise');
    });

    it('requires the CSRF header to update settings (403)', async () => {
      const editor = await authedAgent(app, { username: 'ed', role: 'editor' });
      const res = await editor.agent
        .put('/api/settings')
        .send({ siteTitle: 'X', accentColor: '#000000' });
      expect(res.status).toBe(403);
    });
  });
});
