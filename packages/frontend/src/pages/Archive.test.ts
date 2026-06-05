import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import type { PublicPostHead } from '@stb/shared';
import { api } from '../lib/api.js';
import { archiveState } from '../lib/archiveState.svelte.js';
import Archive from './Archive.svelte';

function post(id: string, over: Partial<PublicPostHead> = {}): PublicPostHead {
  return {
    id,
    title: id,
    postDate: '2026-01-01T00:00:00.000Z',
    country: 'DE',
    placeName: 'Ort',
    ...over,
  };
}

const dolomiten = post('a', {
  title: 'Drei Tage in den Dolomiten',
  placeName: 'Südtirol',
  country: 'IT',
  postDate: '2026-05-12T00:00:00.000Z',
  tripId: 't1',
  coverImageId: 'img1',
});
const hallstatt = post('b', {
  title: 'Morgenlicht über Hallstatt',
  country: 'DE',
  postDate: '2026-01-01T00:00:00.000Z',
  tripId: 't2',
});

// Reset the persisted store and the deep-link hash before every test so each
// starts from the "first visit" baseline (all closed, reise mode).
beforeEach(() => {
  sessionStorage.clear();
  window.location.hash = '#/archiv';
  archiveState.setMode('reise');
  archiveState.collapseAll('reise');
  archiveState.collapseAll('land');
  archiveState.collapseAll('jahr');
});

afterEach(() => vi.restoreAllMocks());

function mock(heads: PublicPostHead[]) {
  const heads$ = vi.spyOn(api, 'publicPostHeads').mockResolvedValue(heads);
  vi.spyOn(api, 'publicTrips').mockResolvedValue([
    { id: 't1', name: 'Alpen' },
    { id: 't2', name: 'Nordsee' },
  ]);
  return heads$;
}

describe('Archive', () => {
  it('renders the intro and the grouping toggle', async () => {
    mock([dolomiten, hallstatt]);
    render(Archive);

    expect(await screen.findByText('Archiv', { selector: '.eyebrow' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Alle Beiträge' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nach Reise' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nach Land' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nach Jahr' })).toBeInTheDocument();
  });

  it('groups by trip with every group closed on first visit', async () => {
    mock([dolomiten, hallstatt]);
    render(Archive);

    // Both group headers render but neither group's posts are shown.
    expect(await screen.findByRole('button', { name: /Alpen/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Nordsee/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Drei Tage in den Dolomiten/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /Morgenlicht über Hallstatt/ })).toBeNull();
  });

  it('keeps multiple groups open at once (multi-open)', async () => {
    const user = userEvent.setup();
    mock([dolomiten, hallstatt]);
    render(Archive);

    await user.click(await screen.findByRole('button', { name: /Alpen/ }));
    await user.click(screen.getByRole('button', { name: /Nordsee/ }));

    // Both stay open.
    expect(
      await screen.findByRole('link', { name: /Drei Tage in den Dolomiten/ }),
    ).toHaveAttribute('href', '#/beitrag/a');
    expect(
      screen.getByRole('link', { name: /Morgenlicht über Hallstatt/ }),
    ).toBeInTheDocument();
  });

  it('rotates the chevron of an open group', async () => {
    const user = userEvent.setup();
    mock([dolomiten, hallstatt]);
    const { container } = render(Archive);

    await screen.findByRole('button', { name: /Alpen/ });
    expect(container.querySelectorAll('.chev.open')).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: /Alpen/ }));
    expect(container.querySelectorAll('.chev.open')).toHaveLength(1);
  });

  it('toggles the bulk ausklappen/einklappen disabled state with open count', async () => {
    const user = userEvent.setup();
    mock([dolomiten, hallstatt]);
    render(Archive);

    const aus = await screen.findByRole('button', { name: 'Alle ausklappen' });
    const ein = screen.getByRole('button', { name: 'Alle einklappen' });

    // None open → einklappen disabled, ausklappen enabled.
    expect(ein).toBeDisabled();
    expect(aus).toBeEnabled();

    // One of two open → mixed → both enabled.
    await user.click(screen.getByRole('button', { name: /Alpen/ }));
    expect(aus).toBeEnabled();
    expect(ein).toBeEnabled();

    // All open via the bulk control → ausklappen disabled.
    await user.click(aus);
    expect(aus).toBeDisabled();
    expect(ein).toBeEnabled();
    expect(screen.getByRole('link', { name: /Morgenlicht über Hallstatt/ })).toBeInTheDocument();

    // Collapse all → einklappen disabled again.
    await user.click(ein);
    expect(ein).toBeDisabled();
    expect(screen.queryByRole('link', { name: /Drei Tage in den Dolomiten/ })).toBeNull();
  });

  it('restores the mode and open groups after a remount', async () => {
    const user = userEvent.setup();
    mock([dolomiten, hallstatt]);
    const first = render(Archive);

    await user.click(await screen.findByRole('button', { name: /Nordsee/ }));
    expect(
      await screen.findByRole('link', { name: /Morgenlicht über Hallstatt/ }),
    ).toBeInTheDocument();
    first.unmount();

    // Remounting (e.g. after visiting a post and navigating back) keeps Nordsee open.
    mock([dolomiten, hallstatt]);
    render(Archive);
    expect(
      await screen.findByRole('link', { name: /Morgenlicht über Hallstatt/ }),
    ).toBeInTheDocument();
  });

  it('opens the deep-linked reise in reise mode (?reise=)', async () => {
    window.location.hash = '#/archiv?reise=t2';
    mock([dolomiten, hallstatt]);
    render(Archive);

    // t2 is Nordsee — its post renders without any clicks, in reise mode.
    expect(
      await screen.findByRole('link', { name: /Morgenlicht über Hallstatt/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nach Reise' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('regroups by country on mode switch without a refetch', async () => {
    const user = userEvent.setup();
    const heads$ = mock([dolomiten, hallstatt]);
    render(Archive);

    await screen.findByRole('button', { name: /Alpen/ });
    await user.click(screen.getByRole('button', { name: 'Nach Land' }));

    expect(await screen.findByRole('button', { name: /Italien/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Deutschland/ })).toBeInTheDocument();
    // Pure client-side regroup — the heads were fetched exactly once.
    expect(heads$).toHaveBeenCalledTimes(1);
  });

  it('groups by year when "Nach Jahr" is chosen', async () => {
    const user = userEvent.setup();
    mock([
      post('x', { postDate: '2024-06-01T00:00:00.000Z' }),
      post('y', { postDate: '2026-03-01T00:00:00.000Z' }),
    ]);
    render(Archive);

    await screen.findByRole('button', { name: 'Nach Jahr' });
    await user.click(screen.getByRole('button', { name: 'Nach Jahr' }));
    expect(await screen.findByRole('button', { name: /2026/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /2024/ })).toBeInTheDocument();
  });

  it('pins the "Ohne Reise" bucket to the bottom', async () => {
    mock([
      post('lonely', { postDate: '2026-09-01T00:00:00.000Z' }),
      dolomiten,
    ]);
    render(Archive);

    await screen.findByRole('button', { name: /Alpen/ });
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings[headings.length - 1]).toContain('Ohne Reise');
  });

  it('renders a post row with thumbnail, place and date', async () => {
    const user = userEvent.setup();
    mock([dolomiten]);
    const { container } = render(Archive);

    await user.click(await screen.findByRole('button', { name: /Alpen/ }));
    const row = await screen.findByRole('link', { name: /Drei Tage in den Dolomiten/ });
    expect(row).toHaveAttribute('href', '#/beitrag/a');
    expect(screen.getByText('Südtirol, Italien')).toBeInTheDocument();
    expect(screen.getByText('12. Mai 2026')).toBeInTheDocument();
    expect(container.querySelector('.thumb .photo .frame.r43 img')).toHaveAttribute(
      'src',
      '/api/public/images/img1/thumb',
    );
  });

  it('marks the Archiv item active in the site header', async () => {
    mock([]);
    render(Archive);
    expect(screen.getByRole('link', { name: 'Archiv' })).toHaveAttribute('aria-current', 'page');
  });

  it('shows an empty message', async () => {
    mock([]);
    render(Archive);
    expect(await screen.findByText('Noch keine Beiträge.')).toBeInTheDocument();
  });
});
