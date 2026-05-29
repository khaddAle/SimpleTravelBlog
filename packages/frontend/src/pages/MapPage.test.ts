import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import L from 'leaflet';
import { api } from '../lib/api.js';
import MapPage from './MapPage.svelte';

vi.mock('leaflet', () => {
  const map = { setView: vi.fn().mockReturnThis(), remove: vi.fn() };
  const marker = {
    addTo: vi.fn().mockReturnThis(),
    bindPopup: vi.fn().mockReturnThis(),
  };
  return {
    default: {
      map: vi.fn(() => map),
      tileLayer: vi.fn(() => ({ addTo: vi.fn().mockReturnThis() })),
      marker: vi.fn(() => marker),
    },
  };
});

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

describe('MapPage', () => {
  it('loads points, builds the map and lists places', async () => {
    vi.spyOn(api, 'publicMap').mockResolvedValue([
      { id: 'p1', title: 'Berge', lat: 47, lng: 11, country: 'DE', placeName: 'Zugspitze' },
      { id: 'p2', title: 'Meer', lat: 54, lng: 8, country: 'DE', placeName: 'Sylt' },
    ]);
    render(MapPage);

    expect(await screen.findByRole('link', { name: /Berge/ })).toHaveAttribute(
      'href',
      '#/beitrag/p1',
    );
    await waitFor(() => {
      expect(L.map).toHaveBeenCalled();
      expect(L.marker).toHaveBeenCalledTimes(2);
    });
  });
});
