import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import GalleryBlock from './GalleryBlock.svelte';

describe('GalleryBlock', () => {
  it('renders a masonry of framed sm tiles at natural ratios (no r43 cover)', () => {
    const { container } = render(GalleryBlock, {
      block: { type: 'gallery', imageIds: ['a1', 'b2', 'c3'] },
      images: {
        a1: { width: 1600, height: 900 },
        b2: { width: 1000, height: 1500 },
        c3: { width: 1600, height: 900 },
      },
    });
    expect(container.querySelector('figure.bleed.block .masonry')).not.toBeNull();
    // No forced r43 cover frames — each tile carries its natural ratio inline.
    expect(container.querySelector('.frame.r43')).toBeNull();
    const frames = container.querySelectorAll('.masonry .photo.sm .frame');
    expect(frames).toHaveLength(3);
    // The portrait tile keeps its tall ratio.
    const portrait = [...frames].find((f) =>
      f.querySelector('img')?.getAttribute('src')?.includes('/b2/'),
    );
    expect(portrait?.getAttribute('style')).toContain('aspect-ratio: 1000/1500');
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
