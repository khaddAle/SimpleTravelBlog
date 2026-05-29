import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { PostDto } from '@stb/shared';
import { api, ApiError } from '../lib/api.js';
import Post from './Post.svelte';

const full: PostDto = {
  id: 'p1',
  title: 'Berge',
  subtitle: 'Tag eins',
  blocks: [
    { type: 'paragraph', text: 'Wir wanderten.' },
    { type: 'divider' },
  ],
  postDate: '2026-03-05T00:00:00.000Z',
  country: 'DE',
  placeName: 'Zugspitze',
  lat: 0,
  lng: 0,
  status: 'published',
  createdAt: '2026-03-05T00:00:00.000Z',
  updatedAt: '2026-03-05T00:00:00.000Z',
};

afterEach(() => vi.restoreAllMocks());

describe('Post', () => {
  it('renders the post with its blocks', async () => {
    vi.spyOn(api, 'publicPost').mockResolvedValue(full);
    render(Post, { params: { id: 'p1' } });
    expect(await screen.findByRole('heading', { level: 1, name: 'Berge' })).toBeInTheDocument();
    expect(screen.getByText('Tag eins')).toBeInTheDocument();
    expect(screen.getByText('Wir wanderten.')).toBeInTheDocument();
  });

  it('shows a not-found message on 404', async () => {
    vi.spyOn(api, 'publicPost').mockRejectedValue(new ApiError(404, 'post not found'));
    render(Post, { params: { id: 'x' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Beitrag nicht gefunden.');
  });

  it('shows a generic error otherwise', async () => {
    vi.spyOn(api, 'publicPost').mockRejectedValue(new Error('boom'));
    render(Post, { params: { id: 'x' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Fehler beim Laden.');
  });
});
