import { describe, it, expect } from 'vitest';
import type { TrackSeries } from './build.js';
import { suggestOffset } from './timezone.js';

const H10 = Date.UTC(2026, 8, 12, 10, 0);
const H11 = Date.UTC(2026, 8, 12, 11, 0);

const at = (lat: number, lon: number, start = H10, end = H11): TrackSeries => ({
  lat: [lat, lat],
  lon: [lon, lon],
  ele: [0, 0],
  t: [start, end],
  dist: [0, 0],
});

// Only the location counts: photo times never move the suggestion (they used
// to, and pulled Skjervøy to UTC+1:30).
describe('suggestOffset', () => {
  it('guesses from longitude plus northern summer time', () => {
    // Skjervøy, September: 20.7° → UTC+1, plus DST.
    expect(suggestOffset([at(69.8, 20.7)])).toEqual({
      offset: 120,
      reason: 'Längengrad + Sommerzeit',
    });
  });

  it('adds no summer time in the southern hemisphere', () => {
    const jan = Date.UTC(2026, 0, 10, 0, 0);
    expect(suggestOffset([at(-33.9, 151.2, jan, jan + 3600_000)])).toEqual({
      offset: 600,
      reason: 'Längengrad',
    });
  });

  it('adds no summer time in northern winter', () => {
    const dec = Date.UTC(2026, 11, 10, 10, 0);
    expect(suggestOffset([at(47, 11, dec, dec + 3600_000)]).offset).toBe(60);
  });

  it('uses whole hours west of Greenwich too', () => {
    const jan = Date.UTC(2026, 0, 10, 12, 0);
    expect(suggestOffset([at(40.7, -74, jan, jan + 3600_000)]).offset).toBe(-300);
  });

  it('uses the first track', () => {
    expect(suggestOffset([at(69.8, 20.7), at(47, -74)]).offset).toBe(120);
  });
});
