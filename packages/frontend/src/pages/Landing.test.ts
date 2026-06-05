import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { PublicPostHead } from '@stb/shared';
import { api } from '../lib/api.js';
import Landing from './Landing.svelte';

function post(id: string, title: string, over: Partial<PublicPostHead> = {}): PublicPostHead {
  return {
    id,
    title,
    postDate: '2026-03-05T00:00:00.000Z',
    country: 'DE',
    placeName: 'Ort',
    ...over,
  };
}

afterEach(() => vi.restoreAllMocks());

describe('Landing', () => {
  it('renders the newest post as the hero teaser', async () => {
    vi.spyOn(api, 'publicPostHeads').mockResolvedValue([
      post('p1', 'Drei Tage in den Dolomiten', {
        subtitle: 'Über Wolkengrenzen',
        country: 'IT',
        placeName: 'Südtirol',
        coverImageId: 'img1',
      }),
      post('p2', 'Hallstatt'),
    ]);
    render(Landing);

    expect(await screen.findByText('Neuester Beitrag')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Drei Tage in den Dolomiten' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Über Wolkengrenzen')).toBeInTheDocument();
    expect(screen.getByText(/Südtirol, Italien/)).toBeInTheDocument();

    // The hero CTA is now a filled primary button.
    const weiterlesen = screen.getByRole('link', { name: /Weiterlesen/ });
    expect(weiterlesen).toHaveAttribute('href', '#/beitrag/p1');
    expect(weiterlesen).toHaveClass('btn', 'primary');

    // The centered hero photo is now a wide 16:9 print.
    const heroPhoto = screen.getByRole('link', { name: 'Drei Tage in den Dolomiten' });
    expect(heroPhoto).toHaveAttribute('href', '#/beitrag/p1');
    expect(heroPhoto.querySelector('.photo .frame.r169 img')).toHaveAttribute(
      'src',
      '/api/public/images/img1/display',
    );
  });

  it('lists the remaining posts and shows the archive button below the grid', async () => {
    vi.spyOn(api, 'publicPostHeads').mockResolvedValue([
      post('p1', 'Dolomiten'),
      post('p2', 'Hallstatt'),
      post('p3', 'Bergen'),
    ]);
    const { container } = render(Landing);

    expect(await screen.findByText('Weitere Reisen')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Hallstatt/ })).toHaveAttribute('href', '#/beitrag/p2');
    expect(screen.getByRole('link', { name: /Bergen/ })).toHaveAttribute('href', '#/beitrag/p3');

    // The inline "Alle Beiträge →" link is gone from the section head.
    expect(container.querySelector('.section-head a')).toBeNull();

    // The only archive affordance is a centered button directly under the grid.
    const archive = container.querySelector('.post-grid + .more-foot a');
    expect(archive).not.toBeNull();
    expect(archive).toHaveClass('btn');
    expect(archive).toHaveAttribute('href', '#/archiv');
    expect(archive?.textContent).toContain('Alle Reisen im Archiv');
  });

  it('requests ten heads — one hero plus a full 3×3 grid, no trailing lonely post', async () => {
    const spy = vi.spyOn(api, 'publicPostHeads').mockResolvedValue([]);
    render(Landing);
    expect(spy).toHaveBeenCalledWith(10);
  });

  it('hides the grid section when only the hero post exists', async () => {
    vi.spyOn(api, 'publicPostHeads').mockResolvedValue([post('p1', 'Einsam')]);
    render(Landing);
    expect(await screen.findByText('Neuester Beitrag')).toBeInTheDocument();
    expect(screen.queryByText('Weitere Reisen')).not.toBeInTheDocument();
  });

  it('shows the Karte link in the site header', () => {
    vi.spyOn(api, 'publicPostHeads').mockResolvedValue([]);
    render(Landing);
    expect(screen.getByRole('link', { name: 'Karte' })).toHaveAttribute('href', '#/karte');
  });

  it('shows an empty message when there are no posts', async () => {
    vi.spyOn(api, 'publicPostHeads').mockResolvedValue([]);
    render(Landing);
    expect(await screen.findByText('Noch keine Beiträge.')).toBeInTheDocument();
  });

  it('shows an error message when loading fails', async () => {
    vi.spyOn(api, 'publicPostHeads').mockRejectedValue(new Error('down'));
    render(Landing);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Beiträge konnten nicht geladen werden.',
    );
  });
});
