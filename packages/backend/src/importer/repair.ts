import type { Block } from '@stb/shared';

/**
 * Pure planner for the image-recovery repair. Given a post's CURRENT live blocks
 * and the CORRECTED blocks (re-mapped from the WP corpus with the fixed parser,
 * already resolved to imageIds — existing ids reused for kept images, fresh ids
 * for recovered ones), decide whether and how to update the live post.
 *
 * The corrected block list is the desired final state, so a clean update is just
 * "replace blocks with corrected" — but only when we are confident the post has
 * not been edited by hand since import. The safety gate is the **text content**:
 * the fix changes how a `<p>` is split (and adds images), but never the words. So
 * we compare the concatenated, whitespace-stripped text of the text blocks. Equal
 * → segmentation/image-only differences → safe to apply. Different → the prose was
 * edited → `diverged`, leave it for a human. We also refuse to apply if a live
 * image is absent from the corpus mapping (an image the user added/changed), so
 * recovery never deletes the editor's own work. Top-level post metadata
 * (location, cover, dates, status) is out of scope here — the caller preserves it.
 */

export type RepairStatus = 'noop' | 'apply' | 'diverged';

export interface RepairPlan {
  status: RepairStatus;
  /** The desired final blocks (the corrected list). Apply only when status === 'apply'. */
  mergedBlocks: Block[];
  /** imageIds present in corrected but not live — the images this repair adds. */
  addedImageIds: string[];
  /** Human-readable explanation when status === 'diverged'. */
  reason?: string;
}

const TEXT_TYPES = new Set<Block['type']>(['title', 'subtitle', 'paragraph', 'quote']);

/** Concatenated text of a post's text blocks, stripped of all whitespace, so
 *  re-segmentation and spacing differences don't register as edits. */
function textKey(blocks: Block[]): string {
  return blocks
    .map((b) => (TEXT_TYPES.has(b.type) && 'text' in b ? b.text : ''))
    .join('')
    .replace(/\s+/g, '');
}

/** Every imageId referenced by a block list, in document order. */
function imageIds(blocks: Block[]): string[] {
  const ids: string[] = [];
  for (const b of blocks) {
    if (b.type === 'image') ids.push(b.imageId);
    else if (b.type === 'gallery') ids.push(...b.imageIds);
  }
  return ids;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const aArr = Array.isArray(a);
  if (aArr !== Array.isArray(b)) return false;
  if (aArr && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const ak = Object.keys(ao);
  const bk = Object.keys(bo);
  return ak.length === bk.length && ak.every((k) => k in bo && deepEqual(ao[k], bo[k]));
}

/** Multiset difference `a \ b` (counts honoured), preserving a's order. */
function multisetMinus(a: string[], b: string[]): string[] {
  const remaining = new Map<string, number>();
  for (const id of b) remaining.set(id, (remaining.get(id) ?? 0) + 1);
  const out: string[] = [];
  for (const id of a) {
    const n = remaining.get(id) ?? 0;
    if (n > 0) remaining.set(id, n - 1);
    else out.push(id);
  }
  return out;
}

export function planRepair(live: Block[], corrected: Block[]): RepairPlan {
  if (textKey(live) !== textKey(corrected)) {
    return {
      status: 'diverged',
      mergedBlocks: corrected,
      addedImageIds: [],
      reason: 'paragraph text differs from the corpus — edited since import',
    };
  }

  const liveIds = imageIds(live);
  const corrIds = imageIds(corrected);

  // Any live image not present in the corpus mapping means the editor added or
  // swapped an image; never overwrite that.
  const orphanLive = multisetMinus(liveIds, corrIds);
  if (orphanLive.length > 0) {
    return {
      status: 'diverged',
      mergedBlocks: corrected,
      addedImageIds: [],
      reason: `live image(s) absent from the corpus mapping: ${orphanLive.join(', ')}`,
    };
  }

  if (deepEqual(live, corrected)) {
    return { status: 'noop', mergedBlocks: corrected, addedImageIds: [] };
  }

  return { status: 'apply', mergedBlocks: corrected, addedImageIds: multisetMinus(corrIds, liveIds) };
}
