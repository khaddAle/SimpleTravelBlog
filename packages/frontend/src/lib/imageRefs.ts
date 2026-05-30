import type { Block } from '@stb/shared';

/**
 * All image ids a post references via its blocks (image + gallery), plus an
 * optional cover. Used to hide already-placed images from the "Nur unbenutzte"
 * picker while the post is still being edited — the server-side orphan filter
 * only sees persisted references, so unsaved selections would otherwise still
 * show up as unused.
 */
export function collectImageIds(blocks: Block[], coverImageId?: string): string[] {
  const ids = new Set<string>();
  for (const block of blocks) {
    if (block.type === 'image') ids.add(block.imageId);
    else if (block.type === 'gallery') for (const id of block.imageIds) ids.add(id);
  }
  if (coverImageId) ids.add(coverImageId);
  return [...ids];
}
