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
import { makeJpegWithGps, makeJpegWithDateTaken, makePng } from '../fixtures.js';
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

  /** Upload a specific buffer and drain its SSE channel; returns the image id. */
  async function uploadBuffer(
    buf: Buffer,
    filename: string,
    contentType: string,
  ): Promise<string> {
    const up = await auth.agent
      .post('/api/images/upload')
      .set('x-csrf-token', auth.csrf)
      .attach('file', buf, { filename, contentType });
    expect(up.status).toBe(202);

    const sse = await auth.agent.get(`/api/images/upload/${up.body.uploadId}/progress`);
    const done = parseSse(sse.text).find((e) => e.type === 'done');
    expect(done?.image?.id).toBe(up.body.imageId);
    return up.body.imageId as string;
  }

  /** Upload an image and drain its SSE channel to completion; returns its id. */
  async function uploadImage(filename = 'foto.jpg'): Promise<string> {
    return uploadBuffer(await makeJpegWithGps(), filename, 'image/jpeg');
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

  /** Post that references an image ONLY via its cover, never inside a block. */
  const postWithCover = (coverImageId: string) =>
    auth.agent
      .post('/api/posts')
      .set('x-csrf-token', auth.csrf)
      .send({
        title: 'Mit Titelbild',
        postDate: '2026-05-01T00:00:00.000Z',
        country: 'DE',
        placeName: 'Ort',
        lat: 47,
        lng: 10,
        coverImageId,
        blocks: [{ type: 'paragraph', text: 'kein Bildblock' }],
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

  it('excludePostId frees that post\'s own images as orphans, but not ones used elsewhere', async () => {
    // A is referenced only by post P; B is referenced by both P and Q.
    const a = await uploadImage('a.jpg');
    const b = await uploadImage('b.jpg');
    const p = await auth.agent
      .post('/api/posts')
      .set('x-csrf-token', auth.csrf)
      .send({
        title: 'P',
        postDate: '2026-05-01T00:00:00.000Z',
        country: 'DE',
        placeName: 'Ort',
        lat: 47,
        lng: 10,
        blocks: [
          { type: 'image', imageId: a },
          { type: 'image', imageId: b },
        ],
      });
    await postWithImage(b); // post Q also uses B

    // Without the hint both are in-use → neither is an orphan.
    const plain = await auth.agent.get('/api/images?orphansOnly=true');
    expect(plain.body.images.map((i: { id: string }) => i.id)).toEqual([]);

    // Discounting P's references frees A (only P used it) but NOT B (Q still does).
    const freed = await auth.agent.get(
      `/api/images?orphansOnly=true&excludePostId=${p.body.post.id}`,
    );
    const ids = freed.body.images.map((i: { id: string }) => i.id);
    expect(ids).toContain(a);
    expect(ids).not.toContain(b);
  });

  it('filters images by filename and runs each sort order', async () => {
    const alpha = await uploadImage('alpha.jpg');
    await uploadImage('beta.jpg');

    const byName = await auth.agent.get('/api/images?q=alpha');
    expect(byName.body.images.map((i: { id: string }) => i.id)).toEqual([alpha]);

    expect((await auth.agent.get('/api/images?sort=oldest')).body.total).toBe(2);
    expect((await auth.agent.get('/api/images?sort=filename')).body.images).toHaveLength(2);
  });

  it('sorts by capture date, undated images always behind in both directions', async () => {
    const early = await uploadBuffer(
      await makeJpegWithDateTaken({ dateTaken: '2026:01:01 00:00:00' }),
      'early.jpg',
      'image/jpeg',
    );
    const late = await uploadBuffer(
      await makeJpegWithDateTaken({ dateTaken: '2026:08:01 00:00:00' }),
      'late.jpg',
      'image/jpeg',
    );
    // A PNG with no EXIF → no capture date; must sort behind the dated ones.
    const undated = await uploadBuffer(await makePng(), 'undated.png', 'image/png');

    const newest = await auth.agent.get('/api/images?sort=taken-newest');
    expect(newest.body.images.map((i: { id: string }) => i.id)).toEqual([late, early, undated]);

    const oldest = await auth.agent.get('/api/images?sort=taken-oldest');
    expect(oldest.body.images.map((i: { id: string }) => i.id)).toEqual([early, late, undated]);

    // The dated tile actually carries its capture date in the DTO.
    const lateDto = newest.body.images.find((i: { id: string }) => i.id === late);
    expect(lateDto.takenAt).toBe('2026-08-01T00:00:00.000Z');
    const undatedDto = newest.body.images.find((i: { id: string }) => i.id === undated);
    expect(undatedDto.takenAt).toBeUndefined();
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

  it('treats a cover-only image as in-use: excluded from orphans and undeletable', async () => {
    const cover = await uploadImage('cover.jpg');
    await postWithCover(cover);

    const orphans = await auth.agent.get('/api/images?orphansOnly=true');
    expect(orphans.body.images.map((i: { id: string }) => i.id)).not.toContain(cover);

    const usage = await auth.agent.get(`/api/images/${cover}/usage`);
    expect(usage.body.posts.map((p: { title: string }) => p.title)).toEqual([
      'Mit Titelbild',
    ]);

    const blocked = await auth.agent
      .delete(`/api/images/${cover}`)
      .set('x-csrf-token', auth.csrf);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toBe('image_in_use');
  });

  it('treats an image used only in a pending draft as in-use (protected from cleanup)', async () => {
    const img = await uploadImage('draft-only.jpg');
    // A published post that does NOT reference the image in its live content...
    const post = await auth.agent
      .post('/api/posts')
      .set('x-csrf-token', auth.csrf)
      .send({
        title: 'Live ohne Bild',
        postDate: '2026-05-01T00:00:00.000Z',
        country: 'DE',
        placeName: 'Ort',
        lat: 47,
        lng: 10,
        status: 'published',
        publishedAt: '2020-01-01T00:00:00.000Z',
        blocks: [{ type: 'paragraph', text: 'noch kein Bild' }],
      });
    // ...but whose autosaved draft adds it. The image must not become an orphan.
    await auth.agent
      .put(`/api/posts/${post.body.post.id}/draft`)
      .set('x-csrf-token', auth.csrf)
      .send({
        title: 'Live ohne Bild',
        postDate: '2026-05-01T00:00:00.000Z',
        country: 'DE',
        placeName: 'Ort',
        lat: 47,
        lng: 10,
        blocks: [{ type: 'image', imageId: img }],
      });

    const orphans = await auth.agent.get('/api/images?orphansOnly=true');
    expect(orphans.body.images.map((i: { id: string }) => i.id)).not.toContain(img);

    const usage = await auth.agent.get(`/api/images/${img}/usage`);
    expect(usage.body.posts.map((p: { title: string }) => p.title)).toEqual(['Live ohne Bild']);

    const blocked = await auth.agent.delete(`/api/images/${img}`).set('x-csrf-token', auth.csrf);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toBe('image_in_use');
  });

  it('treats a settings background image as in-use: non-orphan and undeletable', async () => {
    const bg = await uploadImage('bg.jpg');
    // Branding (incl. background images) is admin-only now.
    const admin = await authedAgent(app, { username: 'sbadmin', role: 'admin' });
    const put = await admin.agent
      .put('/api/settings')
      .set('x-csrf-token', admin.csrf)
      .send({ siteTitle: 'Reise', accentColor: '#2b6cb0', backgroundImageIds: [bg] });
    expect(put.status).toBe(200);

    const orphans = await auth.agent.get('/api/images?orphansOnly=true');
    expect(orphans.body.images.map((i: { id: string }) => i.id)).not.toContain(bg);

    const blocked = await auth.agent
      .delete(`/api/images/${bg}`)
      .set('x-csrf-token', auth.csrf);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toBe('image_in_use');
  });

  it('counts unused images (excluding referenced, cover and background)', async () => {
    const used = await uploadImage('used.jpg');
    await uploadImage('orphan1.jpg');
    await uploadImage('orphan2.jpg');
    await postWithImage(used);

    const res = await auth.agent.get('/api/images/unused/count');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
  });

  it('bulk-deletes only the unused images and recomputes freshly', async () => {
    const used = await uploadImage('used.jpg');
    const orphan1 = await uploadImage('orphan1.jpg');
    const orphan2 = await uploadImage('orphan2.jpg');
    await postWithImage(used);

    const del = await auth.agent
      .post('/api/images/unused/delete')
      .set('x-csrf-token', auth.csrf);
    expect(del.status).toBe(200);
    expect(del.body.deleted).toBe(2);

    // Both orphans' objects removed, the referenced one untouched.
    expect(storage.deletes).toContain(`posts/${orphan1}-display.webp`);
    expect(storage.deletes).toContain(`posts/${orphan2}-thumb.webp`);
    expect(storage.deletes).not.toContain(`posts/${used}-display.webp`);

    const remaining = await auth.agent.get('/api/images');
    expect(remaining.body.images.map((i: { id: string }) => i.id)).toEqual([used]);
  });

  it('requires CSRF to bulk-delete unused images', async () => {
    await uploadImage('orphan.jpg');
    const noCsrf = await auth.agent.post('/api/images/unused/delete');
    expect(noCsrf.status).toBe(403);
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
