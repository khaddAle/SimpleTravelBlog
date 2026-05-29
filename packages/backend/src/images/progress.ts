import { EventEmitter } from 'node:events';
import type { ImageDto } from '@stb/shared';

/**
 * In-process pub/sub for image-upload progress, keyed by an opaque uploadId.
 *
 * The upload route processes the image in the background and `publish`es
 * progress; the SSE route `subscribe`s and streams events to the browser. A
 * subscriber that connects *after* an event was published still sees it: every
 * upload buffers its event history and replays it on subscribe, so a late SSE
 * connection (or a fast pipeline that finished before the client opened the
 * stream) never misses the terminal `done`/`error`.
 *
 * State for a finished upload is evicted `retainMs` after the terminal event.
 */

export type UploadProgressEvent =
  | { type: 'progress'; pct: number }
  | { type: 'done'; image: ImageDto }
  | { type: 'error'; message: string };

export interface ProgressHub {
  create(uploadId: string): void;
  publish(uploadId: string, event: UploadProgressEvent): void;
  /** Returns an unsubscribe function. Buffered events are replayed first. */
  subscribe(uploadId: string, listener: (e: UploadProgressEvent) => void): () => void;
  has(uploadId: string): boolean;
  isDone(uploadId: string): boolean;
}

interface Channel {
  events: UploadProgressEvent[];
  emitter: EventEmitter;
  done: boolean;
}

const EVENT = 'event';

function isTerminal(e: UploadProgressEvent): boolean {
  return e.type === 'done' || e.type === 'error';
}

export function createProgressHub(opts: { retainMs?: number } = {}): ProgressHub {
  const retainMs = opts.retainMs ?? 60_000;
  const channels = new Map<string, Channel>();

  function channel(uploadId: string): Channel {
    let ch = channels.get(uploadId);
    if (!ch) {
      ch = { events: [], emitter: new EventEmitter(), done: false };
      ch.emitter.setMaxListeners(0);
      channels.set(uploadId, ch);
    }
    return ch;
  }

  return {
    create(uploadId) {
      channel(uploadId);
    },

    publish(uploadId, event) {
      const ch = channel(uploadId);
      ch.events.push(event);
      ch.emitter.emit(EVENT, event);
      if (isTerminal(event)) {
        ch.done = true;
        const timer = setTimeout(() => channels.delete(uploadId), retainMs);
        // Don't keep the process alive just to evict a finished upload.
        timer.unref();
      }
    },

    subscribe(uploadId, listener) {
      const ch = channel(uploadId);
      for (const e of ch.events) listener(e);
      ch.emitter.on(EVENT, listener);
      return () => ch.emitter.off(EVENT, listener);
    },

    has(uploadId) {
      return channels.has(uploadId);
    },

    isDone(uploadId) {
      return channels.get(uploadId)?.done ?? false;
    },
  };
}
