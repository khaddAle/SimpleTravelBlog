/**
 * Editor-side post metadata (everything except the block content). Mirrors the
 * fields of the backend `postMetadataSchema`; `postDate` is an ISO string.
 */
export interface PostMetadata {
  title: string;
  subtitle?: string;
  postDate: string;
  country: string;
  placeName: string;
  lat: number;
  lng: number;
  tripId?: string;
}
