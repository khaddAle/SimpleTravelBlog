import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const imageSchema = new Schema(
  {
    shortId: { type: String, required: true, unique: true },
    originalFilename: { type: String, required: true },
    mime: { type: String, required: true },
    displayKey: { type: String, required: true },
    thumbKey: { type: String, required: true },
    width: { type: Number, required: true, min: 1 },
    height: { type: Number, required: true, min: 1 },
    // EXIF capture date, extracted at upload before metadata is stripped. Absent
    // for images uploaded before this was retained (and for inputs with no EXIF);
    // those sort behind dated ones. Indexed for the capture-date sort modes.
    takenAt: { type: Date, index: true },
    uploaderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export type ImageDoc = InferSchemaType<typeof imageSchema>;

export const Image: Model<ImageDoc> =
  (mongoose.models.Image as Model<ImageDoc>) ??
  mongoose.model<ImageDoc>('Image', imageSchema);
