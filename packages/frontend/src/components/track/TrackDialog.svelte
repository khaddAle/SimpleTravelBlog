<script lang="ts">
  import type { PostDto } from '@stb/shared';
  import type { TrackModel } from '../../lib/track/model.js';

  let {
    model: _model,
    title: _title,
    images: _images,
    onClose: _onClose,
  }: {
    model: TrackModel;
    title: string;
    images?: PostDto['images'];
    onClose: () => void;
  } = $props();
</script>
