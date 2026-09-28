import { describe, it, expect, vi, beforeEach } from 'vitest';
import L from 'leaflet';
import { addTrackTiles } from './tiles.js';

vi.mock('leaflet', () => {
  const tileLayer = vi.fn((url: string) => {
    const handlers: Record<string, () => void> = {};
    const layer = {
      url,
      on: vi.fn((ev: string, fn: () => void) => {
        handlers[ev] = fn;
        return layer;
      }),
      addTo: vi.fn(() => layer),
      fire: (ev: string) => handlers[ev]?.(),
    };
    return layer;
  });
  return { default: { tileLayer } };
});

type FakeLayer = { url: string; addTo: ReturnType<typeof vi.fn>; fire: (ev: string) => void };
const layers = (): FakeLayer[] =>
  (L.tileLayer as unknown as { mock: { results: { value: FakeLayer }[] } }).mock.results.map(
    (r) => r.value,
  );

beforeEach(() => vi.clearAllMocks());

describe('addTrackTiles', () => {
  const map = { removeLayer: vi.fn() };

  it('adds the OpenTopoMap layer', () => {
    addTrackTiles(map as unknown as L.Map);
    expect(layers()).toHaveLength(1);
    expect(layers()[0]!.url).toContain('opentopomap.org');
    expect(layers()[0]!.addTo).toHaveBeenCalledWith(map);
  });

  it('switches to OpenStreetMap after repeated tile errors, once', () => {
    addTrackTiles(map as unknown as L.Map);
    const topo = layers()[0]!;
    topo.fire('tileerror');
    topo.fire('tileerror');
    expect(layers()).toHaveLength(1);
    topo.fire('tileerror');
    expect(map.removeLayer).toHaveBeenCalledWith(topo);
    expect(layers()).toHaveLength(2);
    expect(layers()[1]!.url).toContain('openstreetmap.org');
    expect(layers()[1]!.addTo).toHaveBeenCalledWith(map);
    topo.fire('tileerror');
    expect(layers()).toHaveLength(2);
  });
});
