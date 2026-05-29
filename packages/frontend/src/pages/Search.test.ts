import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import type { PostDto } from '@stb/shared';
import { api } from '../lib/api.js';
import Search from './Search.svelte';

function post(id: string, title: string): PostDto {
  return {
    id,
    title,
    blocks: [],
    postDate: '2026-01-01T00:00:00.000Z',
    country: 'DE',
    placeName: 'Ort',
    lat: 0,
    lng: 0,
    status: 'published',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

beforeEach(() => {
  vi.spyOn(api, 'publicTrips').mockResolvedValue([{ id: 't1', name: 'Alpen' }]);
});
afterEach(() => vi.restoreAllMocks());

describe('Search', () => {
  it('runs a search and renders results', async () => {
    const user = userEvent.setup();
    const search = vi.spyOn(api, 'publicSearch').mockResolvedValue([post('p1', 'Berge')]);
    render(Search);
    await screen.findByRole('option', { name: 'Alpen' });

    await user.type(screen.getByLabelText('Suchbegriff'), 'berge');
    await user.type(screen.getByLabelText('Land'), 'de');
    await user.click(screen.getByRole('button', { name: 'Suchen' }));

    await waitFor(() => {
      expect(search).toHaveBeenCalledWith(expect.objectContaining({ q: 'berge', country: 'DE' }));
    });
    expect(await screen.findByRole('link', { name: /Berge/ })).toBeInTheDocument();
  });

  it('shows a no-results message', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'publicSearch').mockResolvedValue([]);
    render(Search);
    await screen.findByRole('option', { name: 'Alpen' });
    await user.click(screen.getByRole('button', { name: 'Suchen' }));
    expect(await screen.findByText('Keine Treffer.')).toBeInTheDocument();
  });
});
