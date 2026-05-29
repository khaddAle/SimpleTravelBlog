import { describe, it, expect } from 'vitest';
import type { Block } from '@stb/shared';
import { blockToPlaintext, blocksToSearchText } from './plaintext.js';

describe('blockToPlaintext', () => {
  it('extracts text from title/subtitle/paragraph', () => {
    expect(blockToPlaintext({ type: 'title', text: 'Berge' })).toBe('Berge');
    expect(blockToPlaintext({ type: 'subtitle', text: 'Tag 3' })).toBe('Tag 3');
    expect(
      blockToPlaintext({ type: 'paragraph', text: 'Der Aufstieg.' }),
    ).toBe('Der Aufstieg.');
  });

  it('includes a caption but not the image id for image blocks', () => {
    expect(
      blockToPlaintext({ type: 'image', imageId: 'x1', caption: 'Gipfel' }),
    ).toBe('Gipfel');
    expect(blockToPlaintext({ type: 'image', imageId: 'x1' })).toBe('');
  });

  it('includes quote text and source', () => {
    expect(
      blockToPlaintext({ type: 'quote', text: 'Berge rufen', source: 'Muir' }),
    ).toBe('Berge rufen Muir');
    expect(blockToPlaintext({ type: 'quote', text: 'Berge rufen' })).toBe(
      'Berge rufen',
    );
  });

  it('yields empty string for galleries and dividers (no searchable text)', () => {
    expect(blockToPlaintext({ type: 'gallery', imageIds: ['a', 'b'] })).toBe('');
    expect(blockToPlaintext({ type: 'divider' })).toBe('');
  });
});

describe('blocksToSearchText', () => {
  it('joins non-empty block text with single spaces and trims', () => {
    const blocks: Block[] = [
      { type: 'title', text: 'Berge' },
      { type: 'divider' },
      { type: 'paragraph', text: 'steiler Pfad' },
      { type: 'gallery', imageIds: ['a'] },
      { type: 'quote', text: 'rufen', source: 'Muir' },
    ];
    expect(blocksToSearchText(blocks)).toBe('Berge steiler Pfad rufen Muir');
  });

  it('collapses internal whitespace', () => {
    const blocks: Block[] = [
      { type: 'paragraph', text: 'viele   Leerzeichen\n\thier' },
    ];
    expect(blocksToSearchText(blocks)).toBe('viele Leerzeichen hier');
  });

  it('returns empty string for an empty block list', () => {
    expect(blocksToSearchText([])).toBe('');
  });
});
