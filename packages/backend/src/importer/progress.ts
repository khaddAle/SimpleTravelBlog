/**
 * A small, pure progress tracker for the importer's long-running upload/create
 * loops. A multi-hour run that only printed one terse line per item left a human
 * unsure whether it was still alive or how far along it was. This emits a
 * throttled summary line — current/total, percent, elapsed, throughput and a
 * rough ETA — at most every `everyItems` items or every `everyMs` milliseconds
 * (whichever comes first), plus an unconditional line at completion.
 *
 * Kept free of I/O so it can be unit-tested deterministically with an injected
 * clock; `cli.ts` decides what to do with each returned line (write to stdout).
 */

/** Render a millisecond duration as a compact `45s` / `11m23s` / `1h02m` string. */
export function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  if (totalSec < 3600) {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}m${String(s).padStart(2, '0')}s`;
  }
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  return `${h}h${String(m).padStart(2, '0')}m`;
}

export interface ProgressTrackerOptions {
  /** Total number of items the loop will process. */
  total: number;
  /** Human label for the unit, e.g. `Bilder` or `Beiträge`. */
  label: string;
  /** Emit at least every this many items (default 25). */
  everyItems?: number;
  /** Emit at least every this many milliseconds (default 10000). */
  everyMs?: number;
  /** Injectable clock (tests pass a controllable one); defaults to Date.now. */
  now?: () => number;
}

export interface ProgressTracker {
  /**
   * Record that `done` items are complete and return a progress line if it is
   * time to emit one, else `null`. Always returns a line once `done >= total`.
   * `skipped` (optional) is surfaced in the line, e.g. dedup hits.
   */
  tick(done: number, opts?: { skipped?: number }): string | null;
}

export function createProgressTracker(options: ProgressTrackerOptions): ProgressTracker {
  const { total, label } = options;
  const everyItems = options.everyItems ?? 25;
  const everyMs = options.everyMs ?? 10_000;
  const now = options.now ?? Date.now;

  const start = now();
  let lastEmitCount = 0;
  let lastEmitTime = start;

  return {
    tick(done, opts) {
      const t = now();
      const complete = done >= total;
      const dueByItems = done - lastEmitCount >= everyItems;
      const dueByTime = t - lastEmitTime >= everyMs;
      if (!complete && !dueByItems && !dueByTime) return null;

      lastEmitCount = done;
      lastEmitTime = t;

      const pct = total > 0 ? Math.floor((done / total) * 100) : 100;
      const elapsedMs = t - start;
      const elapsedSec = elapsedMs / 1000;
      const rate = elapsedSec > 0 ? done / elapsedSec : 0;

      const parts = [`${label} ${done}/${total} (${pct}%)`, formatDuration(elapsedMs)];
      if (rate > 0) {
        parts.push(`${rate.toFixed(1)}/s`);
        const remaining = Math.max(0, total - done);
        if (remaining > 0) parts.push(`ETA ~${formatDuration((remaining / rate) * 1000)}`);
      }
      if (opts?.skipped) parts.push(`${opts.skipped} übersprungen`);
      return parts.join(' · ');
    },
  };
}
