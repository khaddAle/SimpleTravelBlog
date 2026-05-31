import { z } from 'zod';

const uploadEventSchema = z.object({
  type: z.string(),
  message: z.string().optional(),
});

export type UploadEvent = z.infer<typeof uploadEventSchema>;

/**
 * Drain complete SSE `data:` events from an accumulating text buffer, returning
 * the parsed events plus the unconsumed remainder.
 *
 * The remainder holds any trailing partial line — an event split across network
 * chunks — so the caller can prepend it to the next chunk before draining again.
 * This is what makes the stream robust behind a proxy (e.g. a Cloudflare tunnel)
 * that reframes TCP chunks and can split a single `data:` line in two.
 */
export function drainSseEvents(buf: string): { events: UploadEvent[]; rest: string } {
  const lines = buf.split('\n');
  // The last segment has no terminating newline yet: it may be incomplete, so
  // hold it back for the next chunk rather than parsing a truncated line.
  const rest = lines.pop() ?? '';
  const events: UploadEvent[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const payload = trimmed.slice('data:'.length).trim();
    if (payload === '') continue;
    const raw: unknown = JSON.parse(payload);
    events.push(uploadEventSchema.parse(raw));
  }
  return { events, rest };
}
