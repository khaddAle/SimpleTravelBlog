import type { SearchQuery } from '@stb/shared';

/**
 * Translate a public search query into a Mongo filter + sort for the Post
 * collection. Pure (no DB, no mongoose) so the filter shape is unit-testable.
 *
 * `tripId` is the resolved Trip ObjectId (as a string) — the public API filters
 * by a trip's shortId, which the route resolves before calling this. Free-text
 * search uses the german `$text` index and sorts by relevance then recency.
 */
export interface BuiltSearch {
  filter: Record<string, unknown>;
  sort: Record<string, 1 | -1 | { $meta: 'textScore' }>;
  projectScore: boolean;
}

export function buildPublishedSearch(query: SearchQuery, tripId?: string): BuiltSearch {
  const filter: Record<string, unknown> = { status: 'published' };
  let projectScore = false;

  const term = query.q?.trim();
  if (term) {
    filter.$text = { $search: term, $language: 'german' };
    projectScore = true;
  }
  if (query.country) filter.country = query.country;
  if (tripId) filter.tripId = tripId;

  const range: Record<string, Date> = {};
  if (query.from) range.$gte = new Date(query.from);
  if (query.to) range.$lte = new Date(query.to);
  if (Object.keys(range).length > 0) filter.postDate = range;

  const sort: BuiltSearch['sort'] = projectScore
    ? { score: { $meta: 'textScore' }, postDate: -1 }
    : { postDate: -1 };

  return { filter, sort, projectScore };
}
