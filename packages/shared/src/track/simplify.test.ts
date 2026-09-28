import { describe, it, expect } from 'vitest';
import { buildTrack, type TrackSeries } from './build.js';
import { haversine } from './geo.js';
import { positionAtTime } from './interpolate.js';
import { fromRows, simplifyIndices, toRows } from './simplify.js';
import { annaWalk } from '../../tests/syntheticTrack.js';

const full = buildTrack(annaWalk());

describe('simplifyIndices', () => {
  const idx = simplifyIndices(full);

  it('keeps first and last point and drops points, ascending', () => {
    // The fixture is sparse (25 m) and jittery (±2 m), so only some points go.
    expect(idx[0]).toBe(0);
    expect(idx[idx.length - 1]).toBe(full.t.length - 1);
    expect(idx.length).toBeLessThan(full.t.length * 0.8);
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
  });

  it('thins a straight walk at constant speed to its two endpoints', () => {
    const n = 100;
    const line: TrackSeries = {
      lat: Array.from({ length: n }, (_, i) => 47 + i * 1e-5),
      lon: Array.from({ length: n }, () => 11),
      ele: Array.from({ length: n }, (_, i) => 500 + i * 0.1),
      t: Array.from({ length: n }, (_, i) => i * 1000),
      dist: Array.from({ length: n }, (_, i) => i * 1.11),
    };
    expect(simplifyIndices(line)).toEqual([0, n - 1]);
  });

  it('keeps a stop: time-synchronized, not just shape', () => {
    // Same straight line, but standing still for 60 s in the middle.
    const t = [0, 10_000, 70_000, 80_000];
    const stop: TrackSeries = {
      lat: [47, 47.0001, 47.0001, 47.0002],
      lon: [11, 11, 11, 11],
      ele: [0, 0, 0, 0],
      t,
      dist: [0, 11.1, 11.1, 22.2],
    };
    expect(simplifyIndices(stop)).toEqual([0, 1, 2, 3]);
  });

  it('keeps the time-synchronized replay error within 2 m and 1 m height', () => {
    const thin = fromRows(toRows(full, idx), full.stats.start);
    let maxPos = 0;
    let maxEle = 0;
    for (let i = 0; i < full.t.length; i++) {
      const p = positionAtTime(thin, full.t[i]!);
      maxPos = Math.max(maxPos, haversine(p, { lat: full.lat[i]!, lon: full.lon[i]! }));
      maxEle = Math.max(maxEle, Math.abs(p.ele - full.ele[i]!));
    }
    // Tolerances plus the rounding of stored rows (1e-6°, 0.1 m).
    expect(maxPos).toBeLessThanOrEqual(2.1);
    expect(maxEle).toBeLessThanOrEqual(1.05);
  });

  it('keeps more points with tighter tolerances', () => {
    expect(simplifyIndices(full, 0.5, 0.25).length).toBeGreaterThan(idx.length);
  });

  it('keeps both points of a two-point track', () => {
    const two: TrackSeries = { lat: [47, 47.1], lon: [11, 11], ele: [0, 0], t: [0, 1000], dist: [0, 11_000] };
    expect(simplifyIndices(two)).toEqual([0, 1]);
  });
});

describe('toRows / fromRows', () => {
  it('stores [lat, lon, ele, s from start, m] rounded for the wire', () => {
    const rows = toRows(full, [0, 1, full.t.length - 1]);
    expect(rows).toHaveLength(3);
    const [lat, lon, ele, s, m] = rows[1]!;
    expect(lat).toBe(+full.lat[1]!.toFixed(6));
    expect(lon).toBe(+full.lon[1]!.toFixed(6));
    expect(ele).toBe(+full.ele[1]!.toFixed(1));
    expect(s).toBe(Math.round((full.t[1]! - full.t[0]!) / 1000));
    expect(m).toBe(+full.dist[1]!.toFixed(1));
    expect(rows[0]![3]).toBe(0);
  });

  it('stores every point when no indices are given', () => {
    expect(toRows(full)).toHaveLength(full.t.length);
  });

  it('rebuilds a series with absolute times from the stored rows', () => {
    const start = Date.UTC(2026, 6, 11, 6, 40);
    const tr = fromRows(
      [
        [47, 11, 1000, 0, 0],
        [47.001, 11, 1010.5, 30, 111.2],
      ],
      start,
    );
    expect(tr).toEqual({
      lat: [47, 47.001],
      lon: [11, 11],
      ele: [1000, 1010.5],
      t: [start, start + 30_000],
      dist: [0, 111.2],
    });
  });
});
