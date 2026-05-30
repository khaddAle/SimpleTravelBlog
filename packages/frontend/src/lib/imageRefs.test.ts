import { describe, it, expect } from 'vitest';
import type { Block } from '@stb/shared';
import { collectImageIds } from './imageRefs.js';

const blocks: Block[] = [
  { type: 'paragraph', text: 'hi' },
  { type: 'image', imageId: 'img1' },
  { type: 'gallery', imageIds: ['img2', 'img3'] },
  { type: 'gallery', imageIds: ['img3', 'img4'] },
];

describe('collectImageIds', () => {
  it('collects image-block and gallery ids, deduped', () => {
    expect(collectImageIds(blocks).sort()).toEqual(['img1', 'img2', 'img3', 'img4']);
  });

  it('includes the cover image when given', () => {
    expect(collectImageIds([], 'cov1')).toEqual(['cov1']);
  });

  it('ignores non-image blocks and returns [] for none', () => {
    expect(collectImageIds([{ type: 'paragraph', text: 'x' }])).toEqual([]);
  });
});
