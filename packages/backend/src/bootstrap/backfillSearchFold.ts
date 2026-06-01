import { Post } from '../db/models/Post.js';
import { foldSearch } from '../posts/fold.js';
import type { BootstrapLogger } from './firstAdmin.js';

/**
 * Populate `searchFold` for posts saved before the field existed — notably the
 * WP-imported corpus. Idempotent and cheap: it only touches posts missing the
 * field, so it no-ops on every boot thereafter. Without it, those posts stay
 * invisible to the substring search until they happen to be re-saved.
 *
 * @returns the number of posts updated.
 */
export async function backfillSearchFold(logger?: BootstrapLogger): Promise<number> {
  const stale = await Post.find({ searchFold: { $exists: false } }, { searchText: 1 }).lean();
  if (stale.length === 0) return 0;

  await Post.bulkWrite(
    stale.map((p) => ({
      updateOne: {
        filter: { _id: p._id },
        update: { $set: { searchFold: foldSearch(p.searchText ?? '') } },
      },
    })),
  );

  logger?.info(`Backfilled searchFold for ${stale.length} post(s)`);
  return stale.length;
}
