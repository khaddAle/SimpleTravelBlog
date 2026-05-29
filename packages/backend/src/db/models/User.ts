import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const userSchema = new Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      minlength: 1,
      maxlength: 64,
    },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['admin', 'editor'], required: true },
    deactivatedAt: { type: Date },
  },
  { timestamps: true },
);

export type UserDoc = InferSchemaType<typeof userSchema>;

export const User: Model<UserDoc> =
  (mongoose.models.User as Model<UserDoc>) ??
  mongoose.model<UserDoc>('User', userSchema);
