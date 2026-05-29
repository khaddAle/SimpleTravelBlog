import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { PostDto } from '@stb/shared';
import { api } from '../lib/api.js';
import Landing from './Landing.svelte';

function post(id: string, title: string): PostDto {
  return {
    id,
    title,
    blocks: [],
    postDate: '2026-03-05T00:00:00.000Z',
    country: 'DE',
    placeName: 'Ort',
    lat: 0,
    lng: 0,
    status: 'published',
    createdAt: '2026-03-05T00:00:00.000Z',
    updatedAt: '2026-03-05T00:00:00.000Z',
  };
}

afterEach(() => vi.restoreAllMocks());

describe('Landing', () => {
  it('renders posts from the public API', async () => {
    vi.spyOn(api, 'publicPosts').mockResolvedValue({
      items: [post('p1', 'Berge'), post('p2', 'Meer')],
      page: 1,
      pageSize: 12,
      total: 2,
    });
    render(Landing);
    expect(await screen.findByRole('link', { name: /Berge/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Meer/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Karte' })).toHaveAttribute('href', '#/karte');
  });

  it('shows an empty message when there are no posts', async () => {
    vi.spyOn(api, 'publicPosts').mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 12,
      total: 0,
    });
    render(Landing);
    expect(await screen.findByText('Noch keine Beiträge.')).toBeInTheDocument();
  });

  it('shows an error message when loading fails', async () => {
    vi.spyOn(api, 'publicPosts').mockRejectedValue(new Error('down'));
    render(Landing);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Beiträge konnten nicht geladen werden.',
    );
  });
});
