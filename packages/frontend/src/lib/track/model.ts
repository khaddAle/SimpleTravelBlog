import type {
  PublicTrackData,
  TimeInterval,
  TrackPhoto,
  TrackSeries,
  TrackStats,
} from '@stb/shared';

export type LatLng = [lat: number, lng: number];

export interface TrackView {
  label: string;
  color: string;
  stats: TrackStats;
  moving: TimeInterval[];
  series: TrackSeries;
  latlngs: LatLng[];
}

export interface TrackModel {
  tracks: TrackView[];
  photos: TrackPhoto[];
  utcOffsetMinutes: number;
  maxDist: number;
  minEle: number;
  maxEle: number;
  bounds: [LatLng, LatLng];
}

export function buildTrackModel(_data: PublicTrackData): TrackModel {
  throw new Error('not implemented');
}
