import { describe, it, expect } from 'vitest';
import { positionAtTime, timeAtDistance } from './interpolate.js';
import type { TrackSeries } from './build.js';

// Four points; the walker stands still between t=5 s and t=65 s.
const tr: TrackSeries = {
  lat: [47, 47.001, 47.001, 47.002],
  lon: [11, 11, 11, 11.002],
  ele: [100, 110, 110, 90],
  t: [0, 5000, 65_000, 70_000],
  dist: [0, 10, 10, 20],
};

describe('positionAtTime', () => {
  it('interpolates linearly between the neighbouring points', () => {
    const p = positionAtTime(tr, 2500);
    expect(p.lat).toBeCloseTo(47.0005, 9);
    expect(p.lon).toBe(11);
    expect(p.ele).toBeCloseTo(105, 9);
    expect(p.d).toBeCloseTo(5, 9);
    expect(p.t).toBe(2500);
    expect(p.out).toBeNull();
  });

  it('hits stored points exactly, including the last one', () => {
    expect(positionAtTime(tr, 65_000)).toMatchObject({ lat: 47.001, ele: 110, d: 10 });
    const last = positionAtTime(tr, 70_000);
    expect(last).toMatchObject({ d: 20, out: null });
    expect(last.lat).toBeCloseTo(47.002, 9);
    expect(last.lon).toBeCloseTo(11.002, 9);
  });

  it('clamps to the start before the track', () => {
    expect(positionAtTime(tr, -1000)).toMatchObject({ lat: 47, t: 0, d: 0, out: 'before' });
  });

  it('clamps to the end after the track', () => {
    const p = positionAtTime(tr, 99_000);
    expect(p).toMatchObject({ t: 70_000, d: 20, out: 'after' });
    expect(p.lat).toBeCloseTo(47.002, 9);
  });

  it('copes with two points sharing a timestamp', () => {
    const dup: TrackSeries = { ...tr, t: [0, 5000, 5000, 70_000] };
    expect(positionAtTime(dup, 5000).d).toBe(10);
  });
});

describe('timeAtDistance', () => {
  it('interpolates time along distance', () => {
    expect(timeAtDistance(tr, 5)).toBeCloseTo(2500, 9);
    expect(timeAtDistance(tr, 15)).toBeCloseTo(67_500, 9);
  });

  it('returns the arrival time at a stop', () => {
    expect(timeAtDistance(tr, 10)).toBe(5000);
  });

  it('clamps to start and end', () => {
    expect(timeAtDistance(tr, 0)).toBe(0);
    expect(timeAtDistance(tr, -5)).toBe(0);
    expect(timeAtDistance(tr, 1e9)).toBe(70_000);
  });
});
