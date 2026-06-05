import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import ImageBlock from './ImageBlock.svelte';

describe('ImageBlock', () => {
  it('renders an inline framed r43 photo with the caption as alt and figcaption', () => {
    const { container } = render(ImageBlock, {
      block: { type: 'image', imageId: 'img1', caption: 'Gipfel' },
    });
    const figure = container.querySelector('.wrap-narrow figure.block');
    expect(figure).not.toBeNull();
    const img = screen.getByRole('img', { name: 'Gipfel' });
    expect(img.closest('.photo .frame.r43')).not.toBeNull();
    expect(img).toHaveAttribute('src', '/api/public/images/img1/display');
    expect(figure?.querySelector('figcaption')?.textContent).toBe('Gipfel');
  });

  it('renders a lead image as a bleed r169 photo (no reading-column wrapper)', () => {
    const { container } = render(ImageBlock, {
      block: { type: 'image', imageId: 'lead1', caption: 'Morgen' },
      lead: true,
    });
    expect(container.querySelector('.wrap-narrow')).toBeNull();
    const figure = container.querySelector('figure.bleed.block');
    expect(figure).not.toBeNull();
    expect(container.querySelector('.photo .frame.r169 img')).toHaveAttribute(
      'src',
      '/api/public/images/lead1/display',
    );
  });

  it('opens the full image in a lightbox on click and closes it', async () => {
    const user = userEvent.setup();
    render(ImageBlock, { block: { type: 'image', imageId: 'img1', caption: 'Gipfel' } });
    expect(screen.queryByRole('dialog')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Bild öffnen' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // A single image has no prev/next navigation (count === 1).
    expect(screen.queryByRole('button', { name: 'Nächstes Bild' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Schließen' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('omits the figcaption when there is no caption', () => {
    const { container } = render(ImageBlock, { block: { type: 'image', imageId: 'img2' } });
    expect(container.querySelector('figcaption')).toBeNull();
    // An empty alt makes the image decorative (role "presentation"), as intended.
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('alt', '');
    expect(img).toHaveAttribute('src', '/api/public/images/img2/display');
  });

  it('renders a portrait body image narrow/centered at natural ratio, not r43', () => {
    const { container } = render(ImageBlock, {
      block: { type: 'image', imageId: 'p1', caption: 'Hoch' },
      images: { p1: { width: 1000, height: 1500 } },
    });
    // No forced r43 cover frame for a portrait.
    expect(container.querySelector('.frame.r43')).toBeNull();
    const figure = container.querySelector('figure.block.portrait');
    expect(figure).not.toBeNull();
    const frame = container.querySelector('.photo .frame');
    expect(frame?.getAttribute('style')).toContain('aspect-ratio: 1000/1500');
    expect(screen.getByRole('img', { name: 'Hoch' })).toHaveAttribute(
      'src',
      '/api/public/images/p1/display',
    );
  });

  it('keeps a landscape body image as the r43 frame', () => {
    const { container } = render(ImageBlock, {
      block: { type: 'image', imageId: 'l1' },
      images: { l1: { width: 1600, height: 900 } },
    });
    expect(container.querySelector('figure.portrait')).toBeNull();
    expect(container.querySelector('.wrap-narrow .photo .frame.r43 img')).toHaveAttribute(
      'src',
      '/api/public/images/l1/display',
    );
  });

  it('keeps a portrait lead image as the wide r169 bleed (lead overrides orientation)', () => {
    const { container } = render(ImageBlock, {
      block: { type: 'image', imageId: 'lead1' },
      lead: true,
      images: { lead1: { width: 1000, height: 1500 } },
    });
    expect(container.querySelector('figure.portrait')).toBeNull();
    expect(container.querySelector('figure.bleed.block .photo .frame.r169')).not.toBeNull();
  });

  it('opens the lightbox from a portrait body image', async () => {
    const user = userEvent.setup();
    render(ImageBlock, {
      block: { type: 'image', imageId: 'p1', caption: 'Hoch' },
      images: { p1: { width: 1000, height: 1500 } },
    });
    await user.click(screen.getByRole('button', { name: 'Bild öffnen' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
