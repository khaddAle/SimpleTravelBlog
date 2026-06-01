import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import L from 'leaflet';
import * as nominatim from '../../lib/nominatim.js';
import MapPickerDialog from './MapPickerDialog.svelte';

// Leaflet needs a real rendering surface; mock it down to the methods we call.
vi.mock('leaflet', () => {
  const map = {
    setView: vi.fn().mockReturnThis(),
    on: vi.fn().mockReturnThis(),
    invalidateSize: vi.fn().mockReturnThis(),
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
  const mapInstance = vi.mocked(L.map).mock.results[0]!.value as { on: ReturnType<typeof vi.fn> };
  const call = mapInstance.on.mock.calls.find((c) => c[0] === 'click');
  return call![1] as (e: unknown) => void;
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

describe('MapPickerDialog', () => {
  it('renders a modal with a map, search and the confirm/cancel actions', () => {
    render(MapPickerDialog, { lat: 50, lng: 8, onConfirm: vi.fn(), onCancel: vi.fn() });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(L.map).toHaveBeenCalled();
    expect(screen.getByLabelText('Ort suchen')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Standort übernehmen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abbrechen' })).toBeInTheDocument();
  });

  it('re-measures the map after the modal has laid out', async () => {
    render(MapPickerDialog, { onConfirm: vi.fn(), onCancel: vi.fn() });
    const mapInstance = vi.mocked(L.map).mock.results[0]!.value as {
      invalidateSize: ReturnType<typeof vi.fn>;
    };
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    expect(mapInstance.invalidateSize).toHaveBeenCalled();
  });

  it('clicking the map only sets a provisional point — it does not apply it', async () => {
    const onConfirm = vi.fn();
    render(MapPickerDialog, { onConfirm, onCancel: vi.fn() });
    clickHandler()({ latlng: { lat: 48.137, lng: 11.575 } });
    expect(onConfirm).not.toHaveBeenCalled();
    expect(await screen.findByText('Gewählt: 48.13700, 11.57500')).toBeInTheDocument();
  });

  it('applies the provisional point only on "Standort übernehmen"', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(MapPickerDialog, { onConfirm, onCancel: vi.fn() });
    clickHandler()({ latlng: { lat: 48.137, lng: 11.575 } });
    await user.click(screen.getByRole('button', { name: 'Standort übernehmen' }));
    expect(onConfirm).toHaveBeenCalledWith(48.137, 11.575);
  });

  it('discards the choice on "Abbrechen"', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(MapPickerDialog, { onConfirm, onCancel });
    clickHandler()({ latlng: { lat: 1, lng: 2 } });
    await user.click(screen.getByRole('button', { name: 'Abbrechen' }));
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('cancels on Escape', async () => {
    const onCancel = vi.fn();
    render(MapPickerDialog, { onConfirm: vi.fn(), onCancel });
    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
  });

  it('disables confirm until a point is chosen', () => {
    render(MapPickerDialog, { onConfirm: vi.fn(), onCancel: vi.fn() });
    expect(screen.getByRole('button', { name: 'Standort übernehmen' })).toBeDisabled();
  });

  it('searching and picking a result arms the confirm with those coordinates', async () => {
    const user = userEvent.setup();
    vi.spyOn(nominatim, 'geocode').mockResolvedValue([
      { displayName: 'Berlin, Deutschland', lat: 52.52, lng: 13.405 },
    ]);
    const onConfirm = vi.fn();
    render(MapPickerDialog, { onConfirm, onCancel: vi.fn() });
    await user.type(screen.getByLabelText('Ort suchen'), 'Berlin');
    await user.click(screen.getByRole('button', { name: 'Suchen' }));
    await user.click(await screen.findByRole('button', { name: 'Berlin, Deutschland' }));
    // Still provisional until confirmed.
    expect(onConfirm).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Standort übernehmen' }));
    expect(onConfirm).toHaveBeenCalledWith(52.52, 13.405);
  });
});
