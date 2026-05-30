import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import Lightbox from './Lightbox.svelte';

const src = (): string => (document.querySelector('.lightbox img') as HTMLImageElement).src;

describe('Lightbox', () => {
  it('shows the image at the given start index', () => {
    render(Lightbox, { imageIds: ['a', 'b', 'c'], index: 1, onClose: vi.fn() });
    expect(src()).toContain('/b/display');
  });

  it('steps forward, wrapping past the last image', async () => {
    const user = userEvent.setup();
    render(Lightbox, { imageIds: ['a', 'b', 'c'], index: 0, onClose: vi.fn() });
    const next = screen.getByRole('button', { name: 'Nächstes Bild' });
    await user.click(next);
    expect(src()).toContain('/b/display');
    await user.click(next);
    expect(src()).toContain('/c/display');
    await user.click(next);
    expect(src()).toContain('/a/display');
  });

  it('steps backward, wrapping before the first image', async () => {
    const user = userEvent.setup();
    render(Lightbox, { imageIds: ['a', 'b', 'c'], index: 0, onClose: vi.fn() });
    await user.click(screen.getByRole('button', { name: 'Vorheriges Bild' }));
    expect(src()).toContain('/c/display');
  });

  it('navigates with arrow keys and closes on Escape', async () => {
    const onClose = vi.fn();
    render(Lightbox, { imageIds: ['a', 'b'], index: 0, onClose });
    await fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(src()).toContain('/b/display');
    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('the ✕ button closes', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(Lightbox, { imageIds: ['a'], index: 0, onClose });
    await user.click(screen.getByRole('button', { name: 'Schließen' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('hides the navigation for a single image', () => {
    render(Lightbox, { imageIds: ['only'], index: 0, onClose: vi.fn() });
    expect(screen.queryByRole('button', { name: 'Nächstes Bild' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Vorheriges Bild' })).toBeNull();
  });

  it('shows the caption when provided', () => {
    render(Lightbox, { imageIds: ['a'], index: 0, caption: 'Strand', onClose: vi.fn() });
    expect(screen.getByText('Strand')).toBeInTheDocument();
  });
});
