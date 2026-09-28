// Deterministic synthetic GPS walk for the track tests (ported from the POC's
// make-sample.mjs): an alpine out-and-back route from 1010 m to a 1960 m
// summit, with a standing break at the top that the watch keeps logging
// every 30 s (slow jitter → not moving → a replay gap).
import type { RawTrackPoint } from '../src/track/build.js';

type Waypoint = readonly [lat: number, lon: number, ele: number];

const UP: readonly Waypoint[] = [
  [47.4495, 11.0615, 1010],
  [47.4452, 11.055, 1080],
  [47.441, 11.052, 1190],
  [47.4372, 11.0455, 1340],
  [47.433, 11.041, 1470],
  [47.4301, 11.0338, 1590],
  [47.4262, 11.0301, 1720],
  [47.4231, 11.024, 1850],
  [47.4212, 11.0178, 1960],
];
// The descent takes a slightly different line.
const DOWN: readonly Waypoint[] = [
  [47.4212, 11.0178, 1960],
  [47.419, 11.025, 1830],
  [47.4215, 11.033, 1660],
  [47.426, 11.0395, 1510],
  [47.4318, 11.047, 1360],
  [47.438, 11.052, 1220],
  [47.444, 11.058, 1100],
  [47.4495, 11.0615, 1010],
];

function hav(a: Waypoint, b: Waypoint): number {
  const r = Math.PI / 180;
  const dLat = (b[0] - a[0]) * r;
  const dLon = (b[1] - a[1]) * r;
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(s));
}

/** Densify a polyline to ~stepM spacing with a little wiggle and ±1.5 m height noise. */
function densify(wps: readonly Waypoint[], stepM: number, seed: number): Waypoint[] {
  const pts: Waypoint[] = [];
  let rnd = seed;
  const rand = (): number => (rnd = (rnd * 16807) % 2147483647) / 2147483647 - 0.5;
  for (let i = 0; i < wps.length - 1; i++) {
    const a = wps[i]!;
    const b = wps[i + 1]!;
    const n = Math.max(1, Math.round(hav(a, b) / stepM));
    for (let k = 0; k < n; k++) {
      const f = k / n;
      const wig = Math.sin(f * Math.PI * 3) * 0.0006;
      pts.push([
        a[0] + (b[0] - a[0]) * f + wig + rand() * 0.00004,
        a[1] + (b[1] - a[1]) * f - wig + rand() * 0.00004,
        a[2] + (b[2] - a[2]) * f + rand() * 3,
      ]);
    }
  }
  pts.push(wps[wps.length - 1]!);
  return pts;
}

export interface WalkOptions {
  startUtc: number;
  flatKmh: number;
  breakMin: number;
  seed: number;
}

/** Walk the route; speed depends on slope; times are whole seconds like a real watch. */
export function alpineWalk({ startUtc, flatKmh, breakMin, seed }: WalkOptions): RawTrackPoint[] {
  const upPts = densify(UP, 25, seed);
  const route = [...upPts, ...densify(DOWN, 25, seed + 7).slice(1)];
  const summitIdx = upPts.length - 1;
  const out: RawTrackPoint[] = [];
  let t = startUtc;
  for (let i = 0; i < route.length; i++) {
    const p = route[i]!;
    if (i > 0) {
      const prev = route[i - 1]!;
      const kmh = p[2] - prev[2] > 0 ? flatKmh * 0.72 : flatKmh * 1.1;
      t += Math.max(1000, Math.round(hav(prev, p) / (kmh / 3.6)) * 1000);
    }
    out.push({ lat: p[0], lon: p[1], ele: p[2], t });
    if (i === summitIdx) {
      for (let s = 30; s <= breakMin * 60; s += 30) {
        t += 30_000;
        out.push({ lat: p[0] + Math.sin(s) * 0.00002, lon: p[1], ele: p[2], t });
      }
    }
  }
  return out;
}

/** Person 1 of the POC sample: faster, 60 min summit break. */
export const annaWalk = (): RawTrackPoint[] =>
  alpineWalk({ startUtc: Date.UTC(2026, 6, 11, 6, 40), flatKmh: 4.6, breakMin: 60, seed: 11 });
