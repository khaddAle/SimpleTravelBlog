import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';
import { blockArraySchema, type Block } from '@stb/shared';
import { blocksToSearchText } from '../../blocks/plaintext.js';

const postSchema = new Schema(
  {
    shortId: { type: String, required: true, unique: true },
    title: { type: String, required: true, trim: true, minlength: 1, maxlength: 200 },
    subtitle: { type: String, trim: true, maxlength: 300 },
    blocks: { type: [Schema.Types.Mixed], default: [] },
    postDate: { type: Date, required: true },
    country: { type: String, required: true, match: /^[A-Z]{2}$/ },
    placeName: { type: String, required: true, trim: true, maxlength: 200 },
    lat: { type: Number, required: true, min: -90, max: 90 },
    lng: { type: Number, required: true, min: -180, max: 180 },
    tripId: { type: Schema.Types.ObjectId, ref: 'Trip' },
    // Optional per-post cover image (image shortId). Counts toward the image
    // refcount / delete-guard; falls back to the first block thumbnail when unset.
    coverImageId: { type: String },
    status: { type: String, enum: ['draft', 'published'], required: true, default: 'draft' },
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    publishedAt: { type: Date },
    // Denormalized, german-analyzed search field; rebuilt on every save.
    searchText: { type: String, default: '' },
  },
  { timestamps: true },
);

// Validate the block list against the shared discriminated union. Throwing here
// surfaces as a mongoose ValidationError, so malformed blocks never persist.
postSchema.pre('validate', function rejectInvalidBlocks() {
  const result = blockArraySchema.safeParse(this.blocks);
  if (!result.success) {
    this.invalidate('blocks', result.error.issues[0]?.message ?? 'invalid blocks');
  }
});

postSchema.pre('save', function denormalize() {
  const blocks = (this.blocks ?? []) as Block[];
  const parts = [this.title, this.subtitle ?? '', this.placeName, blocksToSearchText(blocks)];
  this.searchText = parts.join(' ').replace(/\s+/g, ' ').trim();

  // Stamp publishedAt the first time a post becomes published.
  if (this.status === 'published' && !this.publishedAt) {
    this.publishedAt = new Date();
  }
});

postSchema.index({ postDate: -1 });
postSchema.index({ country: 1 });
postSchema.index({ tripId: 1 });
postSchema.index({ searchText: 'text' }, { default_language: 'german' });

export type PostDoc = InferSchemaType<typeof postSchema>;

export const Post: Model<PostDoc> =
  (mongoose.models.Post as Model<PostDoc>) ??
  mongoose.model<PostDoc>('Post', postSchema);
