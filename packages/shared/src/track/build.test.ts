import { describe, it, expect } from 'vitest';
import { buildTrack, type RawTrackPoint } from './build.js';
import { R_EARTH } from './geo.js';
import { annaWalk } from '../../tests/syntheticTrack.js';

const T0 = Date.UTC(2026, 8, 12, 8, 0);
/** Degrees of latitude for 9 m along a meridian (off the ±20 m smoothing boundary). */
const STEP_DEG = 9 / ((R_EARTH * Math.PI) / 180);

/** `n` points due north, 9 m apart, every `dtAt(i)` ms (default 5 s → 1.8 m/s). */
function line(
  n: number,
  eleAt: (i: number) => number | null = () => 500,
  dtAt: (i: number) => number = () => 5000,
): RawTrackPoint[] {
  const pts: RawTrackPoint[] = [];
  let t = T0;
  for (let i = 0; i < n; i++) {
    if (i > 0) t += dtAt(i);
    pts.push({ lat: 47 + i * STEP_DEG, lon: 11, ele: eleAt(i), t });
  }
  return pts;
}

/** Ramp 0→50 m (i 0..50), plateau to i 70, down to 20 m at i 100. */
const hill = (i: number): number => (i <= 50 ? i : i <= 70 ? 50 : 50 - (i - 70));

describe('buildTrack', () => {
  it('rejects fewer than two points', () => {
    expect(() => buildTrack(line(1))).toThrow();
  });

  it('accumulates distance and reports start, end and total', () => {
    const tr = buildTrack(line(101));
    expect(tr.dist[0]).toBe(0);
    expect(tr.dist[50]).toBeCloseTo(450, 6);
    expect(tr.stats.distance).toBeCloseTo(900, 6);
    expect(tr.stats.start).toBe(T0);
    expect(tr.stats.end).toBe(T0 + 100 * 5000);
    expect(tr.t).toHaveLength(101);
    expect(tr.lat[0]).toBe(47);
    expect(tr.lon[100]).toBe(11);
  });

  it('counts raw ascent and descent without smoothing', () => {
    const tr = buildTrack(line(101, hill), { smoothM: 0 });
    expect(tr.stats.ascent).toBeCloseTo(50, 9);
    expect(tr.stats.descent).toBeCloseTo(30, 9);
    expect(tr.stats.minEle).toBe(0);
    expect(tr.stats.maxEle).toBe(50);
  });

  it('smooths elevation over ±20 m of distance by default', () => {
    const tr = buildTrack(line(101, hill));
    // Start = mean of 0,1,2 → 1; end = mean of 22,21,20 → 21; plateau stays 50.
    expect(tr.ele[0]).toBeCloseTo(1, 9);
    expect(tr.ele[60]).toBeCloseTo(50, 9);
    expect(tr.ele[100]).toBeCloseTo(21, 9);
    expect(tr.stats.ascent).toBeCloseTo(49, 9);
    expect(tr.stats.descent).toBeCloseTo(29, 9);
  });

  it('ignores steps below the threshold', () => {
    const saw = (i: number): number => (i % 2) * 3;
    expect(buildTrack(line(11, saw), { smoothM: 0 }).stats.ascent).toBe(15);
    expect(buildTrack(line(11, saw), { smoothM: 0, threshold: 5 }).stats.ascent).toBe(0);
  });

  it('carries the last known elevation over gaps', () => {
    const eles = [null, null, 5, null, 7];
    const tr = buildTrack(line(5, (i) => eles[i] ?? null), { smoothM: 0 });
    expect(tr.ele).toEqual([5, 5, 5, 5, 7]);
    expect(tr.hasEle).toBe(true);
  });

  it('falls back to 0 m when the track has no elevation at all', () => {
    const tr = buildTrack(line(3, () => null));
    expect(tr.hasEle).toBe(false);
    expect(tr.ele).toEqual([0, 0, 0]);
    expect(tr.stats.minEle).toBe(0);
    expect(tr.stats.maxEle).toBe(0);
  });

  it('counts a steadily moving track as one moving interval', () => {
    const tr = buildTrack(line(101));
    expect(tr.stats.movingMs).toBe(100 * 5000);
    expect(tr.moving).toEqual([[T0, T0 + 100 * 5000]]);
  });

  it('treats a segment longer than 5 min as a pause', () => {
    const tr = buildTrack(line(101, undefined, (i) => (i === 51 ? 10 * 60_000 : 5000)));
    const t50 = T0 + 50 * 5000;
    const t51 = t50 + 10 * 60_000;
    expect(tr.stats.movingMs).toBe(99 * 5000);
    expect(tr.moving).toEqual([
      [T0, t50],
      [t51, t51 + 49 * 5000],
    ]);
  });

  it('treats speeds below 0.25 m/s as standing', () => {
    // 9 m in 60 s = 0.15 m/s.
    const tr = buildTrack(line(5, undefined, (i) => (i === 2 ? 60_000 : 5000)));
    expect(tr.stats.movingMs).toBe(3 * 5000);
    expect(tr.moving).toHaveLength(2);
  });

  it('builds plausible stats for the synthetic alpine walk', () => {
    const tr = buildTrack(annaWalk());
    // 950 m of climb; the smoothing removes nearly all of the ±1.5 m noise.
    expect(tr.stats.ascent).toBeGreaterThan(945);
    expect(tr.stats.ascent).toBeLessThan(1000);
    expect(tr.stats.descent).toBeGreaterThan(945);
    expect(tr.stats.descent).toBeLessThan(1000);
    expect(tr.stats.distance).toBeGreaterThan(8000);
    // The 60 min summit break is not moving time.
    const longestPause = Math.max(
      ...tr.moving.slice(1).map((iv, k) => iv[0] - tr.moving[k]![1]),
    );
    expect(longestPause).toBeGreaterThan(55 * 60_000);
    expect(tr.stats.end - tr.stats.start - tr.stats.movingMs).toBeGreaterThan(55 * 60_000);
  });
});
