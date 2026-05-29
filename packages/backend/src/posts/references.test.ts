import { describe, it, expect } from 'vitest';
import type { Block } from '@stb/shared';
import { collectImageIds } from './references.js';

describe('collectImageIds', () => {
  it('collects ids from image and gallery blocks, skipping the rest', () => {
    const blocks: Block[] = [
      { type: 'title', text: 'T' },
      { type: 'image', imageId: 'img1', caption: 'a' },
      { type: 'paragraph', text: 'p' },
      { type: 'gallery', imageIds: ['img2', 'img3'] },
      { type: 'divider' },
    ];
    expect(collectImageIds(blocks)).toEqual(['img1', 'img2', 'img3']);
  });

  it('returns an empty list when no media is referenced', () => {
    expect(collectImageIds([{ type: 'paragraph', text: 'x' }])).toEqual([]);
  });
});
