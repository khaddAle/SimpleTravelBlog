import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import sharp from 'sharp';
import type { FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';
import { useTestDatabase } from '../db.js';
import {
  buildTestApp,
  authedAgent,
  type AuthedAgent,
  type MemoryStorage,
} from '../helpers.js';
import { makeJpegWithGps } from '../fixtures.js';
import { hasExif } from '../../src/images/exif.js';

interface SseEvent {
  type: 'progress' | 'done' | 'error';
  pct?: number;
  image?: { id: string };
}

function parseSse(text: string): SseEvent[] {
  return text
    .split('\n')
    .filter((l) => l.startsWith('data: '))
    .map((l) => JSON.parse(l.slice(6)) as SseEvent);
}

describe('images integration', () => {
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
    storage.puts.length = 0;
    storage.deletes.length = 0;
    storage.objects.clear();
    auth = await authedAgent(app);
  });

  /** Upload an image and drain its SSE channel to completion; returns its id. */
  async function uploadImage(filename = 'foto.jpg'): Promise<string> {
    const buf = await makeJpegWithGps();
    const up = await auth.agent
      .post('/api/images/upload')
      .set('x-csrf-token', auth.csrf)
      .attach('file', buf, { filename, contentType: 'image/jpeg' });
    expect(up.status).toBe(202);

    const sse = await auth.agent.get(`/api/images/upload/${up.body.uploadId}/progress`);
    const done = parseSse(sse.text).find((e) => e.type === 'done');
    expect(done?.image?.id).toBe(up.body.imageId);
    return up.body.imageId as string;
  }

  const postWithImage = (imageId: string) =>
    auth.agent
      .post('/api/posts')
      .set('x-csrf-token', auth.csrf)
      .send({
        title: 'Mit Bild',
        postDate: '2026-05-01T00:00:00.000Z',
        country: 'DE',
        placeName: 'Ort',
        lat: 47,
        lng: 10,
        blocks: [{ type: 'image', imageId }],
      });

  it('rejects unauthenticated and CSRF-less uploads', async () => {
    const buf = await makeJpegWithGps();
    const noAuth = await request(app.server)
      .post('/api/images/upload')
      .attach('file', buf, { filename: 'x.jpg', contentType: 'image/jpeg' });
    expect(noAuth.status).toBe(401);

    const noCsrf = await auth.agent
      .post('/api/images/upload')
      .attach('file', buf, { filename: 'x.jpg', contentType: 'image/jpeg' });
    expect(noCsrf.status).toBe(403);
  });

  it('rejects an unsupported mime type with 415', async () => {
    const res = await auth.agent
      .post('/api/images/upload')
      .set('x-csrf-token', auth.csrf)
      .attach('file', Buffer.from('hello'), {
        filename: 'note.txt',
        contentType: 'text/plain',
      });
    expect(res.status).toBe(415);
  });

  it('processes an upload into two WebP objects with EXIF stripped', async () => {
    const imageId = await uploadImage();

    const displayKey = `posts/${imageId}-display.webp`;
    const thumbKey = `posts/${imageId}-thumb.webp`;
    expect(storage.puts).toContain(displayKey);
    expect(storage.puts).toContain(thumbKey);

    const display = storage.objects.get(displayKey)!.body;
    expect((await sharp(display).metadata()).format).toBe('webp');
    expect(await hasExif(display)).toBe(false);
  });

  it('404s the SSE channel for an unknown upload', async () => {
    const res = await auth.agent.get('/api/images/upload/does-not-exist/progress');
    expect(res.status).toBe(404);
  });

  it('lists images and filters to orphans only', async () => {
    const used = await uploadImage('used.jpg');
    const orphan = await uploadImage('orphan.jpg');
    await postWithImage(used);

    const all = await auth.agent.get('/api/images');
    expect(all.body.total).toBe(2);

    const orphans = await auth.agent.get('/api/images?orphansOnly=true');
    expect(orphans.body.images.map((i: { id: string }) => i.id)).toEqual([orphan]);
  });

  it('filters images by filename and runs each sort order', async () => {
    const alpha = await uploadImage('alpha.jpg');
    await uploadImage('beta.jpg');

    const byName = await auth.agent.get('/api/images?q=alpha');
    expect(byName.body.images.map((i: { id: string }) => i.id)).toEqual([alpha]);

    expect((await auth.agent.get('/api/images?sort=oldest')).body.total).toBe(2);
    expect((await auth.agent.get('/api/images?sort=filename')).body.images).toHaveLength(2);
  });

  it('reports where an image is used', async () => {
    const imageId = await uploadImage();
    const post = await postWithImage(imageId);

    const usage = await auth.agent.get(`/api/images/${imageId}/usage`);
    expect(usage.status).toBe(200);
    expect(usage.body.posts).toEqual([{ id: post.body.post.id, title: 'Mit Bild' }]);
  });

  it('refuses to delete a referenced image (409) but deletes an orphan (204)', async () => {
    const imageId = await uploadImage();
    await postWithImage(imageId);

    const blocked = await auth.agent
      .delete(`/api/images/${imageId}`)
      .set('x-csrf-token', auth.csrf);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toBe('image_in_use');

    const orphan = await uploadImage('orphan.jpg');
    const del = await auth.agent
      .delete(`/api/images/${orphan}`)
      .set('x-csrf-token', auth.csrf);
    expect(del.status).toBe(204);
    expect(storage.deletes).toContain(`posts/${orphan}-display.webp`);
    expect(storage.deletes).toContain(`posts/${orphan}-thumb.webp`);
  });

  it('serves both public image variants and 404s unknown ones', async () => {
    const imageId = await uploadImage();

    const display = await request(app.server).get(
      `/api/public/images/${imageId}/display`,
    );
    expect(display.status).toBe(200);
    expect(display.headers['content-type']).toBe('image/webp');

    const thumb = await request(app.server).get(`/api/public/images/${imageId}/thumb`);
    expect(thumb.status).toBe(200);

    const badVariant = await request(app.server).get(
      `/api/public/images/${imageId}/original`,
    );
    expect(badVariant.status).toBe(404);

    const badImage = await request(app.server).get(
      '/api/public/images/zzzzzz/display',
    );
    expect(badImage.status).toBe(404);
  });
});
