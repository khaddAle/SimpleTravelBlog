<script lang="ts">
  import type { ImageDto } from '@stb/shared';
  import {
    subscribeUploadProgress,
    type EventSourceFactory,
  } from '../../lib/uploads.js';

  interface Props {
    uploadId: string;
    onDone?: (image: ImageDto) => void;
    onError?: (message: string) => void;
    /** Injectable EventSource factory for tests. */
    eventSourceFactory?: EventSourceFactory | undefined;
  }

  let { uploadId, onDone, onError, eventSourceFactory }: Props = $props();

  let pct = $state(0);
  let status = $state<'uploading' | 'done' | 'error'>('uploading');
  let message = $state('');

  $effect(() => {
    status = 'uploading';
    pct = 0;
    const off = subscribeUploadProgress(
      uploadId,
      {
        onProgress: (value) => {
          pct = value;
        },
        onDone: (image) => {
          pct = 100;
          status = 'done';
          onDone?.(image);
        },
        onError: (msg) => {
          status = 'error';
          message = msg;
          onError?.(msg);
        },
      },
      eventSourceFactory,
    );
    return off;
  });
</script>

<div class="upload-progress" data-status={status}>
  {#if status === 'uploading'}
    <progress max="100" value={pct}></progress>
    <!-- pct is uniquely 0 only before processing starts (first real event is
         pct:10), so it doubles as the "queued behind the concurrency cap" state. -->
    {#if pct === 0}
      <span>In Warteschlange…</span>
    {:else}
      <span>Wird hochgeladen… {pct}%</span>
    {/if}
  {:else if status === 'done'}
    <span class="ok">Hochgeladen.</span>
  {:else}
    <span class="err" role="alert">Fehler: {message}</span>
  {/if}
</div>

<style>
  .upload-progress {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  progress {
    flex: 1;
  }
  .ok {
    color: #2f855a;
  }
  .err {
    color: #c53030;
  }
</style>
