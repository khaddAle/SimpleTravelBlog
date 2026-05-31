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
});
