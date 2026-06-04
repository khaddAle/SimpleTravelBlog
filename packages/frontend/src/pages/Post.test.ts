import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { PostDto, PublicPostHead } from '@stb/shared';
import { api, ApiError } from '../lib/api.js';
import Post from './Post.svelte';

const full: PostDto = {
  id: 'p1',
  title: 'Drei Tage in den Dolomiten',
  subtitle: 'Über Wolkengrenzen',
  blocks: [
    { type: 'image', imageId: 'lead', caption: 'Der erste Morgen' },
    { type: 'paragraph', text: 'Wir sind im Dunkeln aufgebrochen.' },
    { type: 'divider' },
  ],
  postDate: '2026-05-12T00:00:00.000Z',
  country: 'IT',
  placeName: 'Südtirol',
  lat: 0,
  lng: 0,
  status: 'published',
  createdAt: '2026-05-12T00:00:00.000Z',
  updatedAt: '2026-05-12T00:00:00.000Z',
};

const older: PostDto = {
  ...full,
  id: 'p2',
  title: 'Morgenlicht über Hallstatt',
  subtitle: undefined,
  blocks: [],
  postDate: '2026-04-28T00:00:00.000Z',
};

// The next-post lookup uses lightweight heads; full posts are a structural superset.
const heads = (...posts: PostDto[]): PublicPostHead[] => posts;

afterEach(() => vi.restoreAllMocks());

describe('Post', () => {
  it('renders the article head with eyebrow, title, subtitle and date', async () => {
    vi.spyOn(api, 'publicPost').mockResolvedValue(full);
    vi.spyOn(api, 'publicPostHeads').mockResolvedValue(heads(full, older));
    render(Post, { params: { id: 'p1' } });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Drei Tage in den Dolomiten' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Südtirol, Italien')).toBeInTheDocument();
    expect(screen.getByText('Über Wolkengrenzen')).toBeInTheDocument();
    expect(screen.getByText('12. Mai 2026')).toBeInTheDocument();
  });

  it('renders the blocks, with the first image as a wide bleed lead', async () => {
    vi.spyOn(api, 'publicPost').mockResolvedValue(full);
    vi.spyOn(api, 'publicPostHeads').mockResolvedValue(heads(full));
    const { container } = render(Post, { params: { id: 'p1' } });

    await screen.findByRole('heading', { level: 1 });
    expect(screen.getByText('Wir sind im Dunkeln aufgebrochen.')).toBeInTheDocument();
    expect(container.querySelector('figure.bleed.block .frame.r169 img')).toHaveAttribute(
      'src',
      '/api/public/images/lead/display',
    );
    expect(container.querySelector('.divider-block')).not.toBeNull();
  });

  it('links to the next (older) post in the article navigation', async () => {
    vi.spyOn(api, 'publicPost').mockResolvedValue(full);
    vi.spyOn(api, 'publicPostHeads').mockResolvedValue(heads(full, older));
    render(Post, { params: { id: 'p1' } });

    const next = await screen.findByRole('link', { name: /Morgenlicht über Hallstatt/ });
    expect(next).toHaveAttribute('href', '#/beitrag/p2');
  });

  it('omits the next-post link when the post is the oldest', async () => {
    vi.spyOn(api, 'publicPost').mockResolvedValue(full);
    vi.spyOn(api, 'publicPostHeads').mockResolvedValue(heads(full));
    render(Post, { params: { id: 'p1' } });

    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByText('Nächster Beitrag')).toBeNull();
    // The archive fallback link is always present.
    expect(screen.getAllByRole('link', { name: /Alle Beiträge/ }).length).toBeGreaterThan(0);
  });

  it('still renders even if the post list (next link) cannot be loaded', async () => {
    vi.spyOn(api, 'publicPost').mockResolvedValue(full);
    vi.spyOn(api, 'publicPostHeads').mockRejectedValue(new Error('boom'));
    render(Post, { params: { id: 'p1' } });

    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.queryByText('Nächster Beitrag')).toBeNull();
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

  it('renders the shared header and footer', () => {
    vi.spyOn(api, 'publicPost').mockResolvedValue(full);
    vi.spyOn(api, 'publicPostHeads').mockResolvedValue(heads(full));
    render(Post, { params: { id: 'p1' } });
    expect(screen.getByRole('link', { name: 'Karte' })).toHaveAttribute('href', '#/karte');
  });
});
