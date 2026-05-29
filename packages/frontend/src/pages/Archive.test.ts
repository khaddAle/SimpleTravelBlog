import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { PostDto } from '@stb/shared';
import { api } from '../lib/api.js';
import Archive from './Archive.svelte';

function post(id: string, country: string, tripId?: string): PostDto {
  return {
    id,
    title: id,
    blocks: [],
    postDate: '2026-01-01T00:00:00.000Z',
    country,
    placeName: 'Ort',
    lat: 0,
    lng: 0,
    status: 'published',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...(tripId ? { tripId } : {}),
  };
}

afterEach(() => vi.restoreAllMocks());

describe('Archive', () => {
  it('renders country and trip headings', async () => {
    vi.spyOn(api, 'publicPosts').mockResolvedValue({
      items: [post('a', 'DE', 't1'), post('b', 'FR')],
      page: 1,
      pageSize: 100,
      total: 2,
    });
    vi.spyOn(api, 'publicTrips').mockResolvedValue([{ id: 't1', name: 'Alpen' }]);
    render(Archive);
    expect(await screen.findByRole('heading', { level: 2, name: 'DE' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Alpen' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'FR' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 3, name: 'Einzelne Beiträge' }),
    ).toBeInTheDocument();
  });

  it('shows an empty message', async () => {
    vi.spyOn(api, 'publicPosts').mockResolvedValue({ items: [], page: 1, pageSize: 100, total: 0 });
    vi.spyOn(api, 'publicTrips').mockResolvedValue([]);
    render(Archive);
    expect(await screen.findByText('Noch keine Beiträge.')).toBeInTheDocument();
  });
});
