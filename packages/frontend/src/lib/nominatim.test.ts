import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { geocode, reverseGeocode } from './nominatim.js';

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('geocode', () => {
  it('returns [] for blank queries without calling fetch', async () => {
    expect(await geocode('   ')).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('builds the Nominatim URL and maps rows', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        { display_name: 'Berlin, Deutschland', lat: '52.52', lon: '13.405' },
      ],
    });
    const results = await geocode('Berlin');
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toContain('https://nominatim.openstreetmap.org/search');
    expect(url).toContain('q=Berlin');
    expect(url).toContain('format=jsonv2');
    expect(results).toEqual([{ displayName: 'Berlin, Deutschland', lat: 52.52, lng: 13.405 }]);
  });

  it('drops malformed rows', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        { display_name: 'Gut', lat: '1', lon: '2' },
        { lat: 'x', lon: 'y' },
        { display_name: 'Kein Ort', lat: 'NaN', lon: '2' },
      ],
    });
    const results = await geocode('test');
    expect(results).toHaveLength(1);
    expect(results[0]!.displayName).toBe('Gut');
  });

  it('throws on a non-ok response', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
    await expect(geocode('Berlin')).rejects.toThrow('Geocoding fehlgeschlagen (503)');
  });
});

describe('reverseGeocode', () => {
  it('builds the reverse URL and maps country + place', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ address: { country_code: 'de', city: 'Berlin' }, name: 'X' }),
    });
    const res = await reverseGeocode(52.52, 13.405);
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toContain('https://nominatim.openstreetmap.org/reverse');
    expect(url).toContain('lat=52.52');
    expect(url).toContain('lon=13.405');
    expect(url).toContain('addressdetails=1');
    expect(res).toEqual({ countryCode: 'DE', placeName: 'Berlin' });
  });

  it('uppercases the country code and falls back through town/village', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ address: { country_code: 'fr', village: 'Èze' } }),
    });
    expect(await reverseGeocode(43.7, 7.36)).toEqual({ countryCode: 'FR', placeName: 'Èze' });
  });

  it('returns an empty result when the address is missing', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    expect(await reverseGeocode(0, 0)).toEqual({});
  });

  it('throws on a non-ok response', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
    await expect(reverseGeocode(1, 2)).rejects.toThrow('Reverse-Geocoding fehlgeschlagen (503)');
  });
});
