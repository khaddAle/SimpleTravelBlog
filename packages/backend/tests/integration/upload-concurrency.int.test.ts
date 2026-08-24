import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { useTestDatabase } from '../db.js';
import { buildTestApp, authedAgent, type AuthedAgent } from '../helpers.js';
import * as pipeline from '../../src/images/pipeline.js';

// Replace only the memory-heavy pipeline step; everything else (storage, DB,
// progress) runs for real so the concurrency/backlog gates are exercised end
// to end.
vi.mock('../../src/images/pipeline.js', async (importActual) => {
  const actual = await importActual<typeof import('../../src/images/pipeline.js')>();
  return { ...actual, processImage: vi.fn() };
});

const processImage = vi.mocked(pipeline.processImage);

interface SseEvent {
  type: 'progress' | 'done' | 'error';
  pct?: number;
  image?: { id: string };
}

function parseSse(text: string): SseEvent[] {
  return text
    .split('\n')
    .filter((l) => l.startsWith('data: '))
    .map((l) => JSON.parse(l.slice(6)) as SseEvent);
}

async function until(pred: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > timeoutMs) throw new Error('condition not met in time');
    await new Promise((r) => setTimeout(r, 5));
  }
}

/** A one-pixel-ish processed result; the bytes are never decoded downstream. */
const fakeProcessed = {
  display: Buffer.from('display'),
  thumb: Buffer.from('thumb'),
  width: 4,
  height: 3,
} as Awaited<ReturnType<typeof pipeline.processImage>>;

describe('upload concurrency + backlog gating', () => {
  useTestDatabase();

  let app: FastifyInstance;
  let auth: AuthedAgent;

  // A barrier every mocked pipeline awaits, so a test can hold pipelines open
  // and inspect peak concurrency before releasing them.
  let inflight = 0;
  let peak = 0;
  let release!: () => void;
  let barrier: Promise<void>;

  function resetBarrier(): void {
    inflight = 0;
    peak = 0;
    barrier = new Promise<void>((r) => {
      release = r;
    });
  }

  beforeEach(() => {
    resetBarrier();
    processImage.mockImplementation(async () => {
      inflight++;
      peak = Math.max(peak, inflight);
      await barrier;
      inflight--;
      return fakeProcessed;
    });
  });

  afterEach(async () => {
    release?.(); // never leave a pipeline stuck across tests
    await app?.close();
    vi.clearAllMocks();
  });

  const upload = (n: number): Promise<{ status: number; body: Record<string, unknown>; headers: Record<string, string> }> =>
    auth.agent
      .post('/api/images/upload')
      .set('x-csrf-token', auth.csrf)
      .attach('file', Buffer.from(`img-${n}`), { filename: `f${n}.jpg`, contentType: 'image/jpeg' })
      .then((r) => ({ status: r.status, body: r.body, headers: r.headers }));

  it('never runs more pipelines at once than the concurrency cap', async () => {
    ({ app } = await buildTestApp({ IMAGE_PIPELINE_CONCURRENCY: '3' }));
    auth = await authedAgent(app);

    // Fire more uploads than the cap; all are accepted (202) immediately.
    const accepted = await Promise.all(Array.from({ length: 6 }, (_, i) => upload(i)));
    for (const res of accepted) expect(res.status).toBe(202);

    // With the barrier held, exactly the cap should be decoding at once.
    await until(() => inflight === 3);
    await new Promise((r) => setTimeout(r, 20));
    expect(peak).toBe(3);
    expect(inflight).toBe(3);

    // Release and confirm every upload drains to a terminal `done`.
    release();
    const uploadIds = accepted.map((r) => r.body.uploadId as string);
    const streams = await Promise.all(
      uploadIds.map((id) => auth.agent.get(`/api/images/upload/${id}/progress`)),
    );
    for (const sse of streams) {
      expect(parseSse(sse.text).some((e) => e.type === 'done')).toBe(true);
    }
    expect(peak).toBe(3);
  });

  it('replies 429 + Retry-After once the accepted-upload backlog is full', async () => {
    ({ app } = await buildTestApp({
      IMAGE_PIPELINE_CONCURRENCY: '1',
      IMAGE_UPLOAD_MAX_BACKLOG: '2',
    }));
    auth = await authedAgent(app);

    // The pipelines are stalled on the barrier, so the backlog fills and holds.
    const a = await upload(1);
    const b = await upload(2);
    const c = await upload(3);
    expect(a.status).toBe(202);
    expect(b.status).toBe(202);
    expect(c.status).toBe(429);
    expect(c.headers['retry-after']).toBe('2');
    expect(c.body.error).toBe('too_many_uploads');

    // Drain the two in-flight uploads.
    release();
    await Promise.all(
      [a, b].map((r) => auth.agent.get(`/api/images/upload/${r.body.uploadId}/progress`)),
    );

    // Counter is back to 0: a fresh burst up to the backlog is accepted again,
    // never spuriously 429'd.
    resetBarrier();
    const again = await Promise.all([upload(4), upload(5)]);
    for (const res of again) expect(res.status).toBe(202);
    release();
    await Promise.all(
      again.map((r) => auth.agent.get(`/api/images/upload/${r.body.uploadId}/progress`)),
    );
  });
});
