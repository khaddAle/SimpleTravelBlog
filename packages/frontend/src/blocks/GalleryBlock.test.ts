import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import GalleryBlock from './GalleryBlock.svelte';

describe('GalleryBlock', () => {
  it('renders a bleed gallery of framed r43 sm thumbnails, one per image id', () => {
    const { container } = render(GalleryBlock, {
      block: { type: 'gallery', imageIds: ['a1', 'b2', 'c3'] },
    });
    expect(container.querySelector('figure.bleed.block .gallery')).not.toBeNull();
    // Gallery thumbnails are decorative (empty alt), so query the DOM directly.
    const frames = container.querySelectorAll('.gallery .photo.sm .frame.r43 img');
    expect(frames).toHaveLength(3);
    expect(frames[0]).toHaveAttribute('src', '/api/public/images/a1/thumb');
    expect(screen.getAllByRole('button', { name: 'Bild öffnen' })).toHaveLength(3);
  });

  it('opens the lightbox at the clicked image and closes it again', async () => {
    const user = userEvent.setup();
    render(GalleryBlock, { block: { type: 'gallery', imageIds: ['a', 'b'] } });
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(screen.getAllByRole('button', { name: 'Bild öffnen' })[1]!);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // Clicking the second thumbnail opens the lightbox on that image.
    expect((document.querySelector('.lightbox img') as HTMLImageElement).src).toContain(
      '/b/display',
    );
    await user.click(screen.getByRole('button', { name: 'Schließen' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders a caption when present', () => {
    const { container } = render(GalleryBlock, {
      block: { type: 'gallery', imageIds: ['a'], caption: 'Sonnenuntergang' },
    });
    expect(container.querySelector('figure.bleed.block > figcaption')?.textContent).toBe(
      'Sonnenuntergang',
    );
  });
});
