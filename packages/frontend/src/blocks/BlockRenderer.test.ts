import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { Block } from '@stb/shared';
import BlockRenderer from './BlockRenderer.svelte';

describe('BlockRenderer', () => {
  it('dispatches a title block to a heading', () => {
    render(BlockRenderer, { block: { type: 'title', text: 'Berge' } });
    expect(screen.getByRole('heading', { level: 2, name: 'Berge' })).toBeInTheDocument();
  });

  it('dispatches an image block', () => {
    render(BlockRenderer, { block: { type: 'image', imageId: 'img1', caption: 'Cap' } });
    expect(screen.getByRole('img', { name: 'Cap' })).toBeInTheDocument();
  });

  it('dispatches a divider block', () => {
    const { container } = render(BlockRenderer, { block: { type: 'divider' } });
    expect(container.querySelector('hr')).not.toBeNull();
  });

  it('renders every supported block type without error', () => {
    const blocks: Block[] = [
      { type: 'title', text: 'T' },
      { type: 'subtitle', text: 'S' },
      { type: 'paragraph', text: 'P' },
      { type: 'image', imageId: 'i' },
      { type: 'gallery', imageIds: ['g'] },
      { type: 'quote', text: 'Q' },
      { type: 'divider' },
    ];
    for (const block of blocks) {
      expect(() => render(BlockRenderer, { block })).not.toThrow();
    }
  });
});
