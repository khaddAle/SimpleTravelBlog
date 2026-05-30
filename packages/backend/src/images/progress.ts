import { z } from 'zod';
import type { Redis } from 'ioredis';
import type { ImageDto } from '@stb/shared';

/**
 * Redis-backed pub/sub for image-upload progress, keyed by an opaque uploadId.
 *
 * The upload route processes the image in the background and `publish`es
 * progress; the SSE route `subscribe`s and streams events to the browser. State
 * lives in Redis (not process memory) so the app is horizontally scalable: the
 * upload may run on one pod while the SSE stream is served by another. Each
 * upload's events are appended to a Redis list (history) and fan-out over a
 * Redis pub/sub channel (live). A subscriber replays the history first, so a
 * late SSE connection — or a pipeline that finished before the client opened the
 * stream — never misses the terminal `done`/`error`.
 *
 * All keys carry a TTL so finished (or abandoned) uploads evict themselves.
 */

export type UploadProgressEvent =
  | { type: 'progress'; pct: number }
  | { type: 'done'; image: ImageDto }
  | { type: 'error'; message: string };

export interface ProgressHub {
  create(uploadId: string): Promise<void>;
  publish(uploadId: string, event: UploadProgressEvent): Promise<void>;
  /** Returns an unsubscribe function. Buffered events are replayed first. */
  subscribe(
    uploadId: string,
    listener: (e: UploadProgressEvent) => void,
  ): Promise<() => void>;
  has(uploadId: string): Promise<boolean>;
  isDone(uploadId: string): Promise<boolean>;
}

// Validate the JSON we read back from Redis at the parse boundary. Typed as
// ZodType<UploadProgressEvent> so the schema is forced to match the union.
const imageDtoSchema = z.object({
  id: z.string(),
  originalFilename: z.string(),
  mime: z.string(),
  width: z.number(),
  height: z.number(),
  displayUrl: z.string(),
  thumbUrl: z.string(),
  createdAt: z.string(),
});
const eventSchema: z.ZodType<UploadProgressEvent> = z.union([
  z.object({ type: z.literal('progress'), pct: z.number() }),
  z.object({ type: z.literal('done'), image: imageDtoSchema }),
  z.object({ type: z.literal('error'), message: z.string() }),
]);
// Pub/sub envelope: the event plus its sequence (list index) for replay dedup.
const envelopeSchema = z.object({ seq: z.number(), event: eventSchema });

function isTerminal(e: UploadProgressEvent): boolean {
  return e.type === 'done' || e.type === 'error';
}

function metaKey(uploadId: string): string {
  return `upload:${uploadId}:meta`;
}
function listKey(uploadId: string): string {
  return `upload:${uploadId}:events`;
}
// Channel names are not key-prefixed by ioredis; the uploadId is a random UUID
// so dev/prod sharing one Redis never collide.
function channelName(uploadId: string): string {
  return `tbupload:${uploadId}`;
}

export function createProgressHub(
  redis: Redis,
  opts: { ttlSeconds?: number } = {},
): ProgressHub {
  const ttl = opts.ttlSeconds ?? 300;

  return {
    async create(uploadId) {
      await redis.set(metaKey(uploadId), 'active', 'EX', ttl);
    },

    async publish(uploadId, event) {
      const len = await redis.rpush(listKey(uploadId), JSON.stringify(event));
      await redis.expire(listKey(uploadId), ttl);
      await redis.set(metaKey(uploadId), isTerminal(event) ? 'done' : 'active', 'EX', ttl);
      const seq = len - 1;
      await redis.publish(channelName(uploadId), JSON.stringify({ seq, event }));
    },

    async subscribe(uploadId, listener) {
      const sub = redis.duplicate();
      if (sub.status === 'wait') await sub.connect();

      let replayedThrough = -1; // highest list index already delivered
      let replaying = true;
      const buffered: { seq: number; event: UploadProgressEvent }[] = [];

      const onMessage = (chan: string, message: string): void => {
        if (chan !== channelName(uploadId)) return;
        const { seq, event } = envelopeSchema.parse(JSON.parse(message) as unknown);
        if (replaying) {
          buffered.push({ seq, event });
        } else if (seq > replayedThrough) {
          replayedThrough = seq;
          listener(event);
        }
      };
      sub.on('message', onMessage);
      await sub.subscribe(channelName(uploadId));

      // Replay history captured before we subscribed.
      const history = await redis.lrange(listKey(uploadId), 0, -1);
      history.forEach((p, i) => {
        replayedThrough = i;
        listener(eventSchema.parse(JSON.parse(p) as unknown));
      });
      // Flush messages that arrived during subscribe/lrange, deduped by seq.
      replaying = false;
      for (const { seq, event } of buffered) {
        if (seq > replayedThrough) {
          replayedThrough = seq;
          listener(event);
        }
      }

      return () => {
        // Remove the local listener synchronously so no further events are
        // delivered, then tear down the dedicated subscriber connection.
        sub.off('message', onMessage);
        void sub.quit().catch(() => {});
      };
    },

    async has(uploadId) {
      return (await redis.exists(metaKey(uploadId))) === 1;
    },

    async isDone(uploadId) {
      return (await redis.get(metaKey(uploadId))) === 'done';
    },
  };
}
