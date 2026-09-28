import {
  fromRows,
  type PublicTrackData,
  type TimeInterval,
  type TrackPhoto,
  type TrackSeries,
  type TrackStats,
} from '@stb/shared';
import { trackColor } from './colors.js';

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

/**
 * Reader view model of a post's tracks: series rebuilt from the stored rows
 * (absolute UTC times), colours by position, and the shared profile ranges.
 */
export function buildTrackModel(data: PublicTrackData): TrackModel {
  const tracks = data.tracks.map((t, i): TrackView => {
    const series = fromRows(t.points, t.stats.start);
    return {
      label: t.label,
      color: trackColor(i),
      stats: t.stats,
      moving: t.moving,
      series,
      latlngs: series.lat.map((lat, k): LatLng => [lat, series.lon[k]!]),
    };
  });
  const minEle = Math.min(...tracks.map((t) => t.stats.minEle));
  const maxEle = Math.max(...tracks.map((t) => t.stats.maxEle));
  // Headroom so the profile never touches its frame; at least 20 m on flat tracks.
  const margin = Math.max(20, (maxEle - minEle) * 0.12);
  const lats = tracks.flatMap((t) => t.series.lat);
  const lons = tracks.flatMap((t) => t.series.lon);
  return {
    tracks,
    photos: data.photos,
    utcOffsetMinutes: data.utcOffsetMinutes,
    maxDist: Math.max(...tracks.map((t) => t.stats.distance)),
    minEle: minEle - margin,
    maxEle: maxEle + margin * 0.6,
    bounds: [
      [Math.min(...lats), Math.min(...lons)],
      [Math.max(...lats), Math.max(...lons)],
    ],
  };
}
