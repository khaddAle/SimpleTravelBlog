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

describe('suggestOffset', () => {
  it('guesses from longitude plus northern summer time without timed photos', () => {
    // Skjervøy, September: 20.7° → UTC+1, plus DST.
    expect(suggestOffset([at(69.8, 20.7)], [{ takenAt: null }])).toEqual({
      offset: 120,
      reason: 'Längengrad + Sommerzeit',
    });
  });

  it('adds no summer time in the southern hemisphere', () => {
    const jan = Date.UTC(2026, 0, 10, 0, 0);
    expect(suggestOffset([at(-33.9, 151.2, jan, jan + 3600_000)], [])).toEqual({
      offset: 600,
      reason: 'Längengrad',
    });
  });

  it('adds no summer time in northern winter', () => {
    const dec = Date.UTC(2026, 11, 10, 10, 0);
    expect(suggestOffset([at(47, 11, dec, dec + 3600_000)], []).offset).toBe(60);
  });

  it('picks the offset that puts the most photos inside the tracks', () => {
    const photos = [
      { takenAt: '2026-09-12T12:10:00' },
      { takenAt: '2026-09-12T12:20:00' },
      { takenAt: '2026-09-12T20:00:00' },
      { takenAt: null },
    ];
    // Both hits work for UTC+1:30 and UTC+2; the longitude guess (UTC+2) breaks the tie.
    expect(suggestOffset([at(69.8, 20.7)], photos)).toEqual({ offset: 120, reason: '2/3 Fotos im Track' });
  });

  it('breaks ties towards the longitude guess', () => {
    // Winter at 11° E → guess UTC+1; hits work for UTC+1:30 and UTC+2 → 90 is nearer.
    const dec10 = Date.UTC(2026, 11, 12, 10, 0);
    const photos = [{ takenAt: '2026-12-12T12:10:00' }, { takenAt: '2026-12-12T12:20:00' }];
    expect(suggestOffset([at(47, 11, dec10, dec10 + 3600_000)], photos)).toEqual({
      offset: 90,
      reason: '2/2 Fotos im Track',
    });
  });

  it('considers the time span of all tracks', () => {
    const photos = [{ takenAt: '2026-09-12T13:30:00' }];
    const late = at(69.9, 20.8, H10, Date.UTC(2026, 8, 12, 12, 0));
    expect(suggestOffset([at(69.8, 20.7), late], photos)).toEqual({ offset: 120, reason: '1/1 Fotos im Track' });
  });
});
