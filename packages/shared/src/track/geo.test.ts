import { describe, it, expect } from 'vitest';
import { haversine, R_EARTH } from './geo.js';

describe('haversine', () => {
  it('is zero for the same point', () => {
    expect(haversine({ lat: 47.4, lon: 11 }, { lat: 47.4, lon: 11 })).toBe(0);
  });

  it('measures an arc along a meridian exactly', () => {
    const d = haversine({ lat: 47, lon: 11 }, { lat: 47.001, lon: 11 });
    expect(d).toBeCloseTo((R_EARTH * Math.PI * 0.001) / 180, 6);
  });

  it('measures one degree of longitude on the equator', () => {
    expect(haversine({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeCloseTo(111_195.08, 1);
  });

  it('is symmetric', () => {
    const a = { lat: 69.8, lon: 20.7 };
    const b = { lat: 69.81, lon: 20.72 };
    expect(haversine(a, b)).toBeCloseTo(haversine(b, a), 9);
  });
});
