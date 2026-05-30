import type { Block } from '@stb/shared';

/**
 * Extract the searchable plain text of a single block. Image ids and gallery
 * ids are opaque and not searchable; only human-authored text (titles,
 * paragraphs, captions, quotes + their source) is indexed.
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
      return block.caption ?? '';
    case 'divider':
      return '';
  }
}

/**
 * Build the denormalized `searchText` for a post from its blocks. Whitespace is
 * collapsed to single spaces so the Mongo german text index sees clean tokens.
 */
export function blocksToSearchText(blocks: Block[]): string {
  return blocks
    .map(blockToPlaintext)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}
