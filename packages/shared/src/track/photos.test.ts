import { describe, it, expect } from 'vitest';
import type { TrackSeries } from './build.js';
import { groupPhotos, naiveLocalToUtc, placePhotos, trackForFile } from './photos.js';

const H10 = Date.UTC(2026, 8, 12, 10, 0);
const H11 = Date.UTC(2026, 8, 12, 11, 0);
const H12 = Date.UTC(2026, 8, 12, 12, 0);

// Two straight tracks, 10:00–11:00Z and 10:00–12:00Z.
const a: TrackSeries = { lat: [69.8, 69.81], lon: [20.7, 20.7], ele: [0, 100], t: [H10, H11], dist: [0, 1112] };
const b: TrackSeries = { lat: [69.9, 69.92], lon: [20.8, 20.8], ele: [0, 0], t: [H10, H12], dist: [0, 2224] };

describe('naiveLocalToUtc', () => {
  it('reads a naive local time and subtracts the offset', () => {
    expect(naiveLocalToUtc('2026-09-12T12:30:00', 120)).toBe(Date.UTC(2026, 8, 12, 10, 30));
    expect(naiveLocalToUtc('2026-09-12T12:30:00.000', -90)).toBe(Date.UTC(2026, 8, 12, 14, 0));
  });
});

describe('trackForFile', () => {
  it('matches the first prefix, case-insensitively', () => {
    expect(trackForFile('PXL_20260912.jpg', ['IMG_', 'PXL_'])).toBe(1);
    expect(trackForFile('pxl_20260912.jpg', ['IMG_', 'PXL_'])).toBe(1);
    expect(trackForFile('IMG_0001.jpg', ['IMG_', 'PXL_'])).toBe(0);
  });

  it('falls back to track 0 and skips empty prefixes', () => {
    expect(trackForFile('DSC_1.jpg', ['IMG_', 'PXL_'])).toBe(0);
    expect(trackForFile('DSC_1.jpg', [undefined, ''])).toBe(0);
    expect(trackForFile('PXL_1.jpg', [undefined, 'PXL_'])).toBe(1);
  });
});

describe('placePhotos', () => {
  const placed = placePhotos(
    [
      { file: 'IMG_late.jpg', takenAt: '2026-09-12T15:00:00' },
      { file: 'IMG_mid.jpg', takenAt: '2026-09-12T12:30:00' },
      { file: 'IMG_early.jpg', takenAt: '2026-09-12T11:00:00' },
      { file: 'IMG_none.jpg', takenAt: null },
      { file: 'PXL_mid.jpg', takenAt: '2026-09-12T13:00:00' },
    ],
    [a, b],
    ['IMG_', 'PXL_'],
    120,
  );
  const byFile = (f: string) => placed.find((p) => p.file === f)!;

  it('places a photo on its track at its UTC time', () => {
    const p = byFile('IMG_mid.jpg');
    expect(p).toMatchObject({ track: 0, where: 'on', utc: Date.UTC(2026, 8, 12, 10, 30), t: Date.UTC(2026, 8, 12, 10, 30) });
    expect(p.pos.lat).toBeCloseTo(69.805, 9);
    expect(byFile('PXL_mid.jpg')).toMatchObject({ track: 1, where: 'on', t: H11 });
  });

  it('moves photos before the start to the start', () => {
    expect(byFile('IMG_early.jpg')).toMatchObject({ where: 'before', t: H10, utc: Date.UTC(2026, 8, 12, 9, 0) });
  });

  it('moves photos after the end or without time to the end', () => {
    expect(byFile('IMG_late.jpg')).toMatchObject({ where: 'after', t: H11 });
    expect(byFile('IMG_none.jpg')).toMatchObject({ where: 'notime', t: H11, utc: null });
    expect(byFile('IMG_none.jpg').pos.lat).toBeCloseTo(69.81, 9);
  });

  it('sorts by time, then filename', () => {
    expect(placed.map((p) => p.file)).toEqual([
      'IMG_early.jpg',
      'IMG_mid.jpg',
      'IMG_late.jpg',
      'IMG_none.jpg',
      'PXL_mid.jpg',
    ]);
  });

  it('keeps the caller’s own fields', () => {
    const [p] = placePhotos([{ id: 'x1', file: 'a.jpg', takenAt: null }], [a], [], 0);
    expect(p!.id).toBe('x1');
  });

  it('ignores prefixes of tracks that do not exist', () => {
    const [p] = placePhotos([{ file: 'PXL_1.jpg', takenAt: null }], [a], ['IMG_', 'PXL_'], 0);
    expect(p!.track).toBe(0);
  });

  it('places nothing without tracks', () => {
    expect(placePhotos([{ file: 'a.jpg', takenAt: null }], [], [], 0)).toEqual([]);
  });
});

describe('groupPhotos', () => {
  it('groups photos sharing a spot on the same track', () => {
    const placed = placePhotos(
      [
        { file: 'IMG_1.jpg', takenAt: null },
        { file: 'IMG_2.jpg', takenAt: '2026-09-12T20:00:00' },
        { file: 'IMG_3.jpg', takenAt: '2026-09-12T12:30:00' },
        { file: 'PXL_1.jpg', takenAt: null },
      ],
      [a, b],
      ['IMG_', 'PXL_'],
      120,
    );
    const groups = groupPhotos(placed);
    expect(groups).toHaveLength(3);
    const end = groups.find((g) => g.track === 0 && g.photos.length === 2)!;
    expect(end.photos.map((p) => p.file).sort()).toEqual(['IMG_1.jpg', 'IMG_2.jpg']);
    expect(end.t).toBe(H11);
    expect(end.pos.lat).toBeCloseTo(69.81, 9);
    expect(groups.find((g) => g.track === 1)!.photos).toHaveLength(1);
  });
});
