import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import type { PostDto } from '@stb/shared';
import { api } from '../lib/api.js';
import Archive from './Archive.svelte';

function post(id: string, country: string, over: Partial<PostDto> = {}): PostDto {
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
    ...over,
  };
}

afterEach(() => vi.restoreAllMocks());

describe('Archive', () => {
  it('renders the page intro and a summary of countries and posts', async () => {
    vi.spyOn(api, 'publicPosts').mockResolvedValue({
      items: [post('a', 'DE', { tripId: 't1' }), post('b', 'FR')],
      page: 1,
      pageSize: 100,
      total: 2,
    });
    vi.spyOn(api, 'publicTrips').mockResolvedValue([{ id: 't1', name: 'Alpen' }]);
    render(Archive);

    expect(await screen.findByText('Archiv', { selector: '.eyebrow' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Nach Ländern & Reisen' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('2 Beiträge aus 2 Ländern, gegliedert nach Reisen.'),
    ).toBeInTheDocument();
  });

  it('groups posts by country (German name) and by trip', async () => {
    vi.spyOn(api, 'publicPosts').mockResolvedValue({
      items: [post('a', 'DE', { tripId: 't1' }), post('b', 'FR')],
      page: 1,
      pageSize: 100,
      total: 2,
    });
    vi.spyOn(api, 'publicTrips').mockResolvedValue([{ id: 't1', name: 'Alpen' }]);
    render(Archive);

    expect(await screen.findByRole('heading', { level: 2, name: 'Deutschland' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Frankreich' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Alpen' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 3, name: 'Einzelne Beiträge' }),
    ).toBeInTheDocument();
  });

  it('renders a post row with thumbnail, title, place and date, linking to the post', async () => {
    vi.spyOn(api, 'publicPosts').mockResolvedValue({
      items: [
        post('a', 'IT', {
          title: 'Drei Tage in den Dolomiten',
          placeName: 'Südtirol',
          postDate: '2026-05-12T00:00:00.000Z',
          blocks: [{ type: 'image', imageId: 'img1' }],
        }),
      ],
      page: 1,
      pageSize: 100,
      total: 1,
    });
    vi.spyOn(api, 'publicTrips').mockResolvedValue([]);
    render(Archive);

    const row = await screen.findByRole('link', { name: /Drei Tage in den Dolomiten/ });
    expect(row).toHaveAttribute('href', '#/beitrag/a');
    expect(
      screen.getByRole('heading', { level: 4, name: 'Drei Tage in den Dolomiten' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Südtirol, Italien')).toBeInTheDocument();
    expect(screen.getByText('12. Mai 2026')).toBeInTheDocument();
    expect(row.querySelector('.thumb .photo .frame.r43 img')).toHaveAttribute(
      'src',
      '/api/public/images/img1/thumb',
    );
  });

  it('shows the per-country post count', async () => {
    vi.spyOn(api, 'publicPosts').mockResolvedValue({
      items: [post('a', 'DE'), post('b', 'DE'), post('c', 'FR')],
      page: 1,
      pageSize: 100,
      total: 3,
    });
    vi.spyOn(api, 'publicTrips').mockResolvedValue([]);
    render(Archive);

    expect(await screen.findByText('2 Beiträge')).toBeInTheDocument();
    expect(screen.getByText('1 Beitrag')).toBeInTheDocument();
  });

  it('marks the Archiv item active in the site header', async () => {
    vi.spyOn(api, 'publicPosts').mockResolvedValue({ items: [], page: 1, pageSize: 100, total: 0 });
    vi.spyOn(api, 'publicTrips').mockResolvedValue([]);
    render(Archive);
    expect(screen.getByRole('link', { name: 'Archiv' })).toHaveAttribute('aria-current', 'page');
  });

  it('shows an empty message', async () => {
    vi.spyOn(api, 'publicPosts').mockResolvedValue({ items: [], page: 1, pageSize: 100, total: 0 });
    vi.spyOn(api, 'publicTrips').mockResolvedValue([]);
    render(Archive);
    expect(await screen.findByText('Noch keine Beiträge.')).toBeInTheDocument();
  });

  it('shows "Mehr laden" with a progress counter and appends the next page', async () => {
    const user = userEvent.setup();
    const pp = vi
      .spyOn(api, 'publicPosts')
      .mockResolvedValueOnce({ items: [post('a', 'DE')], page: 1, pageSize: 20, total: 2 })
      .mockResolvedValueOnce({ items: [post('b', 'FR')], page: 2, pageSize: 20, total: 2 });
    vi.spyOn(api, 'publicTrips').mockResolvedValue([]);
    render(Archive);

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Deutschland' }),
    ).toBeInTheDocument();
    expect(pp).toHaveBeenLastCalledWith(1, 20);
    expect(screen.getByText('1 von 2 Beiträgen')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Mehr laden' }));

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Frankreich' }),
    ).toBeInTheDocument();
    expect(pp).toHaveBeenLastCalledWith(2, 20);
    // Everything is loaded now → the button disappears.
    expect(screen.queryByRole('button', { name: 'Mehr laden' })).toBeNull();
  });

  it('hides "Mehr laden" when the first page already holds everything', async () => {
    vi.spyOn(api, 'publicPosts').mockResolvedValue({
      items: [post('a', 'DE')],
      page: 1,
      pageSize: 20,
      total: 1,
    });
    vi.spyOn(api, 'publicTrips').mockResolvedValue([]);
    render(Archive);
    await screen.findByRole('heading', { level: 2, name: 'Deutschland' });
    expect(screen.queryByRole('button', { name: 'Mehr laden' })).toBeNull();
  });
});
