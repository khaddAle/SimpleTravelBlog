import type { SearchQuery } from '@stb/shared';
import { foldSearch, escapeRegex } from './fold.js';

/**
 * Translate a public search query into a Mongo filter + sort for the Post
 * collection. Pure (no DB, no mongoose) so the filter shape is unit-testable.
 *
 * `tripId` is the resolved Trip ObjectId (as a string) — the public API filters
 * by a trip's shortId, which the route resolves before calling this. Free-text
 * search matches the query as a LITERAL, case-/accent-insensitive substring of
 * the denormalized `searchFold` field, so partial words match as the reader
 * types (the old `$text` index only matched whole stemmed words).
 */
export interface BuiltSearch {
  filter: Record<string, unknown>;
  sort: Record<string, 1 | -1>;
}

export function buildPublishedSearch(query: SearchQuery, tripId?: string): BuiltSearch {
  const filter: Record<string, unknown> = { status: 'published' };

  const term = query.q?.trim();
  if (term) {
    // Fold the query exactly like the stored field, then escape it so it is
    // matched literally. Escaping is the security boundary — it is what stops a
    // crafted query from injecting a regex pattern (ReDoS / unintended matches).
    filter.searchFold = { $regex: escapeRegex(foldSearch(term)) };
  }
  if (query.country) filter.country = query.country;
  if (tripId) filter.tripId = tripId;

  const range: Record<string, Date> = {};
  if (query.from) range.$gte = new Date(query.from);
  if (query.to) range.$lte = new Date(query.to);
  if (Object.keys(range).length > 0) filter.postDate = range;

  return { filter, sort: { postDate: -1 } };
}
