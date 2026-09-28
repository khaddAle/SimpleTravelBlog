import mongoose, { Schema, type Model, type Types } from 'mongoose';
import type { TimeInterval, TrackRow, TrackStats } from '@stb/shared';

const statsSchema = new Schema<TrackStats>(
  {
    distance: { type: Number, required: true },
    ascent: { type: Number, required: true },
    descent: { type: Number, required: true },
    movingMs: { type: Number, required: true },
    // Epoch ms (UTC), like the stored point rows' time base.
    start: { type: Number, required: true },
    end: { type: Number, required: true },
    minEle: { type: Number, required: true },
    maxEle: { type: Number, required: true },
  },
  { _id: false },
);

/**
 * An uploaded GPX track. Holds the thinned point rows
 * ([lat, lon, smoothed ele, s from start, cumulative m]; ~1–2k rows) plus
 * stats and moving intervals of the full track. The raw GPX stays in the
 * bucket under `gpxKey` so tracks can be reprocessed if the constants change.
 */
export interface TrackDoc {
  shortId: string;
  originalFilename: string;
  name: string;
  stats: TrackStats;
  moving: TimeInterval[];
  points: TrackRow[];
  gpxKey: string;
  uploaderId: Types.ObjectId;
  createdAt: Date;
}

// Explicit document type: mongoose infers nested `[[Number]]` arrays as
// subdocument arrays, which the row/interval tuples are not.
const trackSchema = new Schema<TrackDoc>(
  {
    shortId: { type: String, required: true, unique: true },
    originalFilename: { type: String, required: true },
    name: { type: String, default: '' },
    stats: { type: statsSchema, required: true },
    moving: { type: [[Number]], default: [] },
    points: { type: [[Number]], required: true },
    gpxKey: { type: String, required: true },
    uploaderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const Track: Model<TrackDoc> =
  (mongoose.models.Track as Model<TrackDoc>) ?? mongoose.model<TrackDoc>('Track', trackSchema);
