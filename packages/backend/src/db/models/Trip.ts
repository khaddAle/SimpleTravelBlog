import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const tripSchema = new Schema(
  {
    shortId: { type: String, required: true, unique: true },
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 1,
      maxlength: 120,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export type TripDoc = InferSchemaType<typeof tripSchema>;

export const Trip: Model<TripDoc> =
  (mongoose.models.Trip as Model<TripDoc>) ??
  mongoose.model<TripDoc>('Trip', tripSchema);
