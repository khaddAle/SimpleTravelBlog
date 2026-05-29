import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import GalleryBlock from './GalleryBlock.svelte';

describe('GalleryBlock', () => {
  it('renders one thumbnail per image id', () => {
    const { container } = render(GalleryBlock, {
      block: { type: 'gallery', imageIds: ['a1', 'b2', 'c3'] },
    });
    // Gallery thumbnails are decorative (empty alt), so query the DOM directly.
    const imgs = container.querySelectorAll('img');
    expect(imgs).toHaveLength(3);
    expect(imgs[0]).toHaveAttribute('src', '/api/public/images/a1/thumb');
  });
});
