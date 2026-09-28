import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import L from 'leaflet';
import { api, ApiError } from '../../lib/api.js';
import TrackMap from './TrackMap.svelte';
import { oneTrack, twoTracks } from '../../../tests/trackData.js';

vi.mock('leaflet', () => {
  const map = {
    fitBounds: vi.fn().mockReturnThis(),
    removeLayer: vi.fn().mockReturnThis(),
    invalidateSize: vi.fn().mockReturnThis(),
    remove: vi.fn(),
    attributionControl: { setPrefix: vi.fn() },
  };
  const layer = () => ({
    addTo: vi.fn().mockReturnThis(),
    on: vi.fn().mockReturnThis(),
    clearLayers: vi.fn().mockReturnThis(),
    setLatLng: vi.fn().mockReturnThis(),
    getElement: vi.fn(() => undefined),
    remove: vi.fn(),
  });
  return {
    default: {
      map: vi.fn(() => ({
        ...map,
        on: vi.fn().mockReturnThis(),
        panTo: vi.fn().mockReturnThis(),
        getBounds: vi.fn(() => ({ pad: () => ({ contains: () => true }) })),
        latLngToContainerPoint: vi.fn(() => ({ x: 0, y: 0 })),
      })),
      tileLayer: vi.fn(layer),
      layerGroup: vi.fn(layer),
      polyline: vi.fn(layer),
      circleMarker: vi.fn(layer),
      marker: vi.fn(layer),
      divIcon: vi.fn((o: object) => o),
    },
  };
});

type MockFn = ReturnType<typeof vi.fn>;
const mapInstance = () =>
  (L.map as unknown as { mock: { results: { value: { fitBounds: MockFn; remove: MockFn } }[] } })
    .mock.results[0]!.value;

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

describe('TrackMap', () => {
  it('loads the tracks and draws a static map fitted to them', async () => {
    const load = vi.spyOn(api, 'publicPostTracks').mockResolvedValue(twoTracks());
    render(TrackMap, { postId: 'p1' });

    expect(await screen.findByRole('region', { name: 'GPS-Track' })).toBeInTheDocument();
    expect(load).toHaveBeenCalledWith('p1');
    await waitFor(() => expect(L.map).toHaveBeenCalled());
    expect((L.map as unknown as MockFn).mock.calls[0]![1]).toMatchObject({
      dragging: false,
      zoomControl: false,
      scrollWheelZoom: false,
      touchZoom: false,
    });
    // Casing, Ben wide underneath, Anna on top; start + end dot per track.
    expect(L.polyline).toHaveBeenCalledTimes(3);
    expect(L.circleMarker).toHaveBeenCalledTimes(4);
    expect(mapInstance().fitBounds).toHaveBeenCalledWith(
      [
        [46.99, 10.99],
        [47.03, 11.02],
      ],
      expect.objectContaining({ padding: [24, 24] }),
    );
  });

  it('shows the stats and the elevation profile', async () => {
    vi.spyOn(api, 'publicPostTracks').mockResolvedValue(twoTracks());
    const { container } = render(TrackMap, { postId: 'p1' });
    expect(await screen.findByText('Anna')).toBeInTheDocument();
    expect(screen.getByText('2,5 km')).toBeInTheDocument();
    expect(container.querySelector('svg.profile')).not.toBeNull();
  });

  it('draws a single track without the wide underlay', async () => {
    vi.spyOn(api, 'publicPostTracks').mockResolvedValue(oneTrack());
    render(TrackMap, { postId: 'p1' });
    await waitFor(() => expect(L.polyline).toHaveBeenCalledTimes(2));
    expect(L.circleMarker).toHaveBeenCalledTimes(2);
  });

  it('renders nothing when the post has no tracks', async () => {
    const load = vi
      .spyOn(api, 'publicPostTracks')
      .mockRejectedValue(new ApiError(404, 'no tracks'));
    render(TrackMap, { postId: 'p1' });
    await waitFor(() => expect(load).toHaveBeenCalled());
    await Promise.resolve();
    expect(screen.queryByRole('region', { name: 'GPS-Track' })).toBeNull();
    expect(L.map).not.toHaveBeenCalled();
  });

  it('opens the enlarged view from the button and from the map', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'publicPostTracks').mockResolvedValue(twoTracks());
    render(TrackMap, { postId: 'p1', title: 'Über den Pass' });
    const btn = await screen.findByRole('button', { name: 'Vergrößern' });
    await user.click(btn);
    expect(screen.getByRole('dialog', { name: 'GPS-Track' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Schließen' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(btn).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Karte vergrößern' }));
    expect(screen.getByRole('dialog', { name: 'GPS-Track' })).toBeInTheDocument();
  });

  it('opens the enlarged view from the map with the keyboard', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'publicPostTracks').mockResolvedValue(oneTrack());
    render(TrackMap, { postId: 'p1' });
    (await screen.findByRole('button', { name: 'Karte vergrößern' })).focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('dialog', { name: 'GPS-Track' })).toBeInTheDocument();
  });

  it('removes the map on unmount', async () => {
    vi.spyOn(api, 'publicPostTracks').mockResolvedValue(oneTrack());
    const { unmount } = render(TrackMap, { postId: 'p1' });
    await waitFor(() => expect(L.map).toHaveBeenCalled());
    unmount();
    expect(mapInstance().remove).toHaveBeenCalled();
  });
});
