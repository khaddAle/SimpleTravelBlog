import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import type { PostDto } from '@stb/shared';
import { auth } from '../lib/auth.svelte.js';
import { api } from '../lib/api.js';

vi.mock('svelte-spa-router', () => ({ push: vi.fn() }));

import PostList from './PostList.svelte';

function post(id: string, title: string, status: PostDto['status']): PostDto {
  return {
    id,
    title,
    blocks: [],
    postDate: '2026-01-01T00:00:00.000Z',
    country: 'DE',
    placeName: 'Ort',
    lat: 0,
    lng: 0,
    status,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

beforeEach(() => {
  auth.user = { id: 'u1', username: 'mum', role: 'admin' };
});
afterEach(() => vi.restoreAllMocks());

describe('PostList', () => {
  it('lists posts with status labels', async () => {
    vi.spyOn(api, 'listPosts').mockResolvedValue([
      post('p1', 'Berge', 'published'),
      post('p2', 'Notizen', 'draft'),
    ]);
    render(PostList);
    expect(await screen.findByRole('link', { name: 'Berge' })).toHaveAttribute(
      'href',
      '#/admin/beitrag/p1',
    );
    expect(screen.getByText('Veröffentlicht')).toBeInTheDocument();
    expect(screen.getByText('Entwurf')).toBeInTheDocument();
  });

  it('deletes a post after confirmation', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
    vi.spyOn(api, 'listPosts').mockResolvedValue([post('p1', 'Berge', 'published')]);
    const del = vi.spyOn(api, 'deletePost').mockResolvedValue();
    render(PostList);
    await user.click(await screen.findByLabelText('Berge löschen'));
    expect(del).toHaveBeenCalledWith('p1');
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Berge' })).toBeNull());
  });

  it('does not delete when confirmation is declined', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'confirm').mockReturnValue(false);
    vi.spyOn(api, 'listPosts').mockResolvedValue([post('p1', 'Berge', 'published')]);
    const del = vi.spyOn(api, 'deletePost').mockResolvedValue();
    render(PostList);
    await user.click(await screen.findByLabelText('Berge löschen'));
    expect(del).not.toHaveBeenCalled();
  });

  it('shows an empty message', async () => {
    vi.spyOn(api, 'listPosts').mockResolvedValue([]);
    render(PostList);
    expect(await screen.findByText('Noch keine Beiträge.')).toBeInTheDocument();
  });
});
