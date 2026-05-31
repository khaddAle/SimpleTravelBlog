<script lang="ts">
  import type { PostDto } from '@stb/shared';
  import { coverImageId } from '../lib/posts.js';
  import { imageUrl } from '../lib/images.js';
  import { formatDate } from '../lib/dates.js';
  import Photo from './Photo.svelte';

  let { post }: { post: PostDto } = $props();
  // Prefer an explicit per-post cover; fall back to the first block thumbnail.
  const cover = $derived(post.coverImageId ?? coverImageId(post.blocks));
</script>

<a class="card" href={`#/beitrag/${post.id}`}>
  <Photo src={cover ? imageUrl(cover, 'thumb') : undefined} ratio="r43" size="sm" />
  <h3>{post.title}</h3>
  <div class="meta">{post.placeName} · {formatDate(post.postDate)}</div>
</a>
