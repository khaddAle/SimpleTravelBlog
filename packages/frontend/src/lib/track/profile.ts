import type { TrackModel } from './model.js';

export const PROFILE_PAD = { top: 8, bottom: 18 };

export interface ProfileGeometry {
  x: (d: number) => number;
  y: (e: number) => number;
  baseY: number;
  areas: { d: string; color: string; fillOpacity: number }[];
  eleTicks: { y: number; labelY: number; label: string }[];
  kmTicks: { x: number; label: string }[];
}

export function profileGeometry(_m: TrackModel, _w: number, _h: number): ProfileGeometry | null {
  throw new Error('not implemented');
}
