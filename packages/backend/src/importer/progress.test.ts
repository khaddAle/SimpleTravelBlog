import { describe, expect, it } from 'vitest';
import { createProgressTracker, formatDuration } from './progress.js';

describe('formatDuration', () => {
  it('renders sub-minute durations as seconds', () => {
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(45_000)).toBe('45s');
    expect(formatDuration(59_400)).toBe('59s');
  });

  it('renders minute-scale durations as m s', () => {
    expect(formatDuration(60_000)).toBe('1m00s');
    expect(formatDuration(683_000)).toBe('11m23s');
  });

  it('renders hour-scale durations as h m', () => {
    expect(formatDuration(3_600_000)).toBe('1h00m');
    expect(formatDuration(3_723_000)).toBe('1h02m');
  });
});

describe('createProgressTracker', () => {
  // A controllable clock so emission timing is deterministic.
  const clock = (start = 0): { now: () => number; advance: (ms: number) => void } => {
    let t = start;
    return { now: () => t, advance: (ms) => (t += ms) };
  };

  it('does not emit before the item threshold is reached', () => {
    const tracker = createProgressTracker({ total: 10, label: 'Bilder', everyItems: 5, everyMs: 10_000, now: () => 0 });
    expect(tracker.tick(1)).toBeNull();
    expect(tracker.tick(4)).toBeNull();
  });

  it('emits once the item threshold is crossed', () => {
    const tracker = createProgressTracker({ total: 10, label: 'Bilder', everyItems: 5, everyMs: 10_000, now: () => 0 });
    tracker.tick(4);
    const line = tracker.tick(5);
    expect(line).not.toBeNull();
    expect(line).toContain('Bilder');
    expect(line).toContain('5/10');
    expect(line).toContain('50%');
  });

  it('emits on a time threshold even when few items have advanced', () => {
    const c = clock();
    const tracker = createProgressTracker({ total: 100, label: 'Bilder', everyItems: 1000, everyMs: 1000, now: c.now });
    expect(tracker.tick(1)).toBeNull();
    c.advance(500);
    expect(tracker.tick(2)).toBeNull();
    c.advance(500);
    expect(tracker.tick(3)).not.toBeNull();
  });

  it('always emits a final line at completion regardless of thresholds', () => {
    const tracker = createProgressTracker({ total: 3, label: 'Bilder', everyItems: 1000, everyMs: 1_000_000, now: () => 0 });
    expect(tracker.tick(1)).toBeNull();
    const line = tracker.tick(3);
    expect(line).not.toBeNull();
    expect(line).toContain('3/3');
    expect(line).toContain('100%');
  });

  it('includes an upload rate and ETA once time has elapsed', () => {
    const c = clock();
    const tracker = createProgressTracker({ total: 100, label: 'Bilder', everyItems: 10, everyMs: 100_000, now: c.now });
    c.advance(10_000); // 10s elapsed
    const line = tracker.tick(10); // 10 items in 10s => 1.0/s, 90 left => ETA ~1m30s
    expect(line).toContain('1.0/s');
    expect(line).toContain('ETA');
    expect(line).toContain('1m30s');
  });

  it('reports a skipped count when supplied', () => {
    const tracker = createProgressTracker({ total: 10, label: 'Bilder', everyItems: 1, everyMs: 10_000, now: () => 0 });
    const line = tracker.tick(5, { skipped: 3 });
    expect(line).toContain('3 übersprungen');
  });

  it('does not divide by zero for a zero total', () => {
    const tracker = createProgressTracker({ total: 0, label: 'Bilder', now: () => 0 });
    // No items to process; a tick at 0 should be safe and report 100%.
    const line = tracker.tick(0);
    expect(line).toContain('0/0');
    expect(line).toContain('100%');
  });
});
