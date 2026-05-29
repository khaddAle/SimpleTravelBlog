import { describe, it, expect, vi, afterEach } from 'vitest';
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

afterEach(() => {
  vi.useRealTimers();
});

describe('progress hub', () => {
  it('delivers live events to an existing subscriber', () => {
    const hub = createProgressHub();
    hub.create('u1');
    const seen: UploadProgressEvent[] = [];
    hub.subscribe('u1', (e) => seen.push(e));

    hub.publish('u1', { type: 'progress', pct: 50 });
    hub.publish('u1', { type: 'done', image });

    expect(seen).toEqual([
      { type: 'progress', pct: 50 },
      { type: 'done', image },
    ]);
    expect(hub.isDone('u1')).toBe(true);
  });

  it('replays buffered events to a late subscriber', () => {
    const hub = createProgressHub();
    hub.create('u2');
    hub.publish('u2', { type: 'progress', pct: 10 });
    hub.publish('u2', { type: 'done', image });

    const seen: UploadProgressEvent[] = [];
    hub.subscribe('u2', (e) => seen.push(e));
    expect(seen).toEqual([
      { type: 'progress', pct: 10 },
      { type: 'done', image },
    ]);
  });

  it('stops delivering after unsubscribe', () => {
    const hub = createProgressHub();
    hub.create('u3');
    const seen: UploadProgressEvent[] = [];
    const off = hub.subscribe('u3', (e) => seen.push(e));
    hub.publish('u3', { type: 'progress', pct: 1 });
    off();
    hub.publish('u3', { type: 'progress', pct: 2 });
    expect(seen).toEqual([{ type: 'progress', pct: 1 }]);
  });

  it('reports has()/isDone() and treats error as terminal', () => {
    const hub = createProgressHub();
    expect(hub.has('nope')).toBe(false);
    hub.create('u4');
    expect(hub.has('u4')).toBe(true);
    expect(hub.isDone('u4')).toBe(false);
    expect(hub.isDone('missing')).toBe(false);
    hub.publish('u4', { type: 'error', message: 'boom' });
    expect(hub.isDone('u4')).toBe(true);
  });

  it('evicts a finished upload after the retain window', () => {
    vi.useFakeTimers();
    const hub = createProgressHub({ retainMs: 1000 });
    hub.create('u5');
    hub.publish('u5', { type: 'done', image });
    expect(hub.has('u5')).toBe(true);
    vi.advanceTimersByTime(1001);
    expect(hub.has('u5')).toBe(false);
  });
});
