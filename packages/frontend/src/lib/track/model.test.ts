import { describe, it, expect } from 'vitest';
import { buildTrackModel } from './model.js';
import { oneTrack, T0, twoTracks } from '../../../tests/trackData.js';

describe('buildTrackModel', () => {
  it('turns stored rows into series with absolute times, colours and lat/lngs', () => {
    const m = buildTrackModel(twoTracks());
    expect(m.tracks.map((t) => [t.label, t.color])).toEqual([
      ['Anna', '#3f6699'],
      ['Ben', '#c0612b'],
    ]);
    const anna = m.tracks[0]!;
    expect(anna.series.t).toEqual([T0, T0 + 1_800_000, T0 + 3_600_000]);
    expect(anna.series.dist).toEqual([0, 1112, 2300]);
    expect(anna.latlngs[1]).toEqual([47.01, 11.0]);
    expect(anna.stats.ascent).toBe(200);
    expect(m.utcOffsetMinutes).toBe(120);
  });

  it('spans the longest distance and pads the height range', () => {
    const m = buildTrackModel(twoTracks());
    expect(m.maxDist).toBe(2500);
    // Range 1000–1250 m, margin max(20, 12 %) = 30 m below and 18 m above.
    expect(m.minEle).toBeCloseTo(970, 9);
    expect(m.maxEle).toBeCloseTo(1268, 9);
  });

  it('bounds all tracks', () => {
    expect(buildTrackModel(twoTracks()).bounds).toEqual([
      [46.99, 10.99],
      [47.03, 11.02],
    ]);
    expect(buildTrackModel(oneTrack()).bounds).toEqual([
      [47.0, 11.0],
      [47.02, 11.01],
    ]);
  });

  it('keeps a minimum height margin on flat tracks', () => {
    const data = oneTrack();
    data.tracks[0]!.stats = { ...data.tracks[0]!.stats, minEle: 5, maxEle: 5 };
    const m = buildTrackModel(data);
    expect(m.minEle).toBe(-15);
    expect(m.maxEle).toBe(17);
  });
});
