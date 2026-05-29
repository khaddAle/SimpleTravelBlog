import { describe, it, expect } from 'vitest';
import type { Block } from '@stb/shared';
import { blockToPlaintext, blocksToPlaintext } from './plaintext.js';

describe('blockToPlaintext', () => {
  it('returns the text of text blocks', () => {
    expect(blockToPlaintext({ type: 'title', text: 'Berge' })).toBe('Berge');
    expect(blockToPlaintext({ type: 'subtitle', text: 'Tag 1' })).toBe('Tag 1');
    expect(blockToPlaintext({ type: 'paragraph', text: 'Wir wanderten' })).toBe(
      'Wir wanderten',
    );
  });

  it('returns the caption of an image, or empty when absent', () => {
    expect(blockToPlaintext({ type: 'image', imageId: 'abc123', caption: 'Gipfel' })).toBe(
      'Gipfel',
    );
    expect(blockToPlaintext({ type: 'image', imageId: 'abc123' })).toBe('');
  });

  it('joins a quote with its source when present', () => {
    expect(blockToPlaintext({ type: 'quote', text: 'Reisen bildet', source: 'Oma' })).toBe(
      'Reisen bildet Oma',
    );
    expect(blockToPlaintext({ type: 'quote', text: 'Reisen bildet' })).toBe('Reisen bildet');
  });

  it('returns empty for gallery and divider', () => {
    expect(blockToPlaintext({ type: 'gallery', imageIds: ['a', 'b'] })).toBe('');
    expect(blockToPlaintext({ type: 'divider' })).toBe('');
  });
});

describe('blocksToPlaintext', () => {
  it('joins blocks and collapses whitespace', () => {
    const blocks: Block[] = [
      { type: 'title', text: 'Berge  ' },
      { type: 'divider' },
      { type: 'paragraph', text: '  Tag\neins' },
    ];
    expect(blocksToPlaintext(blocks)).toBe('Berge Tag eins');
  });

  it('is empty for content-free blocks', () => {
    expect(blocksToPlaintext([{ type: 'divider' }, { type: 'gallery', imageIds: ['x'] }])).toBe(
      '',
    );
  });
});
