import type { Block } from '@stb/shared';

/**
 * The first image referenced by a post's blocks, used as a card/hero thumbnail.
 * Returns the first image block's id, or the first id of the first gallery.
 */
export function coverImageId(blocks: Block[]): string | undefined {
  for (const block of blocks) {
    if (block.type === 'image') return block.imageId;
    if (block.type === 'gallery') return block.imageIds[0];
  }
  return undefined;
}
