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

  it('shows a position counter for multi-image groups and updates it', async () => {
    const user = userEvent.setup();
    render(Lightbox, { imageIds: ['a', 'b', 'c'], index: 0, onClose: vi.fn() });
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Nächstes Bild' }));
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
  });

  it('omits the counter for a single image', () => {
    const { container } = render(Lightbox, { imageIds: ['only'], index: 0, onClose: vi.fn() });
    expect(container.querySelector('.lb-count')?.textContent ?? '').toBe('');
  });

  it('closes when the backdrop is clicked but not when the image is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { container } = render(Lightbox, { imageIds: ['a', 'b'], index: 0, onClose });
    await user.click(container.querySelector('.lightbox img') as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();
    await user.click(container.querySelector('.lightbox') as HTMLElement);
    expect(onClose).toHaveBeenCalled();
  });

  it('advances on a leftward swipe and goes back on a rightward swipe', async () => {
    render(Lightbox, { imageIds: ['a', 'b', 'c'], index: 0, onClose: vi.fn() });
    const overlay = document.querySelector('.lightbox') as HTMLElement;
    await fireEvent.touchStart(overlay, { touches: [{ clientX: 200 }] });
    await fireEvent.touchEnd(overlay, { changedTouches: [{ clientX: 120 }] });
    expect(src()).toContain('/b/display');
    await fireEvent.touchStart(overlay, { touches: [{ clientX: 120 }] });
    await fireEvent.touchEnd(overlay, { changedTouches: [{ clientX: 200 }] });
    expect(src()).toContain('/a/display');
  });

  it('ignores a swipe shorter than the threshold', async () => {
    render(Lightbox, { imageIds: ['a', 'b'], index: 0, onClose: vi.fn() });
    const overlay = document.querySelector('.lightbox') as HTMLElement;
    await fireEvent.touchStart(overlay, { touches: [{ clientX: 200 }] });
    await fireEvent.touchEnd(overlay, { changedTouches: [{ clientX: 180 }] });
    expect(src()).toContain('/a/display');
  });
});
