import { describe, it, expect, vi } from 'vitest';
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
  it('connects to the upload progress URL', () => {
    let made: FakeEventSource | undefined;
    subscribeUploadProgress(
      'up1',
      {},
      (url) => (made = new FakeEventSource(url)),
    );
    expect(made?.url).toBe('/api/images/upload/up1/progress');
  });

  it('reports progress then done, closing the stream', () => {
    const onProgress = vi.fn();
    const onDone = vi.fn();
    let es: FakeEventSource | undefined;
    subscribeUploadProgress(
      'up1',
      { onProgress, onDone },
      (url) => (es = new FakeEventSource(url)),
    );
    es!.emit({ type: 'progress', pct: 50 });
    es!.emit({ type: 'done', image: sampleImage });
    expect(onProgress).toHaveBeenCalledWith(50);
    expect(onDone).toHaveBeenCalledWith(sampleImage);
    expect(es!.closed).toBe(true);
  });

  it('reports a server error event and closes', () => {
    const onError = vi.fn();
    let es: FakeEventSource | undefined;
    subscribeUploadProgress('up1', { onError }, (url) => (es = new FakeEventSource(url)));
    es!.emit({ type: 'error', message: 'kaputt' });
    expect(onError).toHaveBeenCalledWith('kaputt');
    expect(es!.closed).toBe(true);
  });

  it('reports a transport error', () => {
    const onError = vi.fn();
    let es: FakeEventSource | undefined;
    subscribeUploadProgress('up1', { onError }, (url) => (es = new FakeEventSource(url)));
    es!.fail();
    expect(onError).toHaveBeenCalledWith('Verbindung unterbrochen');
    expect(es!.closed).toBe(true);
  });

  it('ignores malformed payloads', () => {
    const onProgress = vi.fn();
    let es: FakeEventSource | undefined;
    subscribeUploadProgress('up1', { onProgress }, (url) => (es = new FakeEventSource(url)));
    es!.onmessage?.({ data: 'not json' });
    expect(onProgress).not.toHaveBeenCalled();
  });

  it('unsubscribe closes the stream', () => {
    let es: FakeEventSource | undefined;
    const off = subscribeUploadProgress('up1', {}, (url) => (es = new FakeEventSource(url)));
    off();
    expect(es!.closed).toBe(true);
  });
});
