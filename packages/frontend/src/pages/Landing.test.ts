import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { PostDto } from '@stb/shared';
import { api } from '../lib/api.js';
import Landing from './Landing.svelte';

function post(id: string, title: string, over: Partial<PostDto> = {}): PostDto {
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
    ...over,
  };
}

afterEach(() => vi.restoreAllMocks());

describe('Landing', () => {
  it('renders the newest post as the hero teaser', async () => {
    vi.spyOn(api, 'publicPosts').mockResolvedValue({
      items: [
        post('p1', 'Drei Tage in den Dolomiten', {
          subtitle: 'Über Wolkengrenzen',
          country: 'IT',
          placeName: 'Südtirol',
          blocks: [{ type: 'image', imageId: 'img1' }],
        }),
        post('p2', 'Hallstatt'),
      ],
      page: 1,
      pageSize: 12,
      total: 2,
    });
    render(Landing);

    expect(await screen.findByText('Neuester Beitrag')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Drei Tage in den Dolomiten' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Über Wolkengrenzen')).toBeInTheDocument();
    expect(screen.getByText(/Südtirol, Italien/)).toBeInTheDocument();

    const weiterlesen = screen.getByRole('link', { name: /Weiterlesen/ });
    expect(weiterlesen).toHaveAttribute('href', '#/beitrag/p1');

    const heroPhoto = screen.getByRole('link', { name: 'Drei Tage in den Dolomiten' });
    expect(heroPhoto).toHaveAttribute('href', '#/beitrag/p1');
    expect(heroPhoto.querySelector('.photo .frame.r54 img')).toHaveAttribute(
      'src',
      '/api/public/images/img1/display',
    );
  });

  it('lists the remaining posts in the "Weitere Reisen" grid', async () => {
    vi.spyOn(api, 'publicPosts').mockResolvedValue({
      items: [post('p1', 'Dolomiten'), post('p2', 'Hallstatt'), post('p3', 'Bergen')],
      page: 1,
      pageSize: 12,
      total: 3,
    });
    const { container } = render(Landing);

    expect(await screen.findByText('Weitere Reisen')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Hallstatt/ })).toHaveAttribute('href', '#/beitrag/p2');
    expect(screen.getByRole('link', { name: /Bergen/ })).toHaveAttribute('href', '#/beitrag/p3');

    const moreLink = container.querySelector('.section-head a');
    expect(moreLink).toHaveAttribute('href', '#/archiv');
    expect(moreLink?.textContent).toContain('Alle Beiträge');
  });

  it('hides the grid section when only the hero post exists', async () => {
    vi.spyOn(api, 'publicPosts').mockResolvedValue({
      items: [post('p1', 'Einsam')],
      page: 1,
      pageSize: 12,
      total: 1,
    });
    render(Landing);
    expect(await screen.findByText('Neuester Beitrag')).toBeInTheDocument();
    expect(screen.queryByText('Weitere Reisen')).not.toBeInTheDocument();
  });

  it('shows the Karte link in the site header', () => {
    vi.spyOn(api, 'publicPosts').mockResolvedValue({ items: [], page: 1, pageSize: 12, total: 0 });
    render(Landing);
    expect(screen.getByRole('link', { name: 'Karte' })).toHaveAttribute('href', '#/karte');
  });

  it('shows an empty message when there are no posts', async () => {
    vi.spyOn(api, 'publicPosts').mockResolvedValue({ items: [], page: 1, pageSize: 12, total: 0 });
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
