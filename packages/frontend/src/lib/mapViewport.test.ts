import { describe, it, expect } from 'vitest';
import { visiblePoints, spreadOverlaps, type ViewportBounds } from './mapViewport.js';

/** A rectangular fake of Leaflet's bounds for testing the viewport filter. */
function rect(south: number, west: number, north: number, east: number): ViewportBounds {
  return {
    contains: ([lat, lng]) => lat >= south && lat <= north && lng >= west && lng <= east,
  };
}

const pts = [
  { id: 'a', lat: 47, lng: 11 },
  { id: 'b', lat: 54, lng: 8 },
  { id: 'c', lat: 40, lng: 3 },
];

describe('visiblePoints', () => {
  it('keeps only the points inside the bounds', () => {
    const inside = visiblePoints(pts, rect(45, 0, 60, 15));
    expect(inside.map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('returns nothing when the viewport contains no point', () => {
    expect(visiblePoints(pts, rect(0, 0, 10, 10))).toEqual([]);
  });

  it('preserves input order', () => {
    const inside = visiblePoints(pts, rect(0, 0, 90, 90));
    expect(inside.map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('spreadOverlaps', () => {
  it('leaves a unique location untouched', () => {
    const out = spreadOverlaps([{ id: 'a', lat: 47, lng: 11 }]);
    expect(out[0]).toEqual({ id: 'a', lat: 47, lng: 11 });
  });

  it('nudges later posts that share the exact same coordinates apart', () => {
    const out = spreadOverlaps([
      { id: 'a', lat: 47, lng: 11 },
      { id: 'b', lat: 47, lng: 11 },
      { id: 'c', lat: 47, lng: 11 },
    ]);
    // The first keeps the spot; the others move to distinct positions.
    expect(out[0]).toEqual({ id: 'a', lat: 47, lng: 11 });
    expect(out[1]!.lat === 47 && out[1]!.lng === 11).toBe(false);
    expect(out[2]!.lat === 47 && out[2]!.lng === 11).toBe(false);
    const key = (p: { lat: number; lng: number }) => `${p.lat},${p.lng}`;
    expect(new Set(out.map(key)).size).toBe(3);
  });

  it('is deterministic across calls', () => {
    const input = [
      { id: 'a', lat: 1, lng: 1 },
      { id: 'b', lat: 1, lng: 1 },
    ];
    expect(spreadOverlaps(input)).toEqual(spreadOverlaps(input));
  });
});
