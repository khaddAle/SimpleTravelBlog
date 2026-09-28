import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';
import { trackDtoSchema } from '@stb/shared';
import { useTestDatabase } from '../db.js';
import { buildTestApp, authedAgent, type AuthedAgent, type MemoryStorage } from '../helpers.js';
import { makeGpx } from '../gpx.js';

describe('tracks integration', () => {
  useTestDatabase();

  let app: FastifyInstance;
  let redis: Redis;
  let storage: MemoryStorage;
  let auth: AuthedAgent;

  beforeAll(async () => {
    ({ app, redis, storage } = await buildTestApp());
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await redis.flushall();
    storage.objects.clear();
    storage.puts.length = 0;
    storage.deletes.length = 0;
    auth = await authedAgent(app);
  });

  const upload = (body: string, filename = 'lauf.gpx', contentType = 'application/gpx+xml') =>
    auth.agent
      .post('/api/tracks/upload')
      .set('x-csrf-token', auth.csrf)
      .attach('file', Buffer.from(body), { filename, contentType });

  it('rejects unauthenticated and CSRF-less uploads', async () => {
    const gpx = Buffer.from(makeGpx());
    const noAuth = await request(app.server)
      .post('/api/tracks/upload')
      .attach('file', gpx, { filename: 'a.gpx', contentType: 'application/gpx+xml' });
    expect(noAuth.status).toBe(401);
    const noCsrf = await auth.agent
      .post('/api/tracks/upload')
      .attach('file', gpx, { filename: 'a.gpx', contentType: 'application/gpx+xml' });
    expect(noCsrf.status).toBe(403);
  });

  it('rejects files that are not .gpx with 415', async () => {
    const res = await upload(makeGpx(), 'lauf.txt', 'text/plain');
    expect(res.status).toBe(415);
    expect(res.body.message).toBe('Nur .gpx-Dateien werden unterstützt');
  });

  it('rejects a GPX without times with a German 400 message', async () => {
    const res = await upload(makeGpx({ withTime: false }));
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('GPX ohne Zeitstempel wird nicht unterstützt');
    expect(storage.puts).toEqual([]);
  });

  it('stores the raw GPX and returns the track DTO', async () => {
    // Browsers often send .gpx as octet-stream; the extension decides.
    const res = await upload(makeGpx({ name: 'Morgenlauf' }), 'Lauf.GPX', 'application/octet-stream');
    expect(res.status).toBe(201);
    const dto = trackDtoSchema.parse(res.body);
    expect(dto).toMatchObject({ originalFilename: 'Lauf.GPX', name: 'Morgenlauf' });
    expect(dto.stats.distance).toBeGreaterThan(600);
    expect(storage.objects.get(`tracks/${dto.id}.gpx`)?.body.toString()).toContain('Morgenlauf');
  });

  it('gets a track by id and 404s an unknown one', async () => {
    const { body } = await upload(makeGpx());
    const got = await auth.agent.get(`/api/tracks/${body.id}`);
    expect(got.status).toBe(200);
    expect(got.body).toEqual(body);
    expect((await auth.agent.get('/api/tracks/nope42')).status).toBe(404);
    expect((await request(app.server).get(`/api/tracks/${body.id}`)).status).toBe(401);
  });

  it('deletes a track and its GPX object', async () => {
    const { body } = await upload(makeGpx());
    const del = await auth.agent.delete(`/api/tracks/${body.id}`).set('x-csrf-token', auth.csrf);
    expect(del.status).toBe(204);
    expect(storage.deletes).toEqual([`tracks/${body.id}.gpx`]);
    expect((await auth.agent.get(`/api/tracks/${body.id}`)).status).toBe(404);
    const again = await auth.agent.delete(`/api/tracks/${body.id}`).set('x-csrf-token', auth.csrf);
    expect(again.status).toBe(404);
  });
});
