import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { PostDto, PublicPostHead, TripDto } from '@stb/shared';
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

const newer: PostDto = {
  ...full,
  id: 'p0',
  title: 'Abendrot am Gardasee',
  subtitle: undefined,
  blocks: [],
  postDate: '2026-06-01T00:00:00.000Z',
};

// The next-post lookup uses lightweight heads; full posts are a structural superset.
// Heads are served newest → oldest (postDate desc), matching the backend route.
const heads = (...posts: PostDto[]): PublicPostHead[] => posts;

// publicTrips is best-effort (drives the `Reise:` source link); default to none.
function stubTrips(trips: TripDto[] = []): void {
  vi.spyOn(api, 'publicTrips').mockResolvedValue(trips);
}

afterEach(() => vi.restoreAllMocks());

describe('Post', () => {
  it('renders the article head with eyebrow, title, subtitle and date', async () => {
    vi.spyOn(api, 'publicPost').mockResolvedValue(full);
    vi.spyOn(api, 'publicPostHeads').mockResolvedValue(heads(full, older));
    stubTrips();
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
    stubTrips();
    const { container } = render(Post, { params: { id: 'p1' } });

    await screen.findByRole('heading', { level: 1 });
    expect(screen.getByText('Wir sind im Dunkeln aufgebrochen.')).toBeInTheDocument();
    expect(container.querySelector('figure.bleed.block .frame.r169 img')).toHaveAttribute(
      'src',
      '/api/public/images/lead/display',
    );
    expect(container.querySelector('.divider-block')).not.toBeNull();
  });

  it('shows only the next (older) post when viewing the newest post', async () => {
    vi.spyOn(api, 'publicPost').mockResolvedValue(full);
    vi.spyOn(api, 'publicPostHeads').mockResolvedValue(heads(full, older));
    stubTrips();
    render(Post, { params: { id: 'p1' } });

    const next = await screen.findByRole('link', { name: /Morgenlicht über Hallstatt/ });
    expect(next).toHaveAttribute('href', '#/beitrag/p2');
    expect(screen.getByText('Nächster Beitrag')).toBeInTheDocument();
    // Newest post ⇒ no newer neighbour.
    expect(screen.queryByText('Vorheriger Beitrag')).toBeNull();
  });

  it('shows only the previous (newer) post when viewing the oldest post', async () => {
    vi.spyOn(api, 'publicPost').mockResolvedValue(older);
    vi.spyOn(api, 'publicPostHeads').mockResolvedValue(heads(full, older));
    stubTrips();
    render(Post, { params: { id: 'p2' } });

    const prev = await screen.findByRole('link', { name: /Drei Tage in den Dolomiten/ });
    expect(prev).toHaveAttribute('href', '#/beitrag/p1');
    expect(screen.getByText('Vorheriger Beitrag')).toBeInTheDocument();
    expect(screen.queryByText('Nächster Beitrag')).toBeNull();
  });

  it('shows both neighbours, with correct directions, for a middle post', async () => {
    vi.spyOn(api, 'publicPost').mockResolvedValue(full);
    vi.spyOn(api, 'publicPostHeads').mockResolvedValue(heads(newer, full, older));
    stubTrips();
    render(Post, { params: { id: 'p1' } });

    await screen.findByRole('heading', { level: 1 });
    // Vorheriger = the newer post (one step up the newest→oldest list).
    const prev = screen.getByRole('link', { name: /Abendrot am Gardasee/ });
    expect(prev).toHaveAttribute('href', '#/beitrag/p0');
    // Nächster = the older post (one step down).
    const next = screen.getByRole('link', { name: /Morgenlicht über Hallstatt/ });
    expect(next).toHaveAttribute('href', '#/beitrag/p2');
    expect(screen.getByText('Vorheriger Beitrag')).toBeInTheDocument();
    expect(screen.getByText('Nächster Beitrag')).toBeInTheDocument();
  });

  it('renders a Reise source link when the post belongs to a trip', async () => {
    vi.spyOn(api, 'publicPost').mockResolvedValue({ ...full, tripId: 't9' });
    vi.spyOn(api, 'publicPostHeads').mockResolvedValue(heads(full));
    stubTrips([{ id: 't9', name: 'Alpenüberquerung' }]);
    render(Post, { params: { id: 'p1' } });

    const reise = await screen.findByRole('link', { name: /Alpenüberquerung/ });
    expect(reise).toHaveTextContent('Reise: Alpenüberquerung');
    expect(reise).toHaveAttribute('href', '#/archiv?reise=t9');
  });

  it('omits the Reise link when the post has no trip', async () => {
    vi.spyOn(api, 'publicPost').mockResolvedValue(full);
    vi.spyOn(api, 'publicPostHeads').mockResolvedValue(heads(full));
    stubTrips([{ id: 't9', name: 'Alpenüberquerung' }]);
    render(Post, { params: { id: 'p1' } });

    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByText(/^Reise:/)).toBeNull();
  });

  it('still renders even if the post list (neighbour/Reise links) cannot be loaded', async () => {
    vi.spyOn(api, 'publicPost').mockResolvedValue({ ...full, tripId: 't9' });
    vi.spyOn(api, 'publicPostHeads').mockRejectedValue(new Error('boom'));
    vi.spyOn(api, 'publicTrips').mockRejectedValue(new Error('boom'));
    render(Post, { params: { id: 'p1' } });

    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.queryByText('Nächster Beitrag')).toBeNull();
    expect(screen.queryByText('Vorheriger Beitrag')).toBeNull();
    expect(screen.queryByText(/^Reise:/)).toBeNull();
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
    stubTrips();
    render(Post, { params: { id: 'p1' } });
    expect(screen.getByRole('link', { name: 'Karte' })).toHaveAttribute('href', '#/karte');
  });
});
