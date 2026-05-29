import { describe, it, expect } from 'vitest';
import type { Block } from '@stb/shared';
import { coverImageId } from './posts.js';

describe('coverImageId', () => {
  it('returns the first image block id', () => {
    const blocks: Block[] = [
      { type: 'paragraph', text: 'x' },
      { type: 'image', imageId: 'img1' },
      { type: 'image', imageId: 'img2' },
    ];
    expect(coverImageId(blocks)).toBe('img1');
  });

  it('falls back to the first gallery image', () => {
    const blocks: Block[] = [
      { type: 'title', text: 'x' },
      { type: 'gallery', imageIds: ['g1', 'g2'] },
    ];
    expect(coverImageId(blocks)).toBe('g1');
  });

  it('returns undefined when there is no image', () => {
    expect(coverImageId([{ type: 'paragraph', text: 'x' }])).toBeUndefined();
  });
});
