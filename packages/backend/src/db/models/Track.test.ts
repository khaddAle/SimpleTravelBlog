import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import { useTestDatabase } from '../../../tests/db.js';
import { Track } from './Track.js';

const valid = () => ({
  shortId: 'trk001',
  originalFilename: 'lauf.gpx',
  name: 'Morgenlauf',
  stats: {
    distance: 19520,
    ascent: 1025,
    descent: 1018,
    movingMs: 9_648_000,
    start: Date.UTC(2026, 8, 12, 8, 0),
    end: Date.UTC(2026, 8, 12, 12, 0),
    minEle: 2,
    maxEle: 820,
  },
  moving: [[Date.UTC(2026, 8, 12, 8, 0), Date.UTC(2026, 8, 12, 12, 0)]],
  points: [
    [69.8, 20.7, 10.5, 0, 0],
    [69.81, 20.71, 12, 30, 1234.5],
  ],
  gpxKey: 'tracks/trk001.gpx',
  uploaderId: new mongoose.Types.ObjectId(),
});

describe('Track model', () => {
  useTestDatabase();

  it('stores stats, moving intervals and point rows', async () => {
    const created = await Track.create(valid());
    const found = await Track.findOne({ shortId: 'trk001' }).lean();
    expect(found?.stats).toEqual(valid().stats);
    expect(found?.moving).toEqual(valid().moving);
    expect(found?.points).toEqual(valid().points);
    expect(created.createdAt).toBeInstanceOf(Date);
  });

  it('defaults the name to an empty string', async () => {
    const { name: _omit, ...withoutName } = valid();
    expect((await Track.create(withoutName)).name).toBe('');
  });

  it('requires an uploader and the GPX key', async () => {
    const { uploaderId: _u, ...withoutUploader } = valid();
    await expect(Track.create(withoutUploader)).rejects.toThrow();
    const { gpxKey: _g, ...withoutKey } = valid();
    await expect(Track.create(withoutKey)).rejects.toThrow();
  });

  it('enforces a unique shortId', async () => {
    await Track.init();
    await Track.create(valid());
    await expect(Track.create(valid())).rejects.toThrow(/duplicate key/i);
  });
});
