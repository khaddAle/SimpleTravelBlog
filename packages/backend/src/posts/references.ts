import type { Block } from '@stb/shared';
import { Post } from '../db/models/Post.js';

/** All image shortIds referenced by a block list (image blocks + galleries). */
export function collectImageIds(blocks: Block[]): string[] {
  const ids: string[] = [];
  for (const block of blocks) {
    if (block.type === 'image') ids.push(block.imageId);
    else if (block.type === 'gallery') ids.push(...block.imageIds);
  }
  return ids;
}

/** Set of every image shortId referenced by any post — used to find orphans. */
export async function imageIdsInUse(): Promise<Set<string>> {
  const posts = await Post.find({}, { blocks: 1 }).lean();
  const used = new Set<string>();
  for (const post of posts) {
    for (const id of collectImageIds((post.blocks ?? []) as Block[])) used.add(id);
  }
  return used;
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
      ],
    },
    { shortId: 1, title: 1 },
  ).lean();
  return posts.map((p) => ({ id: p.shortId, title: p.title }));
}
