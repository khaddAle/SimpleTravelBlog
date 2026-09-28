import { describe, it, expect } from 'vitest';
import { buildTrackModel } from './model.js';
import { photoGroups } from './photos.js';
import { T0, twoTracks } from '../../../tests/trackData.js';

describe('photoGroups', () => {
  it('puts photos at the same spot of the same track into one group', () => {
    const data = twoTracks();
    data.photos = [
      { imageId: 'a', track: 0, t: T0 + 1_800_000, where: 'on' },
      { imageId: 'b', track: 1, t: T0 + 1_800_000, where: 'on' },
      { imageId: 'c', track: 0, t: T0 + 3_600_000, where: 'after' },
      { imageId: 'd', track: 0, t: T0 + 3_600_000, where: 'notime' },
    ];
    const groups = photoGroups(buildTrackModel(data));
    expect(groups.map((g) => g.photos.map((p) => p.imageId))).toEqual([['a'], ['b'], ['c', 'd']]);
    expect(groups.map((g) => g.track)).toEqual([0, 1, 0]);
    // Anna is at her second point after 30 min.
    expect(groups[0]!.pos).toMatchObject({ lat: 47.01, lon: 11.0, ele: 1200, d: 1112 });
    expect(groups[2]!.pos).toMatchObject({ lat: 47.02, lon: 11.01 });
    expect(new Set(groups.map((g) => g.key)).size).toBe(3);
  });

  it('keeps the index of each photo in the replay order', () => {
    const data = twoTracks();
    data.photos = [
      { imageId: 'a', track: 0, t: T0, where: 'before' },
      { imageId: 'b', track: 0, t: T0 + 1_800_000, where: 'on' },
    ];
    const groups = photoGroups(buildTrackModel(data));
    expect(groups.flatMap((g) => g.photos.map((p) => p.index))).toEqual([0, 1]);
  });

  it('is empty without photos', () => {
    const data = twoTracks();
    data.photos = [];
    expect(photoGroups(buildTrackModel(data))).toEqual([]);
  });
});
