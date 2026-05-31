import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import type { PostDto } from '@stb/shared';
import { api } from '../lib/api.js';
import Search from './Search.svelte';

function post(id: string, title: string, over: Partial<PostDto> = {}): PostDto {
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
    ...over,
  };
}

const all = [
  post('p1', 'Berge', { country: 'AT', placeName: 'Zugspitze', postDate: '2026-05-12T00:00:00.000Z', tripId: 't1' }),
  post('p2', 'Meer', { country: 'DE', placeName: 'Sylt', postDate: '2026-03-02T00:00:00.000Z' }),
];

beforeEach(() => {
  vi.spyOn(api, 'publicPosts').mockResolvedValue({ items: all, page: 1, pageSize: 100, total: 2 });
  vi.spyOn(api, 'publicTrips').mockResolvedValue([{ id: 't1', name: 'Alpen' }]);
});
afterEach(() => vi.restoreAllMocks());

describe('Search', () => {
  it('renders the intro and marks the Suche nav item active', async () => {
    vi.spyOn(api, 'publicSearch').mockResolvedValue(all);
    render(Search);
    expect(await screen.findByText('Suche', { selector: '.eyebrow' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Beiträge filtern' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Suche' })).toHaveAttribute('aria-current', 'page');
  });

  it('populates the Land, Reise and month filters from the posts', async () => {
    vi.spyOn(api, 'publicSearch').mockResolvedValue(all);
    render(Search);
    // Countries sorted by German name: Deutschland before Österreich.
    expect(await screen.findByRole('option', { name: 'Deutschland' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Österreich' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Alle Länder' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Alpen' })).toBeInTheDocument();
    // Each month appears in both the Von and Bis selects.
    expect(screen.getAllByRole('option', { name: 'März 2026' })).toHaveLength(2);
    expect(screen.getAllByRole('option', { name: 'Mai 2026' })).toHaveLength(2);
  });

  it('runs an initial search spanning the full month range and shows the count', async () => {
    const search = vi.spyOn(api, 'publicSearch').mockResolvedValue(all);
    render(Search);
    await waitFor(() =>
      expect(search).toHaveBeenCalledWith(
        expect.objectContaining({
          from: '2026-03-01T00:00:00.000Z',
          to: '2026-05-31T23:59:59.999Z',
        }),
      ),
    );
    expect(await screen.findByText('2 Beiträge')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Berge/ })).toHaveAttribute('href', '#/beitrag/p1');
  });

  it('searches live as the text and country filters change', async () => {
    const user = userEvent.setup();
    const search = vi.spyOn(api, 'publicSearch').mockResolvedValue([all[0]!]);
    render(Search);
    await screen.findByRole('option', { name: 'Alpen' });

    await user.type(screen.getByLabelText('Text'), 'berge');
    await waitFor(() =>
      expect(search).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'berge' })),
    );

    await user.selectOptions(screen.getByLabelText('Land'), 'AT');
    await waitFor(() =>
      expect(search).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'berge', country: 'AT' })),
    );
  });

  it('resets the filters back to their defaults', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'publicSearch').mockResolvedValue(all);
    render(Search);
    await screen.findByRole('option', { name: 'Alpen' });

    const text = screen.getByLabelText('Text');
    await user.type(text, 'berge');
    expect(text).toHaveValue('berge');

    await user.click(screen.getByRole('button', { name: 'Zurücksetzen' }));
    expect(text).toHaveValue('');
  });

  it('shows an empty state when nothing matches', async () => {
    vi.spyOn(api, 'publicSearch').mockResolvedValue([]);
    render(Search);
    expect(await screen.findByText('Keine Beiträge gefunden')).toBeInTheDocument();
  });
});
