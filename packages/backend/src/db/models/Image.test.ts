import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import { useTestDatabase } from '../../../tests/db.js';
import { Image } from './Image.js';

const valid = () => ({
  shortId: 'img001',
  originalFilename: 'gipfel.jpg',
  mime: 'image/jpeg',
  displayKey: 'posts/img001-display.webp',
  thumbKey: 'posts/img001-thumb.webp',
  width: 1600,
  height: 1067,
  uploaderId: new mongoose.Types.ObjectId(),
});

describe('Image model', () => {
  useTestDatabase();

  it('creates an image asset with both webp keys', async () => {
    const img = await Image.create(valid());
    expect(img.displayKey).toMatch(/-display\.webp$/);
    expect(img.thumbKey).toMatch(/-thumb\.webp$/);
    expect(img.createdAt).toBeInstanceOf(Date);
  });

  it('requires positive dimensions', async () => {
    await expect(Image.create({ ...valid(), width: 0 })).rejects.toThrow();
  });

  it('requires an uploader', async () => {
    const { uploaderId: _omit, ...withoutUploader } = valid();
    await expect(Image.create(withoutUploader)).rejects.toThrow();
  });

  it('enforces a unique shortId', async () => {
    await Image.init();
    await Image.create(valid());
    await expect(Image.create(valid())).rejects.toThrow(/duplicate key/i);
  });
});
