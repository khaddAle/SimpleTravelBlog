import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { subscribeUploadProgress, type EventSourceLike } from './uploads.js';
import type { ImageDto } from '@stb/shared';

class FakeEventSource implements EventSourceLike {
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  closed = false;
  url: string;
  constructor(url: string) {
    this.url = url;
  }
  emit(data: unknown): void {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
  fail(): void {
    this.onerror?.(new Event('error'));
  }
  close(): void {
    this.closed = true;
  }
}

/**
 * Factory that hands out a fresh fake per `connect()` and records them, so a
 * test can drive each reconnect independently.
 */
function fakeFactory(): {
  factory: (url: string) => FakeEventSource;
  sources: FakeEventSource[];
  last: () => FakeEventSource;
} {
  const sources: FakeEventSource[] = [];
  return {
    factory: (url: string) => {
      const es = new FakeEventSource(url);
      sources.push(es);
      return es;
    },
    sources,
    last: () => sources[sources.length - 1]!,
  };
}

const sampleImage: ImageDto = {
  id: 'img1',
  originalFilename: 'foto.jpg',
  mime: 'image/jpeg',
  width: 1600,
  height: 1200,
  displayUrl: '/api/public/images/img1/display',
  thumbUrl: '/api/public/images/img1/thumb',
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('subscribeUploadProgress', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('connects to the upload progress URL', () => {
    const { factory, last } = fakeFactory();
    subscribeUploadProgress('up1', {}, factory);
    expect(last().url).toBe('/api/images/upload/up1/progress');
  });

  it('reports progress then done, closing the stream', () => {
    const onProgress = vi.fn();
    const onDone = vi.fn();
    const { factory, last } = fakeFactory();
    subscribeUploadProgress('up1', { onProgress, onDone }, factory);
    last().emit({ type: 'progress', pct: 50 });
    last().emit({ type: 'done', image: sampleImage });
    expect(onProgress).toHaveBeenCalledWith(50);
    expect(onDone).toHaveBeenCalledWith(sampleImage);
    expect(last().closed).toBe(true);
  });

  it('reports a server error event and closes', () => {
    const onError = vi.fn();
    const { factory, last } = fakeFactory();
    subscribeUploadProgress('up1', { onError }, factory);
    last().emit({ type: 'error', message: 'kaputt' });
    expect(onError).toHaveBeenCalledWith('kaputt');
    expect(last().closed).toBe(true);
  });

  it('treats a single transport drop as a background reconnect, not a terminal error', () => {
    const onError = vi.fn();
    const onReconnecting = vi.fn();
    const { factory, last } = fakeFactory();
    subscribeUploadProgress('up1', { onError, onReconnecting }, factory);
    last().fail();
    expect(onReconnecting).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    expect(last().closed).toBe(true);
  });

  it('reconnects after a transient drop and delivers the terminal event', () => {
    const onProgress = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();
    const onReconnecting = vi.fn();
    const { factory, sources, last } = fakeFactory();
    subscribeUploadProgress(
      'up1',
      { onProgress, onDone, onError, onReconnecting },
      factory,
    );

    last().emit({ type: 'progress', pct: 30 });
    last().fail();
    expect(onReconnecting).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    expect(sources).toHaveLength(1);

    vi.runOnlyPendingTimers();
    expect(sources).toHaveLength(2);

    last().emit({ type: 'done', image: sampleImage });
    expect(onDone).toHaveBeenCalledWith(sampleImage);
    expect(onError).not.toHaveBeenCalled();
  });

  it('surfaces a single terminal error once the reconnect budget is exhausted', () => {
    const onError = vi.fn();
    const onReconnecting = vi.fn();
    const { factory, sources, last } = fakeFactory();
    subscribeUploadProgress('up1', { onError, onReconnecting }, factory);

    // SSE_MAX_RECONNECTS (8) reconnect attempts, each of which fails.
    for (let i = 0; i < 8; i++) {
      last().fail();
      expect(onError).not.toHaveBeenCalled();
      vi.runOnlyPendingTimers();
    }
    // The 8th reconnect's source now fails with the budget exhausted.
    last().fail();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith('Verbindung unterbrochen');
    expect(onReconnecting).toHaveBeenCalledTimes(8);

    const before = sources.length;
    vi.runOnlyPendingTimers();
    expect(sources).toHaveLength(before);
  });

  it('a live frame after a drop resets the reconnect budget', () => {
    const onError = vi.fn();
    const onReconnecting = vi.fn();
    const { factory, last } = fakeFactory();
    subscribeUploadProgress('up1', { onError, onReconnecting }, factory);

    // Exhaust all but the last of the budget, then recover with a live frame.
    for (let i = 0; i < 7; i++) {
      last().fail();
      vi.runOnlyPendingTimers();
    }
    last().emit({ type: 'progress', pct: 20 });

    // A fresh set of failures should not immediately terminate.
    for (let i = 0; i < 8; i++) {
      last().fail();
      expect(onError).not.toHaveBeenCalled();
      vi.runOnlyPendingTimers();
    }
    last().fail();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('a server error event terminates immediately without reconnecting', () => {
    const onError = vi.fn();
    const onReconnecting = vi.fn();
    const { factory, sources, last } = fakeFactory();
    subscribeUploadProgress('up1', { onError, onReconnecting }, factory);
    last().emit({ type: 'error', message: 'kaputt' });
    expect(onError).toHaveBeenCalledWith('kaputt');
    expect(onReconnecting).not.toHaveBeenCalled();
    vi.runOnlyPendingTimers();
    expect(sources).toHaveLength(1);
  });

  it('a done event closes and suppresses a subsequent onerror', () => {
    const onDone = vi.fn();
    const onError = vi.fn();
    const onReconnecting = vi.fn();
    const { factory, sources, last } = fakeFactory();
    subscribeUploadProgress('up1', { onDone, onError, onReconnecting }, factory);
    last().emit({ type: 'done', image: sampleImage });
    last().fail(); // the stream's post-done close raises a spurious onerror
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    expect(onReconnecting).not.toHaveBeenCalled();
    vi.runOnlyPendingTimers();
    expect(sources).toHaveLength(1);
  });

  it('ignores malformed payloads', () => {
    const onProgress = vi.fn();
    const { factory, last } = fakeFactory();
    subscribeUploadProgress('up1', { onProgress }, factory);
    last().onmessage?.({ data: 'not json' });
    expect(onProgress).not.toHaveBeenCalled();
  });

  it('unsubscribe closes the stream', () => {
    const { factory, last } = fakeFactory();
    const off = subscribeUploadProgress('up1', {}, factory);
    off();
    expect(last().closed).toBe(true);
  });

  it('unsubscribe cancels a pending reconnect timer', () => {
    const onError = vi.fn();
    const onReconnecting = vi.fn();
    const { factory, sources, last } = fakeFactory();
    const off = subscribeUploadProgress('up1', { onError, onReconnecting }, factory);
    last().fail();
    expect(onReconnecting).toHaveBeenCalledTimes(1);
    off();
    vi.runOnlyPendingTimers();
    expect(sources).toHaveLength(1);
    expect(onError).not.toHaveBeenCalled();
  });
});
