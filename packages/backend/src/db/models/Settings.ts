import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

/**
 * Singleton site settings. There is exactly one document, pinned to
 * `_id: 'site'`, so reads/writes target a known id.
 */
export const SETTINGS_ID = 'site';

const settingsSchema = new Schema(
  {
    _id: { type: String, default: SETTINGS_ID },
    siteTitle: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
    accentColor: {
      type: String,
      required: true,
      match: /^#[0-9a-fA-F]{6}$/,
    },
    logoKey: { type: String },
    // Optional blog background images (image shortIds). Rendering is deferred;
    // these count toward the image refcount / delete-guard.
    backgroundImageIds: { type: [String], default: [] },
  },
  { timestamps: true, _id: false },
);

export type SettingsDoc = InferSchemaType<typeof settingsSchema>;

export const Settings: Model<SettingsDoc> =
  (mongoose.models.Settings as Model<SettingsDoc>) ??
  mongoose.model<SettingsDoc>('Settings', settingsSchema);
