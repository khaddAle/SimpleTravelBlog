import L from 'leaflet';
import type { TrackModel } from './model.js';

/**
 * Draw the tracks with start (hollow) and end (filled) dots. Person 2 is drawn
 * wider underneath: on shared stretches person 1's line shows a rust border,
 * where the routes split both lines stand alone. A white casing keeps the
 * lines readable on busy topo tiles.
 */
export function drawTracks(layer: L.LayerGroup, model: TrackModel): void {
  const ts = model.tracks;
  const [first, second] = ts;
  if (!first) return;
  const line = { interactive: false } as const;
  L.polyline(ts[ts.length - 1]!.latlngs, {
    ...line,
    color: '#fff',
    weight: second ? 11 : 7,
    opacity: 0.75,
  }).addTo(layer);
  if (second) {
    L.polyline(second.latlngs, { ...line, color: second.color, weight: 7.5, opacity: 0.95 }).addTo(
      layer,
    );
  }
  L.polyline(first.latlngs, { ...line, color: first.color, weight: 3.5, opacity: 1 }).addTo(layer);
  for (const t of ts) {
    const start = t.latlngs[0]!;
    const end = t.latlngs[t.latlngs.length - 1]!;
    L.circleMarker(start, {
      interactive: false,
      radius: 5,
      color: t.color,
      weight: 2.5,
      fillColor: '#fff',
      fillOpacity: 1,
    }).addTo(layer);
    L.circleMarker(end, {
      interactive: false,
      radius: 5,
      color: '#fff',
      weight: 2,
      fillColor: t.color,
      fillOpacity: 1,
    }).addTo(layer);
  }
}
