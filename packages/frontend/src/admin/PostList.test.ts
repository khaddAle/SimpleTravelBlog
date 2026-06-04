import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import type { PostSummary } from '@stb/shared';
import { auth } from '../lib/auth.svelte.js';
import { api } from '../lib/api.js';

vi.mock('svelte-spa-router', () => ({ push: vi.fn() }));

import PostList from './PostList.svelte';

function post(
  id: string,
  title: string,
  status: PostSummary['status'],
  extra: Partial<PostSummary> = {},
): PostSummary {
  return {
    id,
    title,
    postDate: '2026-01-01T00:00:00.000Z',
    country: 'DE',
    placeName: 'Ort',
    status,
    hasPendingDraft: false,
    ...extra,
  };
}

const page = (posts: PostSummary[], total = posts.length) => ({ posts, total });

beforeEach(() => {
  auth.user = { id: 'u1', username: 'mum', role: 'admin' };
});
afterEach(() => vi.restoreAllMocks());

describe('PostList', () => {
  it('lists posts with status labels', async () => {
    vi.spyOn(api, 'listPosts').mockResolvedValue(
      page([post('p1', 'Berge', 'published'), post('p2', 'Notizen', 'draft')]),
    );
    render(PostList);
    expect(await screen.findByRole('link', { name: 'Berge' })).toHaveAttribute(
      'href',
      '#/admin/beitrag/p1',
    );
    expect(screen.getByText('Veröffentlicht')).toBeInTheDocument();
    expect(screen.getByText('Entwurf')).toBeInTheDocument();
  });

  it('badges a published post that carries an unpublished draft', async () => {
    vi.spyOn(api, 'listPosts').mockResolvedValue(
      page([post('p1', 'Berge', 'published', { hasPendingDraft: true })]),
    );
    render(PostList);
    expect(await screen.findByText('Entwurf mit Änderungen')).toBeInTheDocument();
  });

  it('deletes a post after confirmation', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
    vi.spyOn(api, 'listPosts').mockResolvedValue(page([post('p1', 'Berge', 'published')]));
    const del = vi.spyOn(api, 'deletePost').mockResolvedValue();
    render(PostList);
    await user.click(await screen.findByLabelText('Berge löschen'));
    expect(del).toHaveBeenCalledWith('p1');
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Berge' })).toBeNull());
  });

  it('does not delete when confirmation is declined', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'confirm').mockReturnValue(false);
    vi.spyOn(api, 'listPosts').mockResolvedValue(page([post('p1', 'Berge', 'published')]));
    const del = vi.spyOn(api, 'deletePost').mockResolvedValue();
    render(PostList);
    await user.click(await screen.findByLabelText('Berge löschen'));
    expect(del).not.toHaveBeenCalled();
  });

  it('shows an empty message', async () => {
    vi.spyOn(api, 'listPosts').mockResolvedValue(page([]));
    render(PostList);
    expect(await screen.findByText('Noch keine Beiträge.')).toBeInTheDocument();
  });

  it('shows a cover thumbnail when the post has one', async () => {
    vi.spyOn(api, 'listPosts').mockResolvedValue(
      page([post('p1', 'Berge', 'published', { coverImageId: 'cov1' })]),
    );
    render(PostList);
    await screen.findByRole('link', { name: 'Berge' });
    const thumb = document.querySelector('img');
    expect(thumb).not.toBeNull();
    expect(thumb!.getAttribute('src')).toContain('cov1');
  });

  it('shows the place and country in the row meta', async () => {
    vi.spyOn(api, 'listPosts').mockResolvedValue(
      page([post('p1', 'Berge', 'published', { placeName: 'Zugspitze', country: 'DE' })]),
    );
    render(PostList);
    await screen.findByRole('link', { name: 'Berge' });
    expect(screen.getByText(/Zugspitze/)).toBeInTheDocument();
    expect(screen.getByText(/Deutschland/)).toBeInTheDocument();
  });

  it('pages with "Mehr laden" and appends the next page', async () => {
    const user = userEvent.setup();
    const list = vi
      .spyOn(api, 'listPosts')
      .mockResolvedValueOnce(page([post('p1', 'Eins', 'draft')], 2))
      .mockResolvedValueOnce(page([post('p2', 'Zwei', 'draft')], 2));
    render(PostList);

    await screen.findByRole('link', { name: 'Eins' });
    expect(list).toHaveBeenLastCalledWith({ limit: 25 });
    expect(screen.getByText('1 von 2 Beiträgen')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Mehr laden' }));
    expect(await screen.findByRole('link', { name: 'Zwei' })).toBeInTheDocument();
    expect(list).toHaveBeenLastCalledWith({ offset: 1, limit: 25 });
    expect(screen.queryByRole('button', { name: 'Mehr laden' })).toBeNull();
  });

  it('"Alle laden" fetches the remaining posts without a limit', async () => {
    const user = userEvent.setup();
    const list = vi
      .spyOn(api, 'listPosts')
      .mockResolvedValueOnce(page([post('p1', 'Eins', 'draft')], 3))
      .mockResolvedValueOnce(page([post('p2', 'Zwei', 'draft'), post('p3', 'Drei', 'draft')], 3));
    render(PostList);

    await screen.findByRole('link', { name: 'Eins' });
    await user.click(screen.getByRole('button', { name: 'Alle laden' }));
    expect(await screen.findByRole('link', { name: 'Drei' })).toBeInTheDocument();
    expect(list).toHaveBeenLastCalledWith({ offset: 1 });
  });

  it('hides the pager when the first page holds everything', async () => {
    vi.spyOn(api, 'listPosts').mockResolvedValue(page([post('p1', 'Eins', 'draft')], 1));
    render(PostList);
    await screen.findByRole('link', { name: 'Eins' });
    expect(screen.queryByRole('button', { name: 'Mehr laden' })).toBeNull();
  });
});
