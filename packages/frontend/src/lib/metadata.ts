import type { ReverseGeocodeResult } from './nominatim.js';
import type { PostMetadata } from './types.js';

/**
 * Pre-fill the required Land/Ortsname from a reverse-geocoded point, without
 * clobbering values the user already provided. Returns a new metadata object so
 * callers can assign it reactively.
 */
export function fillMissingPlace(
  metadata: PostMetadata,
  place: ReverseGeocodeResult,
): PostMetadata {
  const next = { ...metadata };
  if (!/^[A-Z]{2}$/.test(next.country) && place.countryCode) next.country = place.countryCode;
  if (!next.placeName.trim() && place.placeName) next.placeName = place.placeName;
  return next;
}
