<script lang="ts">
  import type { PostDto } from '@stb/shared';
  import { coverImageId } from '../lib/posts.js';
  import { imageUrl } from '../lib/images.js';
  import { formatDate } from '../lib/dates.js';

  let { post }: { post: PostDto } = $props();
  const cover = $derived(coverImageId(post.blocks));
</script>

<a class="post-card" href={`#/beitrag/${post.id}`}>
  {#if cover}
    <img src={imageUrl(cover, 'thumb')} alt="" />
  {/if}
  <div class="body">
    <h3>{post.title}</h3>
    <p class="meta">{formatDate(post.postDate)} · {post.placeName}</p>
  </div>
</a>

<style>
  .post-card {
    display: block;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    overflow: hidden;
    text-decoration: none;
    color: inherit;
  }
  .post-card img {
    width: 100%;
    height: 160px;
    object-fit: cover;
    display: block;
  }
  .body {
    padding: 0.6rem 0.8rem;
  }
  h3 {
    margin: 0 0 0.25rem;
    font-size: 1.1rem;
  }
  .meta {
    margin: 0;
    font-size: 0.85rem;
    color: #718096;
  }
</style>
