import { describe, it, expect, beforeEach } from 'vitest';
import RedisMock from 'ioredis-mock';
import type { Redis } from 'ioredis';
import { createProgressHub, type UploadProgressEvent } from './progress.js';
import type { ImageDto } from '@stb/shared';

const image: ImageDto = {
  id: 'abc123',
  originalFilename: 'x.jpg',
  mime: 'image/jpeg',
  width: 100,
  height: 80,
  displayUrl: '/api/public/images/abc123/display',
  thumbUrl: '/api/public/images/abc123/thumb',
  createdAt: '2026-05-29T00:00:00.000Z',
};

// Pub/sub delivery is event-loop deferred; let it flush before asserting.
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 10));

let redis: Redis;

beforeEach(async () => {
  redis = new RedisMock() as unknown as Redis;
  await redis.flushall();
});

describe('progress hub (Redis-backed)', () => {
  it('delivers live events to an existing subscriber', async () => {
    const hub = createProgressHub(redis);
    await hub.create('u1');
    const seen: UploadProgressEvent[] = [];
    const off = await hub.subscribe('u1', (e) => seen.push(e));

    await hub.publish('u1', { type: 'progress', pct: 50 });
    await hub.publish('u1', { type: 'done', image });
    await tick();

    expect(seen).toEqual([
      { type: 'progress', pct: 50 },
      { type: 'done', image },
    ]);
    expect(await hub.isDone('u1')).toBe(true);
    off();
  });

  it('replays buffered events to a late subscriber', async () => {
    const hub = createProgressHub(redis);
    await hub.create('u2');
    await hub.publish('u2', { type: 'progress', pct: 10 });
    await hub.publish('u2', { type: 'done', image });

    const seen: UploadProgressEvent[] = [];
    const off = await hub.subscribe('u2', (e) => seen.push(e));
    await tick();
    expect(seen).toEqual([
      { type: 'progress', pct: 10 },
      { type: 'done', image },
    ]);
    off();
  });

  it('stops delivering after unsubscribe', async () => {
    const hub = createProgressHub(redis);
    await hub.create('u3');
    const seen: UploadProgressEvent[] = [];
    const off = await hub.subscribe('u3', (e) => seen.push(e));
    await hub.publish('u3', { type: 'progress', pct: 1 });
    await tick();
    off();
    await hub.publish('u3', { type: 'progress', pct: 2 });
    await tick();
    expect(seen).toEqual([{ type: 'progress', pct: 1 }]);
  });

  it('reports has()/isDone() and treats error as terminal', async () => {
    const hub = createProgressHub(redis);
    expect(await hub.has('nope')).toBe(false);
    await hub.create('u4');
    expect(await hub.has('u4')).toBe(true);
    expect(await hub.isDone('u4')).toBe(false);
    expect(await hub.isDone('missing')).toBe(false);
    await hub.publish('u4', { type: 'error', message: 'boom' });
    expect(await hub.isDone('u4')).toBe(true);
  });

  it('delivers across separate hub instances (different pods, shared Redis)', async () => {
    // No in-process state is shared between the two hubs — state lives in Redis,
    // so an upload published by one pod is observable by an SSE stream on another.
    const publisherPod = createProgressHub(redis);
    const subscriberPod = createProgressHub(redis);

    await publisherPod.create('cross');
    const seen: UploadProgressEvent[] = [];
    const off = await subscriberPod.subscribe('cross', (e) => seen.push(e));

    await publisherPod.publish('cross', { type: 'progress', pct: 50 });
    await publisherPod.publish('cross', { type: 'done', image });
    await tick();

    expect(seen).toEqual([
      { type: 'progress', pct: 50 },
      { type: 'done', image },
    ]);
    off();
  });
});
