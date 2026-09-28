import { describe, it, expect } from 'vitest';
import { processGpx } from './process.js';
import { GpxError } from './gpx.js';
import { makeGpx } from '../../tests/gpx.js';

const T0 = Date.UTC(2026, 8, 12, 8, 0);

describe('processGpx', () => {
  const result = processGpx(Buffer.from(makeGpx({ points: 60, name: 'Lauf' })));

  it('returns name, full-track stats and moving intervals', () => {
    expect(result.name).toBe('Lauf');
    // 59 steps of 1e-4° latitude ≈ 11.12 m each.
    expect(result.stats.distance).toBeCloseTo(59 * 11.119, 0);
    expect(result.stats.start).toBe(T0);
    expect(result.stats.end).toBe(T0 + 59 * 5000);
    expect(result.stats.movingMs).toBe(59 * 5000);
    expect(result.stats.ascent).toBeGreaterThan(50);
    expect(result.stats.descent).toBe(0);
    expect(result.moving).toEqual([[T0, T0 + 59 * 5000]]);
  });

  it('stores thinned rows: a straight, steady climb keeps its endpoints', () => {
    expect(result.points).toHaveLength(2);
    const [first, last] = result.points;
    expect(first).toEqual([69.8, 20.7, expect.any(Number), 0, 0]);
    expect(last![3]).toBe(59 * 5);
    expect(last![4]).toBeCloseTo(result.stats.distance, 1);
  });

  it('passes GPX errors through', () => {
    expect(() => processGpx(Buffer.from(makeGpx({ withTime: false })))).toThrow(GpxError);
  });
});
