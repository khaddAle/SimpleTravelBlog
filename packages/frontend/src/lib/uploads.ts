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
  /** Fired when a transient drop is being retried in the background. */
  onReconnecting?: () => void;
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

// Reconnect budget for transient SSE drops, mirroring the capped-backoff style
// of `ImagePicker.uploadWithBackoff`. The backend replays the full event
// history (terminal `done`/`error` included) from Redis on every subscribe,
// within a 300 s sliding TTL — so reconnecting to the same URL recovers the real
// outcome. The ~40–50 s window below comfortably covers a pod rollout while
// staying well under that TTL.
const SSE_MAX_RECONNECTS = 8;
const SSE_RECONNECT_BASE_MS = 1000;
const SSE_RECONNECT_CAP_MS = 8000;

/**
 * Subscribe to an upload's progress channel. Returns an unsubscribe function;
 * the stream also closes itself once a terminal event arrives. The connection is
 * cookie-authenticated (same-origin), so no extra headers are needed.
 *
 * A transient transport drop reconnects in the background with bounded backoff
 * (the server's history replay re-delivers earlier events, including the
 * terminal one); only a sustained outage — retries exhausted — surfaces
 * `onError`.
 */
export function subscribeUploadProgress(
  uploadId: string,
  handlers: UploadProgressHandlers,
  factory: EventSourceFactory = defaultFactory,
): () => void {
  const url = `/api/images/upload/${uploadId}/progress`;

  let source: EventSourceLike | null = null;
  let attempts = 0;
  let finished = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  function teardown(): void {
    finished = true;
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    source?.close();
  }

  function connect(): void {
    const es = factory(url);
    source = es;

    es.onmessage = (event) => {
      // Any received frame proves the connection is live again.
      attempts = 0;
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
          finished = true;
          handlers.onDone?.(parsed.image);
          teardown();
          break;
        case 'error':
          finished = true;
          handlers.onError?.(parsed.message);
          teardown();
          break;
      }
    };

    es.onerror = () => {
      // The stream raises a spurious `onerror` as it closes right after a
      // terminal event; `finished` guards against treating that as a drop.
      if (finished) return;
      es.close();
      if (attempts >= SSE_MAX_RECONNECTS) {
        handlers.onError?.('Verbindung unterbrochen');
        teardown();
        return;
      }
      attempts += 1;
      handlers.onReconnecting?.();
      const backoff = Math.min(
        SSE_RECONNECT_CAP_MS,
        SSE_RECONNECT_BASE_MS * 2 ** (attempts - 1),
      );
      const wait = backoff / 2 + Math.random() * (backoff / 2);
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, wait);
    };
  }

  connect();

  return () => {
    teardown();
  };
}
