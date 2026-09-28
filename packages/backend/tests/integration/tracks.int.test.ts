import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';
import mongoose from 'mongoose';
import {
  publicTrackDataSchema,
  trackDtoSchema,
  trackPreviewResponseSchema,
  type PostTrackRef,
} from '@stb/shared';
import { useTestDatabase } from '../db.js';
import { buildTestApp, authedAgent, type AuthedAgent, type MemoryStorage } from '../helpers.js';
import { makeGpx } from '../gpx.js';
import { Image } from '../../src/db/models/Image.js';
import { Track } from '../../src/db/models/Track.js';

// makeGpx: 60 points every 5 s from 08:00Z on 12 Sept 2026 at 69.8° N, 20.7° E.
const T0 = Date.UTC(2026, 8, 12, 8, 0);

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

  // --- posts, placement and the public route (stage 4) ---

  const uploadId = async (name = 'Lauf'): Promise<string> =>
    (await upload(makeGpx({ name }))).body.id as string;

  /** An image row with a naive-local capture time stored as UTC (like readTakenAt). */
  const seedImage = (shortId: string, file: string, takenAt?: string) =>
    Image.create({
      shortId,
      originalFilename: file,
      mime: 'image/jpeg',
      displayKey: `posts/${shortId}-display.webp`,
      thumbKey: `posts/${shortId}-thumb.webp`,
      width: 10,
      height: 10,
      ...(takenAt ? { takenAt: new Date(`${takenAt}Z`) } : {}),
      uploaderId: new mongoose.Types.ObjectId(),
    });

  const postBody = (extra: Record<string, unknown> = {}) => ({
    title: 'Lauf',
    postDate: '2026-09-12T00:00:00.000Z',
    country: 'NO',
    placeName: 'Skjervøy',
    lat: 70,
    lng: 20.9,
    blocks: [],
    ...extra,
  });
  const createPost = (extra: Record<string, unknown> = {}) =>
    auth.agent.post('/api/posts').set('x-csrf-token', auth.csrf).send(postBody(extra));
  const publish = (id: string) =>
    auth.agent.post(`/api/posts/${id}/publish`).set('x-csrf-token', auth.csrf);
  const autosave = (id: string, extra: Record<string, unknown>) =>
    auth.agent.put(`/api/posts/${id}/draft`).set('x-csrf-token', auth.csrf).send(postBody(extra));

  describe('posts with tracks', () => {
    it('creates, patches and clears tracks and the offset', async () => {
      const t1 = await uploadId();
      const tracks: PostTrackRef[] = [{ trackId: t1, label: 'Anna', prefix: 'IMG_' }];
      const created = await createPost({ tracks, utcOffsetMinutes: 120 });
      expect(created.status).toBe(201);
      expect(created.body.post).toMatchObject({ tracks, utcOffsetMinutes: 120 });

      const id = created.body.post.id as string;
      const patched = await auth.agent
        .patch(`/api/posts/${id}`)
        .set('x-csrf-token', auth.csrf)
        .send({ tracks: [], utcOffsetMinutes: 60 });
      expect(patched.body.post.tracks).toBeUndefined();
      expect(patched.body.post.utcOffsetMinutes).toBe(60);
    });

    it('rejects an unknown trackId', async () => {
      const res = await createPost({ tracks: [{ trackId: 'nope42', label: 'X' }] });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('unknown trackId');
    });

    it('autosaves tracks straight onto an unpublished post', async () => {
      const t1 = await uploadId();
      const { body } = await createPost();
      await autosave(body.post.id, { tracks: [{ trackId: t1, label: 'Anna' }], utcOffsetMinutes: 0 });
      const got = await auth.agent.get(`/api/posts/${body.post.id}`);
      expect(got.body.post).toMatchObject({
        tracks: [{ trackId: t1, label: 'Anna' }],
        utcOffsetMinutes: 0,
      });
    });

    it('keeps draft tracks in the draft until publish copies them', async () => {
      const t1 = await uploadId();
      const { body } = await createPost();
      await publish(body.post.id);
      await autosave(body.post.id, {
        tracks: [{ trackId: t1, label: 'Anna' }],
        utcOffsetMinutes: 120,
      });

      const pending = (await auth.agent.get(`/api/posts/${body.post.id}`)).body.post;
      expect(pending.tracks).toBeUndefined();
      expect(pending.draft).toMatchObject({
        tracks: [{ trackId: t1, label: 'Anna' }],
        utcOffsetMinutes: 120,
      });

      const published = (await publish(body.post.id)).body.post;
      expect(published).toMatchObject({
        tracks: [{ trackId: t1, label: 'Anna' }],
        utcOffsetMinutes: 120,
      });
      expect(published.draft).toBeUndefined();
    });

    it('refuses to delete a track used by a post or a pending draft', async () => {
      const t1 = await uploadId();
      const t2 = await uploadId();
      const live = await createPost({ title: 'Live', tracks: [{ trackId: t1, label: 'A' }] });
      const other = await createPost({ title: 'Entwurf' });
      await publish(other.body.post.id);
      await autosave(other.body.post.id, {
        title: 'Entwurf',
        tracks: [{ trackId: t2, label: 'B' }],
      });

      const del1 = await auth.agent.delete(`/api/tracks/${t1}`).set('x-csrf-token', auth.csrf);
      expect(del1.status).toBe(409);
      expect(del1.body).toEqual({
        error: 'track_in_use',
        posts: [{ id: live.body.post.id, title: 'Live' }],
      });
      const del2 = await auth.agent.delete(`/api/tracks/${t2}`).set('x-csrf-token', auth.csrf);
      expect(del2.status).toBe(409);
    });
  });

  describe('POST /api/tracks/preview', () => {
    const preview = (body: object) =>
      auth.agent.post('/api/tracks/preview').set('x-csrf-token', auth.csrf).send(body);

    it('places the given photos and suggests an offset', async () => {
      const t1 = await uploadId();
      await seedImage('img001', 'IMG_1.jpg', '2026-09-12T10:02:00');
      await seedImage('img002', 'IMG_2.jpg');
      const res = await preview({
        tracks: [{ trackId: t1, label: 'Anna' }],
        imageIds: ['img001', 'img002'],
      });
      expect(res.status).toBe(200);
      expect(trackPreviewResponseSchema.parse(res.body)).toEqual({
        suggestion: { offset: 120, reason: '1/1 Fotos im Track' },
        utcOffsetMinutes: 120,
        photos: [
          { imageId: 'img001', track: 0, t: T0 + 120_000, where: 'on' },
          { imageId: 'img002', track: 0, t: T0 + 59 * 5000, where: 'notime' },
        ],
      });
    });

    it('uses a given offset', async () => {
      const t1 = await uploadId();
      await seedImage('img001', 'IMG_1.jpg', '2026-09-12T10:02:00');
      const res = await preview({
        tracks: [{ trackId: t1, label: 'Anna' }],
        utcOffsetMinutes: 60,
        imageIds: ['img001'],
      });
      expect(res.body.utcOffsetMinutes).toBe(60);
      expect(res.body.photos[0].where).toBe('after');
    });

    it('400s an invalid body or unknown tracks, and needs auth + CSRF', async () => {
      expect((await preview({ tracks: [], imageIds: [] })).status).toBe(400);
      const unknown = await preview({ tracks: [{ trackId: 'nope42', label: 'A' }], imageIds: [] });
      expect(unknown.status).toBe(400);
      const body = { tracks: [{ trackId: 'x', label: 'A' }], imageIds: [] };
      expect((await request(app.server).post('/api/tracks/preview').send(body)).status).toBe(401);
      expect((await auth.agent.post('/api/tracks/preview').send(body)).status).toBe(403);
    });
  });

  describe('GET /api/public/posts/:id/tracks', () => {
    it('serves tracks, stats, rows and photo placement of a published post', async () => {
      const t1 = await uploadId('Morgenlauf');
      await seedImage('img001', 'IMG_1.jpg', '2026-09-12T10:02:00');
      await seedImage('cov001', 'IMG_0.jpg');
      const { body } = await createPost({
        tracks: [{ trackId: t1, label: 'Anna' }],
        utcOffsetMinutes: 120,
        coverImageId: 'cov001',
        blocks: [{ type: 'image', imageId: 'img001' }],
      });
      await publish(body.post.id);

      const res = await request(app.server).get(`/api/public/posts/${body.post.id}/tracks`);
      expect(res.status).toBe(200);
      const data = publicTrackDataSchema.parse(res.body);
      expect(data.utcOffsetMinutes).toBe(120);
      expect(data.tracks).toHaveLength(1);
      expect(data.tracks[0]).toMatchObject({ label: 'Anna', moving: [[T0, T0 + 59 * 5000]] });
      expect(data.tracks[0]!.points[0]).toEqual([69.8, 20.7, expect.any(Number), 0, 0]);
      expect(data.photos).toEqual([
        { imageId: 'img001', track: 0, t: T0 + 120_000, where: 'on' },
        { imageId: 'cov001', track: 0, t: T0 + 59 * 5000, where: 'notime' },
      ]);
      // Filenames and capture times stay private.
      expect(JSON.stringify(res.body)).not.toContain('IMG_');
      expect(JSON.stringify(res.body)).not.toContain('2026-09-12T10:02');
    });

    it('falls back to the suggested offset when the post has none', async () => {
      const t1 = await uploadId();
      const { body } = await createPost({ tracks: [{ trackId: t1, label: 'Anna' }] });
      await publish(body.post.id);
      const res = await request(app.server).get(`/api/public/posts/${body.post.id}/tracks`);
      // 20.7° E in September → UTC+1 plus summer time.
      expect(res.body.utcOffsetMinutes).toBe(120);
    });

    it('404s unpublished posts, posts without tracks and unknown posts', async () => {
      const t1 = await uploadId();
      const draft = await createPost({ tracks: [{ trackId: t1, label: 'Anna' }] });
      const plain = await createPost();
      await publish(plain.body.post.id);
      for (const id of [draft.body.post.id, plain.body.post.id, 'nope42']) {
        expect((await request(app.server).get(`/api/public/posts/${id}/tracks`)).status).toBe(404);
      }
    });
  });

  describe('unused cleanup', () => {
    it('counts and deletes unused tracks together with unused images', async () => {
      const used = await uploadId();
      const orphan = await uploadId();
      await createPost({ tracks: [{ trackId: used, label: 'A' }] });

      const count = await auth.agent.get('/api/images/unused/count');
      expect(count.body).toMatchObject({ count: 0, trackCount: 1 });

      const del = await auth.agent
        .post('/api/images/unused/delete')
        .set('x-csrf-token', auth.csrf);
      expect(del.body).toEqual({ deleted: 0, deletedTracks: 1 });
      expect(storage.deletes).toEqual([`tracks/${orphan}.gpx`]);
      expect(await Track.exists({ shortId: used })).not.toBeNull();
      expect(await Track.exists({ shortId: orphan })).toBeNull();
    });
  });
});
