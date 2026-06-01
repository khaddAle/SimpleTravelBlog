import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import L from 'leaflet';
import { api } from '../lib/api.js';
import MapPage from './MapPage.svelte';

vi.mock('leaflet', () => {
  const map = {
    setView: vi.fn().mockReturnThis(),
    fitBounds: vi.fn().mockReturnThis(),
    remove: vi.fn(),
  };
  const marker = {
    addTo: vi.fn().mockReturnThis(),
    bindPopup: vi.fn().mockReturnThis(),
  };
  const bounds = { pad: vi.fn().mockReturnThis() };
  return {
    default: {
      map: vi.fn(() => map),
      tileLayer: vi.fn(() => ({ addTo: vi.fn().mockReturnThis() })),
      divIcon: vi.fn(() => ({})),
      marker: vi.fn(() => marker),
      featureGroup: vi.fn(() => ({ getBounds: vi.fn(() => bounds) })),
    },
  };
});

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

const points = [
  { id: 'p1', title: 'Berge', lat: 47, lng: 11, country: 'AT', placeName: 'Zugspitze' },
  { id: 'p2', title: 'Meer', lat: 54, lng: 8, country: 'DE', placeName: 'Sylt' },
];
const mapData = (over = {}) => ({ points, unlocatedCount: 0, ...over });

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
    expect(screen.getByText('Alle Orte')).toBeInTheDocument();
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
    await screen.findByText('Alle Orte');
    expect(screen.queryByText(/ohne Ort/)).not.toBeInTheDocument();
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
