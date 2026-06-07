import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import type { ImageDto } from '@stb/shared';
import { auth } from '../lib/auth.svelte.js';
import { api, ApiError } from '../lib/api.js';
import type { EventSourceLike } from '../lib/uploads.js';

vi.mock('svelte-spa-router', () => ({ push: vi.fn() }));

import ImageLibrary from './ImageLibrary.svelte';

function image(id: string, filename: string): ImageDto {
  return {
    id,
    originalFilename: filename,
    mime: 'image/jpeg',
    width: 1600,
    height: 1200,
    displayUrl: `/api/public/images/${id}/display`,
    thumbUrl: `/api/public/images/${id}/thumb`,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

class FakeEventSource implements EventSourceLike {
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  constructor(public url: string) {}
  emit(data: unknown): void {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
  close(): void {}
}

beforeEach(() => {
  auth.user = { id: 'u1', username: 'mum', role: 'admin' };
  vi.spyOn(api, 'listImages').mockResolvedValue({
    items: [image('a', 'alpha.jpg')],
    page: 1,
    pageSize: 24,
    total: 1,
  });
});
afterEach(() => vi.restoreAllMocks());

describe('ImageLibrary', () => {
  it('lists images', async () => {
    render(ImageLibrary);
    expect(await screen.findByText('alpha.jpg')).toBeInTheDocument();
  });

  it('searches by filename', async () => {
    const user = userEvent.setup();
    const list = vi.spyOn(api, 'listImages');
    render(ImageLibrary);
    await screen.findByText('alpha.jpg');
    await user.type(screen.getByLabelText('Nach Dateiname suchen'), 'alp');
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'alp' })),
    );
  });

  it('changes the sort order', async () => {
    const user = userEvent.setup();
    const list = vi.spyOn(api, 'listImages');
    render(ImageLibrary);
    await screen.findByText('alpha.jpg');
    await user.selectOptions(screen.getByLabelText('Sortierung'), 'filename');
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ sort: 'filename' })),
    );
  });

  it('sorts by capture date in both directions', async () => {
    const user = userEvent.setup();
    const list = vi.spyOn(api, 'listImages');
    render(ImageLibrary);
    await screen.findByText('alpha.jpg');
    const select = screen.getByLabelText('Sortierung');

    await user.selectOptions(select, 'taken-newest');
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ sort: 'taken-newest' })),
    );

    await user.selectOptions(select, 'taken-oldest');
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ sort: 'taken-oldest' })),
    );
  });

  it('filters to orphans via the segment', async () => {
    const user = userEvent.setup();
    const list = vi.spyOn(api, 'listImages');
    render(ImageLibrary);
    await screen.findByText('alpha.jpg');
    await user.click(screen.getByRole('button', { name: 'Verwaist' }));
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ orphansOnly: true })),
    );
  });

  it('shows usage on demand', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'imageUsage').mockResolvedValue([{ id: 'p1', title: 'Berge' }]);
    render(ImageLibrary);
    await user.click(await screen.findByRole('button', { name: 'Wo verwendet?' }));
    await waitFor(() => expect(screen.getByText('Berge')).toBeInTheDocument());
  });

  it('deletes an unreferenced image from its card', async () => {
    const user = userEvent.setup();
    const del = vi.spyOn(api, 'deleteImage').mockResolvedValue();
    render(ImageLibrary);
    await user.click(await screen.findByLabelText('alpha.jpg löschen'));
    expect(del).toHaveBeenCalledWith('a');
    await waitFor(() => expect(screen.queryByText('alpha.jpg')).toBeNull());
  });

  it('shows a blocking message when the image is in use', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'deleteImage').mockRejectedValue(
      new ApiError(409, 'image_in_use', { error: 'image_in_use', posts: [{ id: 'p1', title: 'Berge' }] }),
    );
    render(ImageLibrary);
    await user.click(await screen.findByLabelText('alpha.jpg löschen'));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('wird noch verwendet');
    expect(screen.getByRole('link', { name: 'Berge' })).toHaveAttribute(
      'href',
      '#/admin/beitrag/p1',
    );
  });

  it('selects images and deletes them in selection mode', async () => {
    const user = userEvent.setup();
    const del = vi.spyOn(api, 'deleteImage').mockResolvedValue();
    render(ImageLibrary);
    await screen.findByText('alpha.jpg');
    await user.click(screen.getByRole('button', { name: 'Auswählen' }));
    await user.click(screen.getByLabelText('alpha.jpg auswählen'));
    await user.click(screen.getByRole('button', { name: 'Löschen (1)' }));
    await waitFor(() => expect(del).toHaveBeenCalledWith('a'));
  });

  it('asks to confirm and shows the count before deleting unused images', async () => {
    const user = userEvent.setup();
    const count = vi.spyOn(api, 'unusedImageCount').mockResolvedValue(7);
    render(ImageLibrary);
    await user.click(await screen.findByRole('button', { name: 'Unbenutzte löschen' }));
    expect(count).toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('7');
  });

  it('bulk-deletes unused images after confirming and reloads', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'unusedImageCount').mockResolvedValue(7);
    const del = vi.spyOn(api, 'deleteUnusedImages').mockResolvedValue(7);
    const list = vi.spyOn(api, 'listImages');
    render(ImageLibrary);
    await user.click(await screen.findByRole('button', { name: 'Unbenutzte löschen' }));
    const dialog = await screen.findByRole('dialog');
    const callsBefore = list.mock.calls.length;
    await user.click(within(dialog).getByRole('button', { name: 'Löschen' }));
    expect(del).toHaveBeenCalled();
    await waitFor(() => expect(list.mock.calls.length).toBeGreaterThan(callsBefore));
  });

  it('cancels the bulk-delete confirm without deleting', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'unusedImageCount').mockResolvedValue(7);
    const del = vi.spyOn(api, 'deleteUnusedImages').mockResolvedValue(7);
    render(ImageLibrary);
    await user.click(await screen.findByRole('button', { name: 'Unbenutzte löschen' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Abbrechen' }));
    expect(del).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('uploads a file and reloads when it completes', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'uploadImage').mockResolvedValue({ uploadId: 'up1', imageId: 'c' });
    const list = vi.spyOn(api, 'listImages');
    let current: FakeEventSource | undefined;
    render(ImageLibrary, {
      eventSourceFactory: (url: string) => {
        current = new FakeEventSource(url);
        return current;
      },
    });
    await screen.findByText('alpha.jpg');

    const file = new File([new Uint8Array([1])], 'neu.jpg', { type: 'image/jpeg' });
    await user.upload(screen.getByLabelText('Hochladen'), file);
    expect(api.uploadImage).toHaveBeenCalledWith(file);

    await waitFor(() => expect(current).toBeDefined());
    const callsBefore = list.mock.calls.length;
    current!.emit({ type: 'done', image: image('c', 'neu.jpg') });
    await waitFor(() => expect(list.mock.calls.length).toBeGreaterThan(callsBefore));
  });
});
