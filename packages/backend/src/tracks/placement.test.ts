import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import { useTestDatabase } from '../../tests/db.js';
import { Image } from '../db/models/Image.js';
import { Track } from '../db/models/Track.js';
import { loadPlacement, photoIdsOfPost } from './placement.js';

const T0 = Date.UTC(2026, 8, 12, 8, 0);
const uploaderId = new mongoose.Types.ObjectId();

/** A 10-minute track due north, stored as two rows. */
async function seedTrack(shortId: string, lat: number): Promise<void> {
  await Track.create({
    shortId,
    originalFilename: `${shortId}.gpx`,
    stats: {
      distance: 1000,
      ascent: 0,
      descent: 0,
      movingMs: 600_000,
      start: T0,
      end: T0 + 600_000,
      minEle: 0,
      maxEle: 0,
    },
    moving: [[T0, T0 + 600_000]],
    points: [
      [lat, 20.7, 0, 0, 0],
      [lat + 0.009, 20.7, 0, 600, 1000],
    ],
    gpxKey: `tracks/${shortId}.gpx`,
    uploaderId,
  });
}

/** takenAt is naive local time stored as if UTC, like readTakenAt does. */
async function seedImage(shortId: string, file: string, takenAt?: string): Promise<void> {
  await Image.create({
    shortId,
    originalFilename: file,
    mime: 'image/jpeg',
    displayKey: `posts/${shortId}-display.webp`,
    thumbKey: `posts/${shortId}-thumb.webp`,
    width: 10,
    height: 10,
    ...(takenAt ? { takenAt: new Date(`${takenAt}Z`) } : {}),
    uploaderId,
  });
}

describe('photoIdsOfPost', () => {
  it('collects image and gallery blocks, then the cover, without duplicates', () => {
    const blocks = [
      { type: 'image' as const, imageId: 'a' },
      { type: 'paragraph' as const, text: 'x' },
      { type: 'gallery' as const, imageIds: ['b', 'a', 'c'] },
    ];
    expect(photoIdsOfPost(blocks, 'd')).toEqual(['a', 'b', 'c', 'd']);
    expect(photoIdsOfPost(blocks, 'b')).toEqual(['a', 'b', 'c']);
    expect(photoIdsOfPost([], null)).toEqual([]);
  });
});

describe('loadPlacement', () => {
  useTestDatabase();

  it('places photos on their track at the post offset', async () => {
    await seedTrack('trk001', 69.8);
    await seedTrack('trk002', 70);
    await seedImage('img1', 'IMG_1.jpg', '2026-09-12T10:05:00'); // 08:05Z → on track 0
    await seedImage('img2', 'PXL_1.jpg', '2026-09-12T10:02:00'); // 08:02Z → on track 1
    await seedImage('img3', 'IMG_2.jpg', '2026-09-12T09:00:00'); // 07:00Z → before
    await seedImage('img4', 'IMG_3.jpg'); // no time → end

    const res = await loadPlacement({
      refs: [
        { trackId: 'trk001', label: 'Anna', prefix: 'IMG_' },
        { trackId: 'trk002', label: 'Ben', prefix: 'PXL_' },
      ],
      utcOffsetMinutes: 120,
      imageIds: ['img1', 'img2', 'img3', 'img4', 'missing'],
    });

    expect(res.utcOffsetMinutes).toBe(120);
    expect(res.tracks.map((t) => [t.ref.label, t.doc.shortId])).toEqual([
      ['Anna', 'trk001'],
      ['Ben', 'trk002'],
    ]);
    expect(res.photos).toEqual([
      { imageId: 'img3', track: 0, t: T0, where: 'before' },
      { imageId: 'img2', track: 1, t: T0 + 120_000, where: 'on' },
      { imageId: 'img1', track: 0, t: T0 + 300_000, where: 'on' },
      { imageId: 'img4', track: 0, t: T0 + 600_000, where: 'notime' },
    ]);
  });

  it('falls back to the suggested offset and reports it', async () => {
    await seedTrack('trk001', 69.8);
    await seedImage('img1', 'IMG_1.jpg', '2026-09-12T10:05:00');
    const res = await loadPlacement({
      refs: [{ trackId: 'trk001', label: 'Anna' }],
      imageIds: ['img1'],
    });
    expect(res.suggestion).toEqual({ offset: 120, reason: 'Längengrad + Sommerzeit' });
    expect(res.utcOffsetMinutes).toBe(120);
    expect(res.photos[0]).toMatchObject({ where: 'on', t: T0 + 300_000 });
  });

  it('skips tracks that no longer exist', async () => {
    await seedTrack('trk002', 70);
    const res = await loadPlacement({
      refs: [
        { trackId: 'gone01', label: 'Anna' },
        { trackId: 'trk002', label: 'Ben' },
      ],
      imageIds: [],
    });
    expect(res.tracks.map((t) => t.ref.label)).toEqual(['Ben']);
  });

  it('returns nothing to place without tracks', async () => {
    const res = await loadPlacement({ refs: [{ trackId: 'gone01', label: 'A' }], imageIds: [] });
    expect(res.tracks).toEqual([]);
    expect(res.photos).toEqual([]);
    expect(res.suggestion).toBeNull();
  });
});
