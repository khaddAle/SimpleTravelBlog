import { describe, it, expect } from 'vitest';
import type { TimeInterval } from '@stb/shared';
import {
  advanceClock,
  buildTimeline,
  gapAt,
  GAP_MIN_MS,
  PHOTO_HOLD_MS,
  Replay,
  type Timeline,
} from './replay.js';

const MIN = 60_000;

const track = (start: number, end: number, moving: TimeInterval[]) => ({
  stats: { start, end },
  moving,
});

describe('buildTimeline', () => {
  it('spans both tracks and skips only stretches where nobody moves', () => {
    const tl = buildTimeline([
      track(0, 60 * MIN, [
        [0, 20 * MIN],
        [40 * MIN, 60 * MIN],
      ]),
      // Ben still walks during the first 5 min of Anna's break.
      track(10 * MIN, 90 * MIN, [
        [10 * MIN, 25 * MIN],
        [45 * MIN, 70 * MIN],
      ]),
    ]);
    expect(tl.tMin).toBe(0);
    expect(tl.tMax).toBe(90 * MIN);
    expect(tl.gaps).toEqual([
      [25 * MIN, 40 * MIN],
      [70 * MIN, 90 * MIN],
    ]);
  });

  it('keeps short stops', () => {
    const tl = buildTimeline([
      track(0, 30 * MIN, [
        [0, 10 * MIN],
        [10 * MIN + GAP_MIN_MS, 30 * MIN],
      ]),
    ]);
    expect(tl.gaps).toEqual([]);
  });
});

describe('advanceClock', () => {
  const tl: Timeline = { tMin: 0, tMax: 60 * MIN, gaps: [[10 * MIN, 40 * MIN]] };

  it('runs at the chosen speed while someone moves', () => {
    expect(advanceClock(0, 1000, 60, tl)).toBe(60_000);
  });

  it('crosses a long pause in about one second', () => {
    // 30 min pause at ≥ 1800×: one second of wall time covers it.
    const at = advanceClock(10 * MIN, 1000, 60, tl);
    expect(at).toBe(40 * MIN);
    expect(gapAt(20 * MIN, tl)).toEqual([10 * MIN, 40 * MIN]);
    expect(gapAt(40 * MIN, tl)).toBeNull();
  });

  it('carries the remaining wall time over a gap boundary', () => {
    // 1 min before the gap at 60×: 1 s reaches it, the next 0.5 s is gap time.
    const at = advanceClock(9 * MIN, 1500, 60, tl);
    expect(at).toBe(10 * MIN + 15 * MIN);
  });

  it('stops at the end', () => {
    expect(advanceClock(59 * MIN, 10_000, 600, tl)).toBe(60 * MIN);
  });
});

describe('Replay controller', () => {
  const tl: Timeline = { tMin: 0, tMax: 10 * MIN, gaps: [] };

  it('advances the clock per frame, with frames capped at 100 ms', () => {
    const r = new Replay(tl, []);
    expect(r.clock).toBe(0);
    r.play(1000);
    expect(r.playing).toBe(true);
    r.frame(1050);
    expect(r.clock).toBe(3000);
    r.frame(2050); // a stalled tab: counts as 100 ms only
    expect(r.clock).toBe(9000);
  });

  it('uses the chosen speed', () => {
    const r = new Replay(tl, []);
    r.speed = 600;
    r.play(0);
    r.frame(100);
    expect(r.clock).toBe(60_000);
  });

  it('stops at the end and restarts from the beginning', () => {
    const r = new Replay(tl, []);
    r.speed = 600;
    r.seek(10 * MIN - 1000);
    r.play(0);
    expect(r.frame(100)).toEqual({ stopped: true });
    expect(r.playing).toBe(false);
    expect(r.clock).toBe(10 * MIN);
    r.play(200);
    expect(r.clock).toBe(0);
  });

  it('ignores frames while paused', () => {
    const r = new Replay(tl, []);
    expect(r.frame(100)).toEqual({});
    expect(r.clock).toBe(0);
  });

  it('clamps seeks to the timeline', () => {
    const r = new Replay(tl, []);
    r.seek(-5);
    expect(r.clock).toBe(0);
    r.seek(20 * MIN);
    expect(r.clock).toBe(10 * MIN);
  });

  it('opens each passed photo once and holds for 5 s when photos are shown', () => {
    const r = new Replay(tl, [2000, 2000, 5 * MIN]);
    r.showPhotos = true;
    r.play(0);
    r.frame(50); // clock 3000
    expect(r.frame(100)).toEqual({ photo: 0 });
    expect(r.frame(100 + PHOTO_HOLD_MS - 1)).toEqual({ holding: true });
    const clock = r.clock;
    // Hold ends: the card closes and the second photo at the same spot opens.
    expect(r.frame(100 + PHOTO_HOLD_MS)).toEqual({ closeCard: true, photo: 1 });
    expect(r.clock).toBe(clock);
  });

  it('lets the reader end a hold early', () => {
    const r = new Replay(tl, [0]);
    r.showPhotos = true;
    r.play(0);
    expect(r.frame(10)).toEqual({ photo: 0 });
    r.releaseHold();
    expect(r.frame(20)).toEqual({});
    expect(r.clock).toBe(600);
  });

  it('does not open photos while they are hidden', () => {
    const r = new Replay(tl, [0]);
    r.play(0);
    expect(r.frame(10)).toEqual({});
  });

  it('treats photos before a seek target as seen', () => {
    const r = new Replay(tl, [1000, 5 * MIN]);
    r.showPhotos = true;
    r.seek(2 * MIN);
    r.play(0);
    expect(r.frame(10)).toEqual({});
    r.seek(0);
    r.play(20);
    r.frame(60); // clock 2400
    expect(r.frame(70)).toEqual({ photo: 0 });
  });

  it('plays photos left at the end before stopping', () => {
    const r = new Replay(tl, [10 * MIN]);
    r.showPhotos = true;
    r.speed = 600;
    r.seek(10 * MIN - 1000);
    r.play(0);
    expect(r.frame(100)).toEqual({});
    expect(r.frame(200)).toEqual({ photo: 0 });
    expect(r.frame(200 + PHOTO_HOLD_MS)).toEqual({ closeCard: true, stopped: true });
  });

  it('reports the pause being skipped', () => {
    const r = new Replay({ tMin: 0, tMax: 60 * MIN, gaps: [[10 * MIN, 40 * MIN]] }, []);
    expect(r.gap).toBeNull();
    r.seek(20 * MIN);
    expect(r.gap).toEqual([10 * MIN, 40 * MIN]);
  });
});
