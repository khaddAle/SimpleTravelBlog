<script lang="ts">
  import type { Block } from '@stb/shared';
  import { coverImageId } from '../lib/posts.js';
  import { imageUrl } from '../lib/images.js';
  import { formatDate } from '../lib/dates.js';
  import Photo from './Photo.svelte';

  // Accepts either a full post or a lightweight head (no blocks). When blocks are
  // present we keep the first-image fallback; heads must carry an explicit cover.
  interface CardPost {
    id: string;
    title: string;
    placeName: string;
    postDate: string;
    coverImageId?: string | undefined;
    blocks?: Block[] | undefined;
  }

  let { post }: { post: CardPost } = $props();
  // Prefer an explicit per-post cover; fall back to the first block thumbnail.
  const cover = $derived(post.coverImageId ?? (post.blocks ? coverImageId(post.blocks) : undefined));
</script>

<a class="card" href={`#/beitrag/${post.id}`}>
  <Photo src={cover ? imageUrl(cover, 'thumb') : undefined} ratio="r43" size="sm" />
  <h3>{post.title}</h3>
  <div class="meta">{post.placeName} · {formatDate(post.postDate)}</div>
</a>
