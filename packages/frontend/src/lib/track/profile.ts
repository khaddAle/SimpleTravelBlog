import { fmtM, niceStep } from './format.js';
import type { TrackModel } from './model.js';

/** Plot padding inside the SVG: room for the km labels at the bottom. */
export const PROFILE_PAD = { top: 8, bottom: 18 };

export interface ProfileGeometry {
  x: (d: number) => number;
  y: (e: number) => number;
  baseY: number;
  areas: { d: string; color: string; fillOpacity: number }[];
  eleTicks: { y: number; labelY: number; label: string }[];
  kmTicks: { x: number; label: string }[];
}

/**
 * Elevation profile geometry for a `w`×`h` SVG: x = distance, one filled area
 * per track (semi-transparent so both stay visible), height grid and km
 * labels drawn inside the plot so its width matches the map above.
 */
export function profileGeometry(m: TrackModel, w: number, h: number): ProfileGeometry | null {
  if (w <= 0 || h <= 0) return null;
  const { top, bottom } = PROFILE_PAD;
  const baseY = h - bottom;
  const x = (d: number): number => (d / m.maxDist) * w;
  const y = (e: number): number => top + (1 - (e - m.minEle) / (m.maxEle - m.minEle)) * (baseY - top);

  const areas = m.tracks.map((t) => {
    const { dist, ele } = t.series;
    const n = dist.length;
    // Never more than ~1.5 vertices per pixel.
    const step = Math.max(1, Math.floor(n / (w * 1.5)));
    let d = `M0 ${baseY}`;
    for (let k = 0; k < n; k += step) d += ` L${x(dist[k]!).toFixed(1)} ${y(ele[k]!).toFixed(1)}`;
    const endX = x(dist[n - 1]!).toFixed(1);
    d += ` L${endX} ${y(ele[n - 1]!).toFixed(1)} L${endX} ${baseY} Z`;
    return { d, color: t.color, fillOpacity: m.tracks.length > 1 ? 0.16 : 0.2 };
  });

  const eStep = niceStep(m.maxEle - m.minEle, 3);
  const eleTicks: ProfileGeometry['eleTicks'] = [];
  for (let e = Math.ceil(m.minEle / eStep) * eStep; e <= m.maxEle; e += eStep) {
    const ty = y(e);
    eleTicks.push({ y: ty, labelY: ty < 16 ? ty + 11 : ty - 3, label: fmtM(e) });
  }

  const kStep = niceStep(m.maxDist / 1000, w > 500 ? 8 : 4) * 1000;
  const kmTicks: ProfileGeometry['kmTicks'] = [];
  for (let d = kStep; d < m.maxDist; d += kStep) {
    kmTicks.push({ x: x(d), label: `${(d / 1000).toLocaleString('de-DE')} km` });
  }

  return { x, y, baseY, areas, eleTicks, kmTicks };
}
