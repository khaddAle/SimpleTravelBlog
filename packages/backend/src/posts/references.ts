import type { Block } from '@stb/shared';
import { Post } from '../db/models/Post.js';
import { Settings, SETTINGS_ID } from '../db/models/Settings.js';

/** All image shortIds referenced by a block list (image blocks + galleries). */
export function collectImageIds(blocks: Block[]): string[] {
  const ids: string[] = [];
  for (const block of blocks) {
    if (block.type === 'image') ids.push(block.imageId);
    else if (block.type === 'gallery') ids.push(...block.imageIds);
  }
  return ids;
}

/**
 * Set of every image shortId referenced by any post — used to find orphans.
 * `excludePostId` discounts one post's own references (the post being edited),
 * so images it no longer uses surface as orphans while ones pinned by any other
 * post, cover or settings background stay in-use.
 */
export async function imageIdsInUse(excludePostId?: string): Promise<Set<string>> {
  const postFilter = excludePostId ? { shortId: { $ne: excludePostId } } : {};
  const posts = await Post.find(postFilter, {
    blocks: 1,
    coverImageId: 1,
    // A published post's unpublished draft can reference images that aren't in
    // the live content yet; they must stay protected from the orphan cleanup.
    'draft.blocks': 1,
    'draft.coverImageId': 1,
  }).lean();
  const used = new Set<string>();
  for (const post of posts) {
    for (const id of collectImageIds((post.blocks ?? []) as Block[])) used.add(id);
    if (post.coverImageId) used.add(post.coverImageId);
    if (post.draft) {
      for (const id of collectImageIds((post.draft.blocks ?? []) as Block[])) used.add(id);
      if (post.draft.coverImageId) used.add(post.draft.coverImageId);
    }
  }
  // Blog background images (settings singleton) also pin their images.
  const settings = await Settings.findById(SETTINGS_ID, { backgroundImageIds: 1 }).lean();
  for (const id of settings?.backgroundImageIds ?? []) used.add(id);
  return used;
}

/** Whether an image is pinned as a blog background in the settings singleton. */
export async function imageReferencedBySettings(imageId: string): Promise<boolean> {
  return (await Settings.exists({ _id: SETTINGS_ID, backgroundImageIds: imageId })) != null;
}

export interface PostRef {
  id: string;
  title: string;
}

/** Published+draft posts that reference an image, for the delete-guard / usage view. */
export async function postsReferencingImage(imageId: string): Promise<PostRef[]> {
  const posts = await Post.find(
    {
      $or: [
        { blocks: { $elemMatch: { type: 'image', imageId } } },
        { blocks: { $elemMatch: { type: 'gallery', imageIds: imageId } } },
        { coverImageId: imageId },
        // A pending draft pins its images too (see imageIdsInUse).
        { 'draft.blocks': { $elemMatch: { type: 'image', imageId } } },
        { 'draft.blocks': { $elemMatch: { type: 'gallery', imageIds: imageId } } },
        { 'draft.coverImageId': imageId },
      ],
    },
    { shortId: 1, title: 1 },
  ).lean();
  return posts.map((p) => ({ id: p.shortId, title: p.title }));
}
