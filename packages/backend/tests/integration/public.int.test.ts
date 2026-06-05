import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';
import { useTestDatabase } from '../db.js';
import { buildTestApp, authedAgent, type AuthedAgent } from '../helpers.js';
import { Post } from '../../src/db/models/Post.js';
import { Image } from '../../src/db/models/Image.js';

describe('public reader API integration', () => {
  useTestDatabase();

  let app: FastifyInstance;
  let redis: Redis;
  let auth: AuthedAgent;

  beforeAll(async () => {
    ({ app, redis } = await buildTestApp());
    // Build the german $text index before any search query runs.
    await Post.init();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await redis.flushall();
    auth = await authedAgent(app);
  });

  const payload = (over: Record<string, unknown> = {}) => ({
    title: 'Berge',
    postDate: '2026-05-01T00:00:00.000Z',
    country: 'DE',
    placeName: 'Zugspitze',
    lat: 47.42,
    lng: 10.98,
    blocks: [{ type: 'paragraph', text: 'Aufstieg zur Hütte' }],
    ...over,
  });

  async function createPublished(over: Record<string, unknown> = {}): Promise<string> {
    const created = await auth.agent
      .post('/api/posts')
      .set('x-csrf-token', auth.csrf)
      .send(payload(over));
    const id = created.body.post.id;
    await auth.agent
      .patch(`/api/posts/${id}`)
      .set('x-csrf-token', auth.csrf)
      .send({ status: 'published' });
    return id;
  }

  async function createDraft(over: Record<string, unknown> = {}): Promise<string> {
    const created = await auth.agent
      .post('/api/posts')
      .set('x-csrf-token', auth.csrf)
      .send(payload(over));
    return created.body.post.id;
  }

  it('lists only published posts and hides drafts', async () => {
    const published = await createPublished();
    await createDraft({ title: 'Entwurf' });

    const list = await request(app.server).get('/api/public/posts');
    expect(list.status).toBe(200);
    expect(list.body.total).toBe(1);
    expect(list.body.posts[0].id).toBe(published);
  });

  it('serves post heads (published only, newest first, without blocks)', async () => {
    const older = await createPublished({ postDate: '2026-01-01T00:00:00.000Z' });
    const newer = await createPublished({
      title: 'Neuer',
      postDate: '2026-06-01T00:00:00.000Z',
    });
    await createDraft({ title: 'Entwurf' });

    const res = await request(app.server).get('/api/public/posts/heads');
    expect(res.status).toBe(200);
    expect(res.body.posts.map((p: { id: string }) => p.id)).toEqual([newer, older]);
    // The head projection never ships article bodies.
    for (const head of res.body.posts) {
      expect(head.blocks).toBeUndefined();
    }
  });

  it('caps post heads with the optional limit', async () => {
    await createPublished({ postDate: '2026-01-01T00:00:00.000Z' });
    const newer = await createPublished({
      title: 'Neuer',
      postDate: '2026-06-01T00:00:00.000Z',
    });

    const res = await request(app.server).get('/api/public/posts/heads?limit=1');
    expect(res.body.posts).toHaveLength(1);
    expect(res.body.posts[0].id).toBe(newer);
  });

  it('serves a single published post but 404s a draft', async () => {
    const published = await createPublished();
    const draft = await createDraft({ title: 'Entwurf' });

    expect((await request(app.server).get(`/api/public/posts/${published}`)).status).toBe(
      200,
    );
    expect((await request(app.server).get(`/api/public/posts/${draft}`)).status).toBe(404);
  });

  it('attaches the image-dimension sidecar to the single post only', async () => {
    // Seed two images the post references (one in an image block, one in a
    // gallery), plus an unreferenced image that must not leak into the map.
    await Image.create([
      {
        shortId: 'imgone',
        originalFilename: 'a.jpg',
        mime: 'image/jpeg',
        displayKey: 'd/a',
        thumbKey: 't/a',
        width: 800,
        height: 1200,
        uploaderId: auth.userId,
      },
      {
        shortId: 'imgtwo',
        originalFilename: 'b.jpg',
        mime: 'image/jpeg',
        displayKey: 'd/b',
        thumbKey: 't/b',
        width: 1600,
        height: 900,
        uploaderId: auth.userId,
      },
      {
        shortId: 'imgunref',
        originalFilename: 'c.jpg',
        mime: 'image/jpeg',
        displayKey: 'd/c',
        thumbKey: 't/c',
        width: 100,
        height: 100,
        uploaderId: auth.userId,
      },
    ]);
    const id = await createPublished({
      blocks: [
        { type: 'paragraph', text: 'Aufstieg' },
        { type: 'image', imageId: 'imgone' },
        { type: 'gallery', imageIds: ['imgtwo'] },
      ],
    });

    const single = await request(app.server).get(`/api/public/posts/${id}`);
    expect(single.status).toBe(200);
    expect(single.body.post.images).toEqual({
      imgone: { width: 800, height: 1200 },
      imgtwo: { width: 1600, height: 900 },
    });
    // The unreferenced image is not in the sidecar.
    expect(single.body.post.images.imgunref).toBeUndefined();

    // List and search responses never carry the sidecar.
    const list = await request(app.server).get('/api/public/posts');
    expect(list.body.posts[0].images).toBeUndefined();
    const search = await request(app.server).get('/api/public/search?q=aufstieg');
    expect(search.body.posts[0].images).toBeUndefined();
  });

  it('includes the trip shortId on public posts (list + single)', async () => {
    const trip = await auth.agent
      .post('/api/trips')
      .set('x-csrf-token', auth.csrf)
      .send({ name: 'Alpen' });
    const tripId = trip.body.trip.id;
    const id = await createPublished({ tripId });

    const list = await request(app.server).get('/api/public/posts');
    expect(list.body.posts[0].tripId).toBe(tripId);

    const single = await request(app.server).get(`/api/public/posts/${id}`);
    expect(single.body.post.tripId).toBe(tripId);
  });

  it('runs a combined text + country + trip + date search over published posts', async () => {
    const trip = await auth.agent
      .post('/api/trips')
      .set('x-csrf-token', auth.csrf)
      .send({ name: 'Alpen' });
    const tripId = trip.body.trip.id;

    const bergeDe = await createPublished({ tripId });
    await createPublished({ title: 'Strand', country: 'IT', placeName: 'Rom' });
    await createDraft({ title: 'Berge geheim' }); // draft must not match

    // free text
    const byText = await request(app.server).get('/api/public/search?q=berge');
    expect(byText.body.posts.map((p: { id: string }) => p.id)).toEqual([bergeDe]);

    // text + country narrows nothing extra here but proves the AND
    const byCountry = await request(app.server).get(
      '/api/public/search?q=berge&country=DE',
    );
    expect(byCountry.body.total).toBe(1);

    // trip filter
    const byTrip = await request(app.server).get(`/api/public/search?tripId=${tripId}`);
    expect(byTrip.body.posts.map((p: { id: string }) => p.id)).toEqual([bergeDe]);

    // date range excludes everything before 2027
    const byDate = await request(app.server).get(
      '/api/public/search?from=2027-01-01T00:00:00.000Z',
    );
    expect(byDate.body.total).toBe(0);
  });

  it('matches a partial word as the reader types (substring, not whole-word)', async () => {
    const id = await createPublished({ title: 'Zugspitze', placeName: 'Garmisch' });
    await createPublished({ title: 'Strand', placeName: 'Rom', country: 'IT' });

    // "zug" is only a fragment of "Zugspitze" — the old $text index matched
    // nothing here, which is the "Suche tut nichts" bug.
    const res = await request(app.server).get('/api/public/search?q=zug');
    expect(res.body.posts.map((p: { id: string }) => p.id)).toEqual([id]);
  });

  it('is case- and accent-insensitive via the folded field', async () => {
    const id = await createPublished({ title: 'Über die Alpen', placeName: 'München' });

    for (const q of ['MÜNCHEN', 'münch', 'muenchen']) {
      const res = await request(app.server).get(`/api/public/search?q=${encodeURIComponent(q)}`);
      expect(res.body.posts.map((p: { id: string }) => p.id)).toEqual([id]);
    }
  });

  it('treats regex metacharacters in the query as literal text (no injection)', async () => {
    await createPublished({ title: 'Zugspitze', placeName: 'Garmisch' });

    // A wildcard-looking query must NOT match everything — it is a literal that
    // appears in no post, so it returns nothing rather than the whole corpus.
    const res = await request(app.server).get('/api/public/search?q=.%2B');
    expect(res.body.total).toBe(0);
  });

  it('returns empty results for an unknown trip filter', async () => {
    const res = await request(app.server).get('/api/public/search?tripId=nope12');
    expect(res.body).toEqual({ posts: [], total: 0 });
  });

  it('exposes published post coordinates for the map', async () => {
    const id = await createPublished();
    const map = await request(app.server).get('/api/public/map');
    expect(map.body.points).toEqual([
      { id, title: 'Berge', lat: 47.42, lng: 10.98, country: 'DE', placeName: 'Zugspitze' },
    ]);
    expect(map.body.unlocatedCount).toBe(0);
  });

  it('tags map points with their trip shortId so the Karte can filter by Reise', async () => {
    const trip = await auth.agent
      .post('/api/trips')
      .set('x-csrf-token', auth.csrf)
      .send({ name: 'Alpen' });
    const tripId = trip.body.trip.id;
    const withTrip = await createPublished({ tripId });
    const withoutTrip = await createPublished({ title: 'Solo', lat: 48, lng: 9 });

    const map = await request(app.server).get('/api/public/map');
    const byId = new Map<string, { tripId?: string }>(
      map.body.points.map((p: { id: string }) => [p.id, p]),
    );
    expect(byId.get(withTrip)?.tripId).toBe(tripId);
    // Trip-less posts carry no tripId at all (not null/empty string).
    expect(byId.get(withoutTrip)).not.toHaveProperty('tripId');
  });

  it('omits placeholder-coordinate posts from the map and counts them apart', async () => {
    // The WP import stamps geo-less posts with country 'XX' / placeName 'Unbekannt'
    // at 0,0. Those must not pile up at Null Island nor stretch fitBounds — they
    // are surfaced only as a separate "ohne Ort" count.
    const located = await createPublished();
    await createPublished({
      title: 'Ohne Ort',
      country: 'XX',
      placeName: 'Unbekannt',
      lat: 0,
      lng: 0,
    });

    const map = await request(app.server).get('/api/public/map');
    expect(map.body.points).toEqual([
      {
        id: located,
        title: 'Berge',
        lat: 47.42,
        lng: 10.98,
        country: 'DE',
        placeName: 'Zugspitze',
      },
    ]);
    expect(map.body.unlocatedCount).toBe(1);
  });

  it('lists only trips that have published posts', async () => {
    const trip = await auth.agent
      .post('/api/trips')
      .set('x-csrf-token', auth.csrf)
      .send({ name: 'Alpen' });
    const tripId = trip.body.trip.id;
    await auth.agent
      .post('/api/trips')
      .set('x-csrf-token', auth.csrf)
      .send({ name: 'Leer' });
    await createPublished({ tripId });

    const res = await request(app.server).get('/api/public/trips');
    expect(res.body.trips).toEqual([{ id: tripId, name: 'Alpen', postCount: 1 }]);
  });

  it('exposes search facets (countries and months) over published posts only', async () => {
    // The Suche page seeds its Land/Monat dropdowns from these facets. Computing
    // them server-side (instead of paging through every post) avoids the old
    // 100-post cap that silently dropped countries/months past the first page.
    await createPublished({ country: 'DE', postDate: '2026-05-01T00:00:00.000Z' });
    await createPublished({ country: 'IT', postDate: '2026-03-15T00:00:00.000Z' });
    await createPublished({ country: 'DE', postDate: '2026-05-20T00:00:00.000Z' }); // dup
    await createDraft({ country: 'FR', postDate: '2026-01-01T00:00:00.000Z' }); // excluded

    const res = await request(app.server).get('/api/public/facets');
    expect(res.status).toBe(200);
    expect(res.body.countries).toEqual(['DE', 'IT']);
    expect(res.body.months).toEqual([202603, 202605]);
  });

  it('returns default branding when no settings exist', async () => {
    const res = await request(app.server).get('/api/public/settings');
    expect(res.body.settings.siteTitle).toBeTruthy();
    expect(res.body.settings.accentColor).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
