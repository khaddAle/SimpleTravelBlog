import { describe, it, expect } from 'vitest';
import { buildTrackModel } from './model.js';
import { profileGeometry, PROFILE_PAD } from './profile.js';
import { oneTrack, twoTracks } from '../../../tests/trackData.js';

describe('profileGeometry', () => {
  const model = buildTrackModel(twoTracks());
  const g = profileGeometry(model, 400, 104)!;

  it('maps distance to x across the full width and height to y inside the padding', () => {
    expect(g.x(0)).toBe(0);
    expect(g.x(model.maxDist)).toBe(400);
    expect(g.y(model.maxEle)).toBeCloseTo(PROFILE_PAD.top, 9);
    expect(g.y(model.minEle)).toBeCloseTo(104 - PROFILE_PAD.bottom, 9);
    expect(g.baseY).toBe(104 - PROFILE_PAD.bottom);
  });

  it('draws one closed, semi-transparent area per track in its colour', () => {
    expect(g.areas).toHaveLength(2);
    expect(g.areas[0]).toMatchObject({ color: '#3f6699', fillOpacity: 0.16 });
    expect(g.areas[1]!.color).toBe('#c0612b');
    expect(g.areas[0]!.d.startsWith(`M0 ${g.baseY}`)).toBe(true);
    expect(g.areas[0]!.d.endsWith('Z')).toBe(true);
    const single = profileGeometry(buildTrackModel(oneTrack()), 400, 104)!;
    expect(single.areas[0]!.fillOpacity).toBe(0.2);
  });

  it('labels heights and kilometres in German', () => {
    expect(g.eleTicks.map((t) => t.label)).toEqual(['1.000 m', '1.100 m', '1.200 m']);
    expect(g.kmTicks.map((t) => t.label)).toEqual(['1 km', '2 km']);
    expect(g.kmTicks[0]!.x).toBeCloseTo(160, 9);
  });

  it('draws nothing without a width', () => {
    expect(profileGeometry(model, 0, 104)).toBeNull();
  });
});
