import { describe, it, expect } from 'vitest';
import {
  blockSchema,
  blockArraySchema,
  type Block,
} from './blocks.js';

describe('blockSchema', () => {
  const valid: Block[] = [
    { type: 'title', text: 'Auf dem Berg' },
    { type: 'subtitle', text: 'Tag 3' },
    { type: 'paragraph', text: 'Der Aufstieg war steil.' },
    { type: 'image', imageId: 'a3kf2x', caption: 'Gipfel' },
    { type: 'image', imageId: 'a3kf2x' },
    { type: 'gallery', imageIds: ['a', 'b', 'c'] },
    { type: 'quote', text: 'Berge rufen.', source: 'Muir' },
    { type: 'quote', text: 'Berge rufen.' },
    { type: 'divider' },
  ];

  it('round-trips every valid block type', () => {
    for (const block of valid) {
      const parsed = blockSchema.parse(block);
      expect(parsed).toEqual(block);
    }
  });

  it('rejects an unknown block type', () => {
    expect(() => blockSchema.parse({ type: 'video', url: 'x' })).toThrow();
  });

  it('rejects empty required text', () => {
    expect(() => blockSchema.parse({ type: 'title', text: '' })).toThrow();
    expect(() => blockSchema.parse({ type: 'paragraph', text: '' })).toThrow();
  });

  it('enforces max lengths', () => {
    expect(() =>
      blockSchema.parse({ type: 'title', text: 'x'.repeat(201) }),
    ).toThrow();
    expect(() =>
      blockSchema.parse({ type: 'paragraph', text: 'x'.repeat(10001) }),
    ).toThrow();
  });

  it('requires at least one image id and at most 24 in a gallery', () => {
    expect(() => blockSchema.parse({ type: 'gallery', imageIds: [] })).toThrow();
    expect(() =>
      blockSchema.parse({
        type: 'gallery',
        imageIds: Array.from({ length: 25 }, (_, i) => `i${i}`),
      }),
    ).toThrow();
  });

  it('rejects an image block without an imageId', () => {
    expect(() => blockSchema.parse({ type: 'image' })).toThrow();
    expect(() => blockSchema.parse({ type: 'image', imageId: '' })).toThrow();
  });

  it('strips nothing and preserves order in a block array', () => {
    const arr = blockArraySchema.parse(valid);
    expect(arr).toHaveLength(valid.length);
    expect(arr[0]).toEqual(valid[0]);
  });

  it('rejects a non-array for a block array', () => {
    expect(() => blockArraySchema.parse({})).toThrow();
  });
});
