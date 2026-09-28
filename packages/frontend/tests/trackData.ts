import type { PublicTrackData } from '@stb/shared';

/** 12 Sept 2026, 08:00 UTC. */
export const T0 = Date.UTC(2026, 8, 12, 8, 0);

const statsA = {
  distance: 2300,
  ascent: 200,
  descent: 100,
  movingMs: 3_300_000,
  start: T0,
  end: T0 + 3_600_000,
  minEle: 1000,
  maxEle: 1200,
};
const statsB = {
  distance: 2500,
  ascent: 250,
  descent: 120,
  movingMs: 4_000_000,
  start: T0 + 600_000,
  end: T0 + 4_800_000,
  minEle: 1010,
  maxEle: 1250,
};

/** Two small tracks ("Anna" 2.3 km, "Ben" 2.5 km) and one photo on Anna's track. */
export function twoTracks(): PublicTrackData {
  return {
    utcOffsetMinutes: 120,
    tracks: [
      {
        label: 'Anna',
        stats: statsA,
        moving: [[T0, T0 + 3_600_000]],
        points: [
          [47.0, 11.0, 1000, 0, 0],
          [47.01, 11.0, 1200, 1800, 1112],
          [47.02, 11.01, 1100, 3600, 2300],
        ],
      },
      {
        label: 'Ben',
        stats: statsB,
        moving: [[T0 + 600_000, T0 + 4_800_000]],
        points: [
          [46.99, 10.99, 1010, 0, 0],
          [47.01, 11.0, 1250, 2400, 1300],
          [47.03, 11.02, 1130, 4200, 2500],
        ],
      },
    ],
    photos: [{ imageId: 'img1', track: 0, t: T0 + 1_800_000, where: 'on' }],
  };
}

/** Only Anna's track. */
export function oneTrack(): PublicTrackData {
  const data = twoTracks();
  return { ...data, tracks: [data.tracks[0]!] };
}
