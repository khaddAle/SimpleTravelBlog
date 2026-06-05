import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/svelte';
import L from 'leaflet';
import { api } from '../lib/api.js';
import MapPage from './MapPage.svelte';

// Tests can swap in a tighter viewport by reassigning `viewport.contains`.
const viewport = vi.hoisted(() => ({ contains: (_latlng: [number, number]): boolean => true }));

vi.mock('leaflet', () => {
  const bounds = { pad: vi.fn().mockReturnThis(), contains: (ll: [number, number]) => viewport.contains(ll) };
  const map = {
    setView: vi.fn().mockReturnThis(),
    fitBounds: vi.fn().mockReturnThis(),
    on: vi.fn().mockReturnThis(),
    getBounds: vi.fn(() => bounds),
    removeLayer: vi.fn().mockReturnThis(),
    remove: vi.fn(),
  };
  const makeMarker = () => {
    const el = document.createElement('div');
    return {
      addTo: vi.fn().mockReturnThis(),
      bindPopup: vi.fn().mockReturnThis(),
      on: vi.fn().mockReturnThis(),
      getElement: vi.fn(() => el),
    };
  };
  return {
    default: {
      map: vi.fn(() => map),
      tileLayer: vi.fn(() => ({ addTo: vi.fn().mockReturnThis() })),
      divIcon: vi.fn(() => ({})),
      marker: vi.fn(() => makeMarker()),
      featureGroup: vi.fn(() => ({ getBounds: vi.fn(() => bounds) })),
    },
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  viewport.contains = () => true;
  // The Reise dropdown loads trips on mount; default to none so existing specs
  // (which only care about markers) don't have to stub it.
  vi.spyOn(api, 'publicTrips').mockResolvedValue([]);
});
afterEach(() => vi.restoreAllMocks());

const points = [
  { id: 'p1', title: 'Berge', lat: 47, lng: 11, country: 'AT', placeName: 'Zugspitze', tripId: 't1' },
  { id: 'p2', title: 'Meer', lat: 54, lng: 8, country: 'DE', placeName: 'Sylt', tripId: 't2' },
];
const mapData = (over = {}) => ({ points, unlocatedCount: 0, ...over });
const trips = [
  { id: 't1', name: 'Alpen', postCount: 1 },
  { id: 't2', name: 'Nordsee', postCount: 1 },
];

describe('MapPage', () => {
  it('renders the page intro', async () => {
    vi.spyOn(api, 'publicMap').mockResolvedValue(mapData());
    render(MapPage);
    expect(await screen.findByText('Karte', { selector: '.eyebrow' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Wo wir waren' })).toBeInTheDocument();
    expect(screen.getByText(/Jeder Punkt ein Beitrag/)).toBeInTheDocument();
  });

  it('marks the Karte item active in the site header', async () => {
    vi.spyOn(api, 'publicMap').mockResolvedValue(mapData({ points: [] }));
    render(MapPage);
    expect(screen.getByRole('link', { name: 'Karte' })).toHaveAttribute('aria-current', 'page');
  });

  it('lists every place with an ordinal, title, place and German country, linking to the post', async () => {
    vi.spyOn(api, 'publicMap').mockResolvedValue(mapData());
    render(MapPage);

    const row = await screen.findByRole('link', { name: /Berge/ });
    expect(row).toHaveAttribute('href', '#/beitrag/p1');
    expect(row).toHaveTextContent('1');
    expect(row).toHaveTextContent('Zugspitze, Österreich');
    expect(screen.getByRole('heading', { level: 4, name: 'Berge' })).toBeInTheDocument();
    expect(screen.getByText('Im Kartenausschnitt')).toBeInTheDocument();
  });

  it('builds the Leaflet map, drops a marker per point and fits the view to them', async () => {
    vi.spyOn(api, 'publicMap').mockResolvedValue(mapData());
    render(MapPage);
    await waitFor(() => {
      expect(L.map).toHaveBeenCalled();
      expect(L.tileLayer).toHaveBeenCalled();
      expect(L.marker).toHaveBeenCalledTimes(2);
      expect(L.featureGroup).toHaveBeenCalled();
    });
    const mapInstance = (L.map as unknown as { mock: { results: { value: { fitBounds: ReturnType<typeof vi.fn> } }[] } }).mock.results[0]!.value;
    expect(mapInstance.fitBounds).toHaveBeenCalled();
  });

  it('shows a count of posts without a location, never as map markers', async () => {
    vi.spyOn(api, 'publicMap').mockResolvedValue(mapData({ unlocatedCount: 3 }));
    render(MapPage);
    expect(await screen.findByText('3 Beiträge ohne Ort')).toBeInTheDocument();
    // Only the two located points get markers — the three unlocated ones do not.
    expect(L.marker).toHaveBeenCalledTimes(2);
  });

  it('uses the singular wording for a single unlocated post', async () => {
    vi.spyOn(api, 'publicMap').mockResolvedValue(mapData({ unlocatedCount: 1 }));
    render(MapPage);
    expect(await screen.findByText('1 Beitrag ohne Ort')).toBeInTheDocument();
  });

  it('omits the unlocated note when every post has a location', async () => {
    vi.spyOn(api, 'publicMap').mockResolvedValue(mapData());
    render(MapPage);
    await screen.findByText('Im Kartenausschnitt');
    expect(screen.queryByText(/ohne Ort/)).not.toBeInTheDocument();
  });

  it('lists only the points inside the current viewport and counts the rest', async () => {
    // Only the first point (lat 47) sits inside this fake viewport.
    viewport.contains = ([lat]) => lat === 47;
    vi.spyOn(api, 'publicMap').mockResolvedValue(mapData());
    render(MapPage);

    expect(await screen.findByRole('heading', { level: 4, name: 'Berge' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 4, name: 'Meer' })).toBeNull();
    // The one off-screen post is surfaced as a hint, not dropped.
    expect(screen.getByText(/1 weitere/)).toBeInTheDocument();
  });

  it('omits the viewport hint when every point is on screen', async () => {
    vi.spyOn(api, 'publicMap').mockResolvedValue(mapData());
    render(MapPage);
    await screen.findByRole('heading', { level: 4, name: 'Berge' });
    expect(screen.queryByText(/weitere/)).toBeNull();
  });

  it('highlights the matching marker when a list row is hovered', async () => {
    vi.spyOn(api, 'publicMap').mockResolvedValue(mapData());
    render(MapPage);
    const row = await screen.findByRole('link', { name: /Berge/ });
    // Markers are created in list order, so the first marker is Berge's.
    const markerResults = (L.marker as unknown as { mock: { results: { value: { getElement: () => HTMLElement } }[] } }).mock.results;
    const bergeEl = markerResults[0]!.value.getElement();

    await fireEvent.mouseEnter(row);
    await waitFor(() => expect(bergeEl.classList.contains('map-pin--active')).toBe(true));

    await fireEvent.mouseLeave(row);
    await waitFor(() => expect(bergeEl.classList.contains('map-pin--active')).toBe(false));
  });

  it('wires marker hover back to the list (bidirectional highlight)', async () => {
    vi.spyOn(api, 'publicMap').mockResolvedValue(mapData());
    render(MapPage);
    await waitFor(() => expect(L.marker).toHaveBeenCalledTimes(2));
    const markerResults = (L.marker as unknown as { mock: { results: { value: { on: ReturnType<typeof vi.fn> } }[] } }).mock.results;
    const events = markerResults[0]!.value.on.mock.calls.map((c) => c[0]);
    expect(events).toContain('mouseover');
    expect(events).toContain('mouseout');
  });

  it('offers a Reise filter defaulting to "Alle Reisen" with an option per trip', async () => {
    vi.spyOn(api, 'publicMap').mockResolvedValue(mapData());
    vi.spyOn(api, 'publicTrips').mockResolvedValue(trips);
    render(MapPage);

    const select = (await screen.findByLabelText('Reise')) as HTMLSelectElement;
    expect(select.value).toBe('');
    expect(screen.getByRole('option', { name: 'Alle Reisen' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Alpen' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Nordsee' })).toBeInTheDocument();
  });

  it('filters the side list to the selected reise and refits the map to it', async () => {
    vi.spyOn(api, 'publicMap').mockResolvedValue(mapData());
    vi.spyOn(api, 'publicTrips').mockResolvedValue(trips);
    render(MapPage);

    const select = (await screen.findByLabelText('Reise')) as HTMLSelectElement;
    // Both posts visible before filtering.
    expect(screen.getByRole('heading', { level: 4, name: 'Berge' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 4, name: 'Meer' })).toBeInTheDocument();

    const mapInstance = (L.map as unknown as { mock: { results: { value: { fitBounds: ReturnType<typeof vi.fn> } }[] } }).mock.results[0]!.value;
    mapInstance.fitBounds.mockClear();

    await fireEvent.change(select, { target: { value: 't1' } });

    // Only the Alpen post (Berge) remains in the list…
    await waitFor(() =>
      expect(screen.queryByRole('heading', { level: 4, name: 'Meer' })).toBeNull(),
    );
    expect(screen.getByRole('heading', { level: 4, name: 'Berge' })).toBeInTheDocument();
    // …and the map reframes to the filtered selection.
    expect(mapInstance.fitBounds).toHaveBeenCalled();
  });

  it('restores all posts when "Alle Reisen" is reselected', async () => {
    vi.spyOn(api, 'publicMap').mockResolvedValue(mapData());
    vi.spyOn(api, 'publicTrips').mockResolvedValue(trips);
    render(MapPage);

    const select = (await screen.findByLabelText('Reise')) as HTMLSelectElement;
    await fireEvent.change(select, { target: { value: 't1' } });
    await waitFor(() =>
      expect(screen.queryByRole('heading', { level: 4, name: 'Meer' })).toBeNull(),
    );

    await fireEvent.change(select, { target: { value: '' } });
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 4, name: 'Meer' })).toBeInTheDocument(),
    );
    expect(screen.getByRole('heading', { level: 4, name: 'Berge' })).toBeInTheDocument();
  });

  it('hides the Reise filter when there are no trips', async () => {
    vi.spyOn(api, 'publicMap').mockResolvedValue(mapData());
    vi.spyOn(api, 'publicTrips').mockResolvedValue([]);
    render(MapPage);
    await screen.findByText('Im Kartenausschnitt');
    expect(screen.queryByLabelText('Reise')).toBeNull();
  });

  it('binds a text-only popup — no image preview on the map (regression)', async () => {
    vi.spyOn(api, 'publicMap').mockResolvedValue(mapData());
    render(MapPage);
    await waitFor(() => expect(L.marker).toHaveBeenCalledTimes(2));

    const markerResults = (
      L.marker as unknown as {
        mock: { results: { value: { bindPopup: ReturnType<typeof vi.fn> } }[] };
      }
    ).mock.results;
    // Every popup is title + place only — the Karte never embeds a photo.
    for (const r of markerResults) {
      const html = r.value.bindPopup.mock.calls[0]![0] as string;
      expect(html).not.toMatch(/<img\b/i);
      expect(html).toContain('map-pop');
    }
    // Sanity: the first popup still carries the post title and its place.
    const first = markerResults[0]!.value.bindPopup.mock.calls[0]![0] as string;
    expect(first).toContain('Berge');
    expect(first).toContain('Zugspitze');
  });

  it('falls back to a default view when there are no points', async () => {
    vi.spyOn(api, 'publicMap').mockResolvedValue(mapData({ points: [] }));
    render(MapPage);
    await waitFor(() => expect(L.map).toHaveBeenCalled());
    const mapInstance = (L.map as unknown as { mock: { results: { value: { setView: ReturnType<typeof vi.fn>; fitBounds: ReturnType<typeof vi.fn> } }[] } }).mock.results[0]!.value;
    expect(mapInstance.setView).toHaveBeenCalled();
    expect(mapInstance.fitBounds).not.toHaveBeenCalled();
  });
});
