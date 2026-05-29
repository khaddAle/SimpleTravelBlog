import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';
import { useTestDatabase } from '../db.js';
import { buildTestApp, authedAgent, type AuthedAgent } from '../helpers.js';
import { Post } from '../../src/db/models/Post.js';

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

  it('serves a single published post but 404s a draft', async () => {
    const published = await createPublished();
    const draft = await createDraft({ title: 'Entwurf' });

    expect((await request(app.server).get(`/api/public/posts/${published}`)).status).toBe(
      200,
    );
    expect((await request(app.server).get(`/api/public/posts/${draft}`)).status).toBe(404);
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

  it('runs a combined $text + country + trip + date search over published posts', async () => {
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

  it('returns default branding when no settings exist', async () => {
    const res = await request(app.server).get('/api/public/settings');
    expect(res.body.settings.siteTitle).toBeTruthy();
    expect(res.body.settings.accentColor).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
