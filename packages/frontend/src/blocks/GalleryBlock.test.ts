import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import GalleryBlock from './GalleryBlock.svelte';

describe('GalleryBlock', () => {
  it('renders one thumbnail button per image id', () => {
    const { container } = render(GalleryBlock, {
      block: { type: 'gallery', imageIds: ['a1', 'b2', 'c3'] },
    });
    // Gallery thumbnails are decorative (empty alt), so query the DOM directly.
    const imgs = container.querySelectorAll('img');
    expect(imgs).toHaveLength(3);
    expect(imgs[0]).toHaveAttribute('src', '/api/public/images/a1/thumb');
    expect(screen.getAllByRole('button', { name: 'Bild öffnen' })).toHaveLength(3);
  });

  it('opens the lightbox on click and closes it again', async () => {
    const user = userEvent.setup();
    render(GalleryBlock, { block: { type: 'gallery', imageIds: ['a', 'b'] } });
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(screen.getAllByRole('button', { name: 'Bild öffnen' })[0]!);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Schließen' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders a caption when present', () => {
    const { container } = render(GalleryBlock, {
      block: { type: 'gallery', imageIds: ['a'], caption: 'Sonnenuntergang' },
    });
    expect(container.querySelector('figcaption')?.textContent).toBe('Sonnenuntergang');
  });
});
