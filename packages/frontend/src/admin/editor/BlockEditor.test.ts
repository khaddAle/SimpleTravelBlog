import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import type { Block } from '@stb/shared';
import BlockEditor from './BlockEditor.svelte';

function setup(blocks: Block[], extra: Record<string, unknown> = {}) {
  const onChange = vi.fn();
  const result = render(BlockEditor, { blocks, onChange, ...extra });
  return { onChange, ...result };
}

describe('BlockEditor', () => {
  it('shows an empty hint when there are no blocks', () => {
    setup([]);
    expect(screen.getByText(/Noch keine Blöcke/)).toBeInTheDocument();
  });

  it('inserts a paragraph via the palette', async () => {
    const user = userEvent.setup();
    const { onChange } = setup([]);
    await user.click(screen.getByRole('button', { name: '+ Absatz' }));
    expect(onChange).toHaveBeenLastCalledWith([{ type: 'paragraph', text: '' }]);
  });

  it('inserts a divider', async () => {
    const user = userEvent.setup();
    const { onChange } = setup([]);
    await user.click(screen.getByRole('button', { name: '+ Trenner' }));
    expect(onChange).toHaveBeenLastCalledWith([{ type: 'divider' }]);
  });

  it('edits a title block text', async () => {
    const user = userEvent.setup();
    const { onChange } = setup([{ type: 'title', text: '' }]);
    await user.type(screen.getByLabelText('Titel'), 'Berge');
    expect(onChange).toHaveBeenLastCalledWith([{ type: 'title', text: 'Berge' }]);
  });

  it('reorders with ▲/▼ and disables at the ends', async () => {
    const user = userEvent.setup();
    const { onChange } = setup([
      { type: 'title', text: 'A' },
      { type: 'paragraph', text: 'B' },
    ]);
    const items = screen.getAllByRole('listitem');
    // First item's "up" is disabled; last item's "down" is disabled.
    expect(within(items[0]!).getByLabelText('Nach oben verschieben')).toBeDisabled();
    expect(within(items[1]!).getByLabelText('Nach unten verschieben')).toBeDisabled();

    await user.click(within(items[1]!).getByLabelText('Nach oben verschieben'));
    expect(onChange).toHaveBeenLastCalledWith([
      { type: 'paragraph', text: 'B' },
      { type: 'title', text: 'A' },
    ]);
  });

  it('deletes a block', async () => {
    const user = userEvent.setup();
    const { onChange } = setup([
      { type: 'title', text: 'A' },
      { type: 'divider' },
    ]);
    const items = screen.getAllByRole('listitem');
    await user.click(within(items[0]!).getByLabelText('Entfernen'));
    expect(onChange).toHaveBeenLastCalledWith([{ type: 'divider' }]);
  });

  it('inserts an image via the pickImage resolver', async () => {
    const user = userEvent.setup();
    const pickImage = vi.fn().mockResolvedValue('img42');
    const { onChange } = setup([], { pickImage });
    await user.click(screen.getByRole('button', { name: '+ Bild' }));
    expect(pickImage).toHaveBeenCalled();
    expect(onChange).toHaveBeenLastCalledWith([{ type: 'image', imageId: 'img42' }]);
  });

  it('does not insert an image when the picker is cancelled', async () => {
    const user = userEvent.setup();
    const pickImage = vi.fn().mockResolvedValue(null);
    const { onChange } = setup([], { pickImage });
    await user.click(screen.getByRole('button', { name: '+ Bild' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('inserts a gallery via the pickGallery resolver', async () => {
    const user = userEvent.setup();
    const pickGallery = vi.fn().mockResolvedValue(['a', 'b']);
    const { onChange } = setup([], { pickGallery });
    await user.click(screen.getByRole('button', { name: '+ Galerie' }));
    expect(onChange).toHaveBeenLastCalledWith([{ type: 'gallery', imageIds: ['a', 'b'] }]);
  });

  it('inserts a fresh image with the unused-only filter on', async () => {
    const user = userEvent.setup();
    const pickImage = vi.fn().mockResolvedValue('img42');
    setup([], { pickImage });
    await user.click(screen.getByRole('button', { name: '+ Bild' }));
    expect(pickImage).toHaveBeenCalledWith({ orphansOnly: true });
  });

  it('inserts a fresh gallery with the unused-only filter on', async () => {
    const user = userEvent.setup();
    const pickGallery = vi.fn().mockResolvedValue(['a']);
    setup([], { pickGallery });
    await user.click(screen.getByRole('button', { name: '+ Galerie' }));
    expect(pickGallery).toHaveBeenCalledWith({ orphansOnly: true });
  });

  it('changes an image block via "Bild ändern" (filter off, replaces id)', async () => {
    const user = userEvent.setup();
    const pickImage = vi.fn().mockResolvedValue('img99');
    const { onChange } = setup([{ type: 'image', imageId: 'img1', caption: 'Gipfel' }], { pickImage });
    await user.click(screen.getByRole('button', { name: 'Bild ändern' }));
    expect(pickImage).toHaveBeenCalledWith({ orphansOnly: false });
    expect(onChange).toHaveBeenLastCalledWith([
      { type: 'image', imageId: 'img99', caption: 'Gipfel' },
    ]);
  });

  it('keeps the existing image when "Bild ändern" is cancelled', async () => {
    const user = userEvent.setup();
    const pickImage = vi.fn().mockResolvedValue(null);
    const { onChange } = setup([{ type: 'image', imageId: 'img1' }], { pickImage });
    await user.click(screen.getByRole('button', { name: 'Bild ändern' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('edits a gallery via "Galerie bearbeiten" (filter off, pre-selects current)', async () => {
    const user = userEvent.setup();
    const pickGallery = vi.fn().mockResolvedValue(['a', 'b', 'c']);
    const { onChange } = setup([{ type: 'gallery', imageIds: ['a', 'b'], caption: 'Tour' }], {
      pickGallery,
    });
    await user.click(screen.getByRole('button', { name: 'Galerie bearbeiten' }));
    expect(pickGallery).toHaveBeenCalledWith({ orphansOnly: false, selected: ['a', 'b'] });
    expect(onChange).toHaveBeenLastCalledWith([
      { type: 'gallery', imageIds: ['a', 'b', 'c'], caption: 'Tour' },
    ]);
  });

  it('keeps the existing gallery when editing is cancelled or empty', async () => {
    const user = userEvent.setup();
    const pickGallery = vi.fn().mockResolvedValue(null);
    const { onChange } = setup([{ type: 'gallery', imageIds: ['a', 'b'] }], { pickGallery });
    await user.click(screen.getByRole('button', { name: 'Galerie bearbeiten' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('edits an image caption', async () => {
    const user = userEvent.setup();
    const { onChange } = setup([{ type: 'image', imageId: 'img1' }]);
    await user.type(screen.getByLabelText('Bildunterschrift'), 'Gipfel');
    expect(onChange).toHaveBeenLastCalledWith([
      { type: 'image', imageId: 'img1', caption: 'Gipfel' },
    ]);
  });

  it('inserts a subtitle and a title', async () => {
    const user = userEvent.setup();
    const { onChange } = setup([]);
    await user.click(screen.getByRole('button', { name: '+ Untertitel' }));
    expect(onChange).toHaveBeenLastCalledWith([{ type: 'subtitle', text: '' }]);
    await user.click(screen.getByRole('button', { name: '+ Titel' }));
    expect(onChange).toHaveBeenLastCalledWith([
      { type: 'subtitle', text: '' },
      { type: 'title', text: '' },
    ]);
  });

  it('edits a quote source and clears it', async () => {
    const user = userEvent.setup();
    const { onChange } = setup([{ type: 'quote', text: 'Reisen' }]);
    await user.type(screen.getByLabelText('Quelle'), 'Oma');
    expect(onChange).toHaveBeenLastCalledWith([{ type: 'quote', text: 'Reisen', source: 'Oma' }]);
    await user.clear(screen.getByLabelText('Quelle'));
    expect(onChange).toHaveBeenLastCalledWith([{ type: 'quote', text: 'Reisen' }]);
  });

  it('moves a block down', async () => {
    const user = userEvent.setup();
    const { onChange } = setup([
      { type: 'title', text: 'A' },
      { type: 'paragraph', text: 'B' },
    ]);
    const items = screen.getAllByRole('listitem');
    await user.click(within(items[0]!).getByLabelText('Nach unten verschieben'));
    expect(onChange).toHaveBeenLastCalledWith([
      { type: 'paragraph', text: 'B' },
      { type: 'title', text: 'A' },
    ]);
  });

  it('summarises a gallery block', () => {
    setup([{ type: 'gallery', imageIds: ['a', 'b', 'c'] }]);
    expect(screen.getByText('3 Bilder')).toBeInTheDocument();
  });

  it('renders a thumbnail per image in a gallery block', () => {
    const { container } = setup([{ type: 'gallery', imageIds: ['a', 'b', 'c'] }]);
    expect(container.querySelectorAll('.gallery-thumbs img')).toHaveLength(3);
  });

  it('edits a gallery caption', async () => {
    const user = userEvent.setup();
    const { onChange } = setup([{ type: 'gallery', imageIds: ['a', 'b'] }]);
    await user.type(screen.getByLabelText('Galerie-Bildunterschrift'), 'Tour');
    expect(onChange).toHaveBeenLastCalledWith([
      { type: 'gallery', imageIds: ['a', 'b'], caption: 'Tour' },
    ]);
  });
});
