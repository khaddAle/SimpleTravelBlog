import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { geocode } from './nominatim.js';

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
