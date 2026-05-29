import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import L from 'leaflet';
import * as nominatim from '../../lib/nominatim.js';
import MapPicker from './MapPicker.svelte';

// Leaflet needs a real rendering surface; mock it down to the methods we call.
vi.mock('leaflet', () => {
  const map = {
    setView: vi.fn().mockReturnThis(),
    on: vi.fn().mockReturnThis(),
    remove: vi.fn(),
  };
  const tileLayer = { addTo: vi.fn().mockReturnThis() };
  const marker = { addTo: vi.fn().mockReturnThis(), setLatLng: vi.fn().mockReturnThis() };
  return {
    default: {
      map: vi.fn(() => map),
      tileLayer: vi.fn(() => tileLayer),
      marker: vi.fn(() => marker),
    },
  };
});

/** Pull the click handler the component registered via map.on('click', ...). */
function clickHandler(): (e: unknown) => void {
  const mapInstance = vi.mocked(L.map).mock.results[0]!.value as {
    on: ReturnType<typeof vi.fn>;
  };
  const call = mapInstance.on.mock.calls.find((c) => c[0] === 'click');
  return call![1] as (e: unknown) => void;
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => vi.restoreAllMocks());

describe('MapPicker', () => {
  it('initialises a Leaflet map with a tile layer', () => {
    render(MapPicker, { onChange: vi.fn() });
    expect(L.map).toHaveBeenCalled();
    expect(L.tileLayer).toHaveBeenCalled();
    expect(screen.getByText('Noch kein Ort gewählt.')).toBeInTheDocument();
  });

  it('searches and selecting a result reports coordinates', async () => {
    const user = userEvent.setup();
    vi.spyOn(nominatim, 'geocode').mockResolvedValue([
      { displayName: 'Berlin, Deutschland', lat: 52.52, lng: 13.405 },
    ]);
    const onChange = vi.fn();
    render(MapPicker, { onChange });

    await user.type(screen.getByLabelText('Ort suchen'), 'Berlin');
    await user.click(screen.getByRole('button', { name: 'Suchen' }));

    const result = await screen.findByRole('button', { name: 'Berlin, Deutschland' });
    await user.click(result);

    expect(onChange).toHaveBeenCalledWith(52.52, 13.405);
    expect(screen.getByText('Gewählt: 52.52000, 13.40500')).toBeInTheDocument();
  });

  it('clicking the map reports the clicked coordinates', () => {
    const onChange = vi.fn();
    render(MapPicker, { onChange });
    clickHandler()({ latlng: { lat: 48.137, lng: 11.575 } });
    expect(onChange).toHaveBeenCalledWith(48.137, 11.575);
  });

  it('surfaces a geocoding error', async () => {
    const user = userEvent.setup();
    vi.spyOn(nominatim, 'geocode').mockRejectedValue(new Error('Geocoding fehlgeschlagen (503)'));
    render(MapPicker, { onChange: vi.fn() });
    await user.type(screen.getByLabelText('Ort suchen'), 'x');
    await user.click(screen.getByRole('button', { name: 'Suchen' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Geocoding fehlgeschlagen (503)');
  });

  it('renders an initial marker when given coordinates', () => {
    render(MapPicker, { lat: 50, lng: 8, onChange: vi.fn() });
    expect(L.marker).toHaveBeenCalled();
    expect(screen.getByText('Gewählt: 50.00000, 8.00000')).toBeInTheDocument();
  });
});
