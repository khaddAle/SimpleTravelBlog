import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';
import { useTestDatabase } from '../db.js';
import { buildTestApp, authedAgent, type AuthedAgent } from '../helpers.js';

describe('posts + trips integration', () => {
  useTestDatabase();

  let app: FastifyInstance;
  let redis: Redis;
  let auth: AuthedAgent;

  beforeAll(async () => {
    ({ app, redis } = await buildTestApp());
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await redis.flushall();
    auth = await authedAgent(app);
  });

  const postPayload = (over: Record<string, unknown> = {}) => ({
    title: 'Berge',
    postDate: '2026-05-01T00:00:00.000Z',
    country: 'DE',
    placeName: 'Zugspitze',
    lat: 47.42,
    lng: 10.98,
    blocks: [{ type: 'paragraph', text: 'Aufstieg zur Hütte' }],
    ...over,
  });

  const createTrip = (name: string) =>
    auth.agent.post('/api/trips').set('x-csrf-token', auth.csrf).send({ name });

  const createPost = (body: Record<string, unknown>) =>
    auth.agent.post('/api/posts').set('x-csrf-token', auth.csrf).send(body);

  it('rejects an unauthenticated create with 401', async () => {
    const res = await request(app.server).post('/api/posts').send(postPayload());
    expect(res.status).toBe(401);
  });

  it('rejects a create without the CSRF header with 403', async () => {
    const res = await auth.agent.post('/api/posts').send(postPayload());
    expect(res.status).toBe(403);
  });

  it('creates a draft post and lists/fetches it', async () => {
    const created = await createPost(postPayload());
    expect(created.status).toBe(201);
    expect(created.body.post).toMatchObject({
      title: 'Berge',
      status: 'draft',
      country: 'DE',
    });
    const id = created.body.post.id;
    expect(id).toHaveLength(6);

    const list = await auth.agent.get('/api/posts');
    expect(list.status).toBe(200);
    expect(list.body.posts).toHaveLength(1);

    const one = await auth.agent.get(`/api/posts/${id}`);
    expect(one.status).toBe(200);
    expect(one.body.post.id).toBe(id);
  });

  it('404s an unknown post', async () => {
    const res = await auth.agent.get('/api/posts/zzzzzz');
    expect(res.status).toBe(404);
  });

  it('associates a trip by shortId and exposes it on the DTO', async () => {
    const trip = await createTrip('Alpen 2026');
    expect(trip.status).toBe(201);
    const tripId = trip.body.trip.id;

    const created = await createPost(postPayload({ tripId }));
    expect(created.status).toBe(201);
    expect(created.body.post.tripId).toBe(tripId);
  });

  it('rejects a post referencing an unknown trip with 400', async () => {
    const res = await createPost(postPayload({ tripId: 'nope12' }));
    expect(res.status).toBe(400);
  });

  it('names the offending fields when a create payload is invalid', async () => {
    const res = await createPost(postPayload({ country: '', placeName: '' }));
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('country');
    expect(res.body.message).toContain('placeName');
  });

  it('publishes via PATCH and stamps publishedAt once', async () => {
    const created = await createPost(postPayload());
    const id = created.body.post.id;

    const published = await auth.agent
      .patch(`/api/posts/${id}`)
      .set('x-csrf-token', auth.csrf)
      .send({ status: 'published' });
    expect(published.status).toBe(200);
    expect(published.body.post.status).toBe('published');
    expect(published.body.post.publishedAt).toBeTruthy();
    const firstPublishedAt = published.body.post.publishedAt;

    const edited = await auth.agent
      .patch(`/api/posts/${id}`)
      .set('x-csrf-token', auth.csrf)
      .send({ title: 'Neuer Titel' });
    expect(edited.body.post.title).toBe('Neuer Titel');
    expect(edited.body.post.publishedAt).toBe(firstPublishedAt);
  });

  it('creates a post published-on-import, preserving the original publishedAt', async () => {
    const original = '2019-07-14T07:30:00.000Z';
    const created = await createPost(
      postPayload({ status: 'published', publishedAt: original }),
    );
    expect(created.status).toBe(201);
    expect(created.body.post.status).toBe('published');
    // The pre-set original date is preserved (not re-stamped to "now").
    expect(created.body.post.publishedAt).toBe(original);
  });

  it('round-trips a coverImageId on create and PATCH (set then clear)', async () => {
    const created = await createPost(postPayload({ coverImageId: 'cov123' }));
    expect(created.status).toBe(201);
    expect(created.body.post.coverImageId).toBe('cov123');
    const id = created.body.post.id;

    const fetched = await auth.agent.get(`/api/posts/${id}`);
    expect(fetched.body.post.coverImageId).toBe('cov123');

    const changed = await auth.agent
      .patch(`/api/posts/${id}`)
      .set('x-csrf-token', auth.csrf)
      .send({ coverImageId: 'cov456' });
    expect(changed.body.post.coverImageId).toBe('cov456');

    const cleared = await auth.agent
      .patch(`/api/posts/${id}`)
      .set('x-csrf-token', auth.csrf)
      .send({ coverImageId: '' });
    expect(cleared.body.post.coverImageId).toBeUndefined();
  });

  it('keeps the trip association when patching other fields', async () => {
    const trip = await createTrip('Alpen');
    const created = await createPost(postPayload({ tripId: trip.body.trip.id }));

    const patched = await auth.agent
      .patch(`/api/posts/${created.body.post.id}`)
      .set('x-csrf-token', auth.csrf)
      .send({ title: 'Neu' });
    expect(patched.body.post.title).toBe('Neu');
    expect(patched.body.post.tripId).toBe(trip.body.trip.id);
  });

  it('deletes a post', async () => {
    const created = await createPost(postPayload());
    const id = created.body.post.id;

    const del = await auth.agent
      .delete(`/api/posts/${id}`)
      .set('x-csrf-token', auth.csrf);
    expect(del.status).toBe(204);

    const gone = await auth.agent.get(`/api/posts/${id}`);
    expect(gone.status).toBe(404);
  });

  it('lists trips with a published/draft post count', async () => {
    const trip = await createTrip('Alpen');
    await createPost(postPayload({ tripId: trip.body.trip.id }));

    const list = await auth.agent.get('/api/trips');
    expect(list.status).toBe(200);
    expect(list.body.trips[0]).toMatchObject({ name: 'Alpen', postCount: 1 });
  });

  it('rejects a duplicate trip name with 409', async () => {
    await createTrip('Alpen');
    const dup = await createTrip('Alpen');
    expect(dup.status).toBe(409);
  });

  it('renames a trip, keeping its shortId stable', async () => {
    const trip = await createTrip('Alpen');
    const shortId = trip.body.trip.id;

    const renamed = await auth.agent
      .patch(`/api/trips/${shortId}`)
      .set('x-csrf-token', auth.csrf)
      .send({ name: '  Alpen 2027  ' });
    expect(renamed.status).toBe(200);
    // Name updated + trimmed, shortId unchanged (search/archive/links key on it).
    expect(renamed.body.trip).toMatchObject({ id: shortId, name: 'Alpen 2027' });

    const list = await auth.agent.get('/api/trips');
    expect(list.body.trips.map((t: { name: string }) => t.name)).toContain('Alpen 2027');
  });

  it('keeps the post count when renaming', async () => {
    const trip = await createTrip('Alpen');
    await createPost(postPayload({ tripId: trip.body.trip.id }));

    const renamed = await auth.agent
      .patch(`/api/trips/${trip.body.trip.id}`)
      .set('x-csrf-token', auth.csrf)
      .send({ name: 'Alpen neu' });
    expect(renamed.body.trip.postCount).toBe(1);
  });

  it('allows renaming a trip to its own unchanged name (no false 409)', async () => {
    const trip = await createTrip('Alpen');
    const same = await auth.agent
      .patch(`/api/trips/${trip.body.trip.id}`)
      .set('x-csrf-token', auth.csrf)
      .send({ name: 'Alpen' });
    expect(same.status).toBe(200);
    expect(same.body.trip.name).toBe('Alpen');
  });

  it('rejects renaming a trip to another trip\'s name with 409', async () => {
    await createTrip('Alpen');
    const other = await createTrip('Dolomiten');
    const clash = await auth.agent
      .patch(`/api/trips/${other.body.trip.id}`)
      .set('x-csrf-token', auth.csrf)
      .send({ name: 'Alpen' });
    expect(clash.status).toBe(409);
  });

  it('404s renaming an unknown trip', async () => {
    const res = await auth.agent
      .patch('/api/trips/zzzzzz')
      .set('x-csrf-token', auth.csrf)
      .send({ name: 'Neu' });
    expect(res.status).toBe(404);
  });

  it('requires the CSRF header to rename a trip (403)', async () => {
    const trip = await createTrip('Alpen');
    const res = await auth.agent
      .patch(`/api/trips/${trip.body.trip.id}`)
      .send({ name: 'Neu' });
    expect(res.status).toBe(403);
  });

  it('refuses to delete a trip that posts reference (409 + the posts)', async () => {
    const trip = await createTrip('Alpen');
    const post = await createPost(postPayload({ tripId: trip.body.trip.id }));

    const blocked = await auth.agent
      .delete(`/api/trips/${trip.body.trip.id}`)
      .set('x-csrf-token', auth.csrf);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toBe('trip_in_use');
    expect(blocked.body.posts).toEqual([
      { id: post.body.post.id, title: 'Berge' },
    ]);

    // After clearing the reference the trip can be deleted.
    await auth.agent
      .patch(`/api/posts/${post.body.post.id}`)
      .set('x-csrf-token', auth.csrf)
      .send({ tripId: '' });
    const del = await auth.agent
      .delete(`/api/trips/${trip.body.trip.id}`)
      .set('x-csrf-token', auth.csrf);
    expect(del.status).toBe(204);
  });
});
