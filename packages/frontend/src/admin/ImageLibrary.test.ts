import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import type { ImageDto } from '@stb/shared';
import { auth } from '../lib/auth.svelte.js';
import { api, ApiError } from '../lib/api.js';

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

  it('deletes an unreferenced image', async () => {
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

  it('shows usage on demand', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'imageUsage').mockResolvedValue([{ id: 'p1', title: 'Berge' }]);
    render(ImageLibrary);
    await user.click(await screen.findByRole('button', { name: 'Verwendung' }));
    await waitFor(() => expect(screen.getByText('Berge')).toBeInTheDocument());
  });
});
