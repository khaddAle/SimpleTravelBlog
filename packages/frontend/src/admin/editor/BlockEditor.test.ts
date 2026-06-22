import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import type { Block } from '@stb/shared';
import BlockEditor from './BlockEditor.svelte';

function setup(blocks: Block[], extra: Record<string, unknown> = {}) {
  const onChange = vi.fn();
  const result = render(BlockEditor, { blocks, onChange, ...extra });
  return { onChange, ...result };
}

/**
 * Open an inserter "+" (the last gap by default = append) and choose a block
 * type from its menu. Mirrors the Fernweh insert affordance between blocks.
 */
async function insert(
  user: ReturnType<typeof userEvent.setup>,
  typeLabel: string,
  gap: 'last' | number = 'last',
): Promise<void> {
  const adders = screen.getAllByRole('button', { name: 'Block einfügen' });
  const plus = gap === 'last' ? adders[adders.length - 1]! : adders[gap]!;
  await user.click(plus);
  await user.click(screen.getByRole('button', { name: typeLabel }));
}

/** The block list items (`.block`), in document order. */
function blocks(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('.block'));
}

/**
 * Place a (by default collapsed) text caret in a textarea and let the editor's
 * caret-tracking action record it. `selectionStart` is read on `select`, so we
 * set the range then fire that event.
 */
async function placeCaret(
  node: HTMLTextAreaElement,
  start: number,
  end: number = start,
): Promise<void> {
  node.focus();
  node.setSelectionRange(start, end);
  await fireEvent.select(node);
}

afterEach(() => vi.restoreAllMocks());

describe('BlockEditor', () => {
  it('shows an empty hint when there are no blocks', () => {
    setup([]);
    expect(screen.getByText(/Noch keine Blöcke/)).toBeInTheDocument();
  });

  it('inserts a paragraph via the inserter menu', async () => {
    const user = userEvent.setup();
    const { onChange } = setup([]);
    await insert(user, 'Absatz');
    expect(onChange).toHaveBeenLastCalledWith([{ type: 'paragraph', text: '' }]);
  });

  it('inserts a divider', async () => {
    const user = userEvent.setup();
    const { onChange } = setup([]);
    await insert(user, 'Trenner');
    expect(onChange).toHaveBeenLastCalledWith([{ type: 'divider' }]);
  });

  it('inserts at the chosen gap, not only at the end', async () => {
    const user = userEvent.setup();
    const { onChange } = setup([
      { type: 'title', text: 'A' },
      { type: 'paragraph', text: 'B' },
    ]);
    // Gap 0 is before the first block.
    await insert(user, 'Trenner', 0);
    expect(onChange).toHaveBeenLastCalledWith([
      { type: 'divider' },
      { type: 'title', text: 'A' },
      { type: 'paragraph', text: 'B' },
    ]);
  });

  it('edits a title block text', async () => {
    const user = userEvent.setup();
    const { onChange } = setup([{ type: 'title', text: '' }]);
    await user.type(screen.getByLabelText('Titel'), 'Berge');
    expect(onChange).toHaveBeenLastCalledWith([{ type: 'title', text: 'Berge' }]);
  });

  it('reorders with ▲/▼ and disables at the ends', async () => {
    const user = userEvent.setup();
    const { onChange, container } = setup([
      { type: 'title', text: 'A' },
      { type: 'paragraph', text: 'B' },
    ]);
    const items = blocks(container);
    // First item's "up" is disabled; last item's "down" is disabled.
    expect(within(items[0]!).getByLabelText('Nach oben verschieben')).toBeDisabled();
    expect(within(items[1]!).getByLabelText('Nach unten verschieben')).toBeDisabled();

    await user.click(within(items[1]!).getByLabelText('Nach oben verschieben'));
    expect(onChange).toHaveBeenLastCalledWith([
      { type: 'paragraph', text: 'B' },
      { type: 'title', text: 'A' },
    ]);
  });

  it('deletes a block after the user confirms, naming the block type', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
    const { onChange, container } = setup([
      { type: 'title', text: 'A' },
      { type: 'divider' },
    ]);
    const items = blocks(container);
    await user.click(within(items[0]!).getByLabelText('Entfernen'));
    expect(confirm).toHaveBeenCalledWith('Titel entfernen?');
    expect(onChange).toHaveBeenLastCalledWith([{ type: 'divider' }]);
  });

  it('keeps the block when the delete confirm is declined', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(globalThis, 'confirm').mockReturnValue(false);
    const { onChange, container } = setup([
      { type: 'title', text: 'A' },
      { type: 'divider' },
    ]);
    await user.click(within(blocks(container)[0]!).getByLabelText('Entfernen'));
    expect(confirm).toHaveBeenCalledOnce();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('inserts an image via the pickImage resolver', async () => {
    const user = userEvent.setup();
    const pickImage = vi.fn().mockResolvedValue('img42');
    const { onChange } = setup([], { pickImage });
    await insert(user, 'Bild');
    expect(pickImage).toHaveBeenCalled();
    expect(onChange).toHaveBeenLastCalledWith([{ type: 'image', imageId: 'img42' }]);
  });

  it('does not insert an image when the picker is cancelled', async () => {
    const user = userEvent.setup();
    const pickImage = vi.fn().mockResolvedValue(null);
    const { onChange } = setup([], { pickImage });
    await insert(user, 'Bild');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('inserts a gallery via the pickGallery resolver', async () => {
    const user = userEvent.setup();
    const pickGallery = vi.fn().mockResolvedValue(['a', 'b']);
    const { onChange } = setup([], { pickGallery });
    await insert(user, 'Galerie');
    expect(onChange).toHaveBeenLastCalledWith([{ type: 'gallery', imageIds: ['a', 'b'] }]);
  });

  it('inserts a fresh image with the unused-only filter on', async () => {
    const user = userEvent.setup();
    const pickImage = vi.fn().mockResolvedValue('img42');
    setup([], { pickImage });
    await insert(user, 'Bild');
    expect(pickImage).toHaveBeenCalledWith({ orphansOnly: true });
  });

  it('inserts a fresh gallery with the unused-only filter on', async () => {
    const user = userEvent.setup();
    const pickGallery = vi.fn().mockResolvedValue(['a']);
    setup([], { pickGallery });
    await insert(user, 'Galerie');
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
    await insert(user, 'Untertitel');
    expect(onChange).toHaveBeenLastCalledWith([{ type: 'subtitle', text: '' }]);
    await insert(user, 'Titel');
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
    const { onChange, container } = setup([
      { type: 'title', text: 'A' },
      { type: 'paragraph', text: 'B' },
    ]);
    const items = blocks(container);
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

  it('splits a paragraph at the cursor', async () => {
    const user = userEvent.setup();
    const { onChange } = setup([{ type: 'paragraph', text: 'HalloWelt' }]);
    const textarea = screen.getByLabelText('Absatz') as HTMLTextAreaElement;
    await placeCaret(textarea, 5);
    await user.click(screen.getByRole('button', { name: 'Absatz hier teilen' }));
    expect(onChange).toHaveBeenLastCalledWith([
      { type: 'paragraph', text: 'Hallo' },
      { type: 'paragraph', text: 'Welt' },
    ]);
  });

  it('disables the split button when the caret is at the start', async () => {
    setup([{ type: 'paragraph', text: 'HalloWelt' }]);
    const textarea = screen.getByLabelText('Absatz') as HTMLTextAreaElement;
    await placeCaret(textarea, 0);
    expect(screen.getByRole('button', { name: 'Absatz hier teilen' })).toBeDisabled();
  });

  it('disables the split button when the caret is at the end', async () => {
    setup([{ type: 'paragraph', text: 'HalloWelt' }]);
    const textarea = screen.getByLabelText('Absatz') as HTMLTextAreaElement;
    await placeCaret(textarea, 'HalloWelt'.length);
    expect(screen.getByRole('button', { name: 'Absatz hier teilen' })).toBeDisabled();
  });

  it('disables the split button while a range is selected', async () => {
    setup([{ type: 'paragraph', text: 'HalloWelt' }]);
    const textarea = screen.getByLabelText('Absatz') as HTMLTextAreaElement;
    await placeCaret(textarea, 2, 6); // non-collapsed selection mid-text
    expect(screen.getByRole('button', { name: 'Absatz hier teilen' })).toBeDisabled();
  });

  it('renders the split button only on paragraph blocks', () => {
    setup([
      { type: 'title', text: 'A' },
      { type: 'subtitle', text: 'B' },
      { type: 'quote', text: 'C' },
      { type: 'image', imageId: 'img1' },
      { type: 'divider' },
    ]);
    expect(screen.queryByRole('button', { name: 'Absatz hier teilen' })).toBeNull();
  });

  it('moves focus to the start of the new block after a split', async () => {
    const user = userEvent.setup();
    const { container } = setup([{ type: 'paragraph', text: 'HalloWelt' }]);
    const textarea = screen.getByLabelText('Absatz') as HTMLTextAreaElement;
    await placeCaret(textarea, 5);
    await user.click(screen.getByRole('button', { name: 'Absatz hier teilen' }));

    await waitFor(() => {
      const areas = within(container).getAllByLabelText('Absatz') as HTMLTextAreaElement[];
      expect(areas).toHaveLength(2);
      const second = areas[1]!;
      expect(document.activeElement).toBe(second);
      expect(second.selectionStart).toBe(0);
      expect(second.selectionEnd).toBe(0);
    });
  });

  it('lets the inserter add a block between the two halves after a split', async () => {
    const user = userEvent.setup();
    const { onChange } = setup([{ type: 'paragraph', text: 'HalloWelt' }]);
    const textarea = screen.getByLabelText('Absatz') as HTMLTextAreaElement;
    await placeCaret(textarea, 5);
    await user.click(screen.getByRole('button', { name: 'Absatz hier teilen' }));

    // Gap 1 sits between the two halves; inserting there proves the original
    // "put an image in the middle" workflow is now reachable.
    await insert(user, 'Trenner', 1);
    expect(onChange).toHaveBeenLastCalledWith([
      { type: 'paragraph', text: 'Hallo' },
      { type: 'divider' },
      { type: 'paragraph', text: 'Welt' },
    ]);
  });
});
