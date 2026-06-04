import type { PublicPostHead, TripDto } from '@stb/shared';
import { countryName } from './countries.js';

/** The three reader-facing ways to slice the archive. */
export type GroupMode = 'reise' | 'land' | 'jahr';

export interface ArchiveGroup {
  /** Stable key for accordion open-state and `{#each}` keying. */
  key: string;
  label: string;
  /** ISO date of the newest post in the group (drives group ordering). */
  latestDate: string;
  /** Posts newest-first. */
  posts: PublicPostHead[];
  /** "Ohne Reise" / "Ohne Land" catch-all buckets sort to the very bottom. */
  pinnedLast: boolean;
}

// The WP import stamps geo-less posts with country 'XX'; those collect in the
// "Ohne Land" bucket rather than a bogus country group.
const PLACEHOLDER_COUNTRY = 'XX';
const NONE_KEY = '__none__';

interface Bucket {
  key: string;
  label: string;
  pinnedLast: boolean;
  posts: PublicPostHead[];
}

/** Resolve each post to its bucket key + label for the chosen grouping mode. */
function bucketOf(
  mode: GroupMode,
  post: PublicPostHead,
  tripNames: Map<string, string>,
): { key: string; label: string; pinnedLast: boolean } {
  if (mode === 'reise') {
    const name = post.tripId ? tripNames.get(post.tripId) : undefined;
    if (post.tripId && name) return { key: post.tripId, label: name, pinnedLast: false };
    return { key: NONE_KEY, label: 'Ohne Reise', pinnedLast: true };
  }
  if (mode === 'land') {
    if (post.country === PLACEHOLDER_COUNTRY) {
      return { key: NONE_KEY, label: 'Ohne Land', pinnedLast: true };
    }
    return { key: post.country, label: countryName(post.country), pinnedLast: false };
  }
  // jahr
  const year = String(new Date(post.postDate).getFullYear());
  return { key: year, label: year, pinnedLast: false };
}

/**
 * Group post heads for the archive accordion. Posts within a group are
 * newest-first; groups are sorted by their newest post (descending), with the
 * "Ohne Reise"/"Ohne Land" catch-all buckets always pinned to the bottom.
 * Pure + client-side, so switching mode never needs a refetch.
 */
export function groupBy(
  mode: GroupMode,
  heads: PublicPostHead[],
  trips: TripDto[],
): ArchiveGroup[] {
  const tripNames = new Map(trips.map((t) => [t.id, t.name]));
  const buckets = new Map<string, Bucket>();

  for (const post of heads) {
    const { key, label, pinnedLast } = bucketOf(mode, post, tripNames);
    const bucket = buckets.get(key) ?? { key, label, pinnedLast, posts: [] };
    bucket.posts.push(post);
    buckets.set(key, bucket);
  }

  return [...buckets.values()]
    .map((b) => {
      const posts = [...b.posts].sort((a, c) => c.postDate.localeCompare(a.postDate));
      return {
        key: b.key,
        label: b.label,
        latestDate: posts[0]?.postDate ?? '',
        posts,
        pinnedLast: b.pinnedLast,
      };
    })
    .sort((a, b) => {
      // Catch-all buckets always last; otherwise newest group first.
      if (a.pinnedLast !== b.pinnedLast) return a.pinnedLast ? 1 : -1;
      return b.latestDate.localeCompare(a.latestDate);
    });
}
