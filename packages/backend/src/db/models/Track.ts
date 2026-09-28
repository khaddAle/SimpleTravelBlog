import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const trackSchema = new Schema({ shortId: { type: String } });

export type TrackDoc = InferSchemaType<typeof trackSchema>;

export const Track: Model<TrackDoc> =
  (mongoose.models.Track as Model<TrackDoc>) ?? mongoose.model<TrackDoc>('Track', trackSchema);
