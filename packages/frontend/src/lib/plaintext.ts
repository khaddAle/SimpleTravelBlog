import type { Block } from '@stb/shared';

/**
 * Client-side mirror of the backend `blockToPlaintext` extractor. Used for live
 * editor previews (e.g. a reading-time / word-count hint) without a round-trip.
 * Kept deliberately identical to `packages/backend/src/blocks/plaintext.ts`;
 * the backend copy remains authoritative for the persisted search index.
 */
export function blockToPlaintext(block: Block): string {
  switch (block.type) {
    case 'title':
    case 'subtitle':
    case 'paragraph':
      return block.text;
    case 'image':
      return block.caption ?? '';
    case 'quote':
      return block.source ? `${block.text} ${block.source}` : block.text;
    case 'gallery':
    case 'divider':
      return '';
  }
}

/** Collapse a post's blocks to a single whitespace-normalised plaintext string. */
export function blocksToPlaintext(blocks: Block[]): string {
  return blocks
    .map(blockToPlaintext)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}
