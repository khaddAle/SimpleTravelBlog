import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const statsSchema = new Schema(
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
const trackSchema = new Schema(
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

export type TrackDoc = InferSchemaType<typeof trackSchema>;

export const Track: Model<TrackDoc> =
  (mongoose.models.Track as Model<TrackDoc>) ?? mongoose.model<TrackDoc>('Track', trackSchema);
