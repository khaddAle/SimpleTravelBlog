import type { ImageDto } from '@stb/shared';

/**
 * Server-sent upload-progress events, mirroring the backend progress hub
 * (`packages/backend/src/images/progress.ts`). The stream ends after the first
 * terminal event (`done` or `error`).
 */
export type UploadProgressEvent =
  | { type: 'progress'; pct: number }
  | { type: 'done'; image: ImageDto }
  | { type: 'error'; message: string };

export interface UploadProgressHandlers {
  onProgress?: (pct: number) => void;
  onDone?: (image: ImageDto) => void;
  onError?: (message: string) => void;
}

/** Minimal EventSource surface, so tests can inject a fake. */
export interface EventSourceLike {
  onmessage: ((event: { data: string }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  close(): void;
}

export type EventSourceFactory = (url: string) => EventSourceLike;

const defaultFactory: EventSourceFactory = (url) =>
  new EventSource(url, { withCredentials: true }) as unknown as EventSourceLike;

/**
 * Subscribe to an upload's progress channel. Returns an unsubscribe function;
 * the stream also closes itself once a terminal event arrives. The connection is
 * cookie-authenticated (same-origin), so no extra headers are needed.
 */
export function subscribeUploadProgress(
  uploadId: string,
  handlers: UploadProgressHandlers,
  factory: EventSourceFactory = defaultFactory,
): () => void {
  const source = factory(`/api/images/upload/${uploadId}/progress`);

  source.onmessage = (event) => {
    let parsed: UploadProgressEvent;
    try {
      parsed = JSON.parse(event.data) as UploadProgressEvent;
    } catch {
      return;
    }
    switch (parsed.type) {
      case 'progress':
        handlers.onProgress?.(parsed.pct);
        break;
      case 'done':
        handlers.onDone?.(parsed.image);
        source.close();
        break;
      case 'error':
        handlers.onError?.(parsed.message);
        source.close();
        break;
    }
  };

  source.onerror = () => {
    handlers.onError?.('Verbindung unterbrochen');
    source.close();
  };

  return () => source.close();
}
