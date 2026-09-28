<script lang="ts" module>
  import type { PostTrackRef } from '@stb/shared';

  export interface TrackState {
    tracks: PostTrackRef[];
    utcOffsetMinutes?: number;
  }
</script>

<script lang="ts">
  interface Props {
    value: TrackState;
    imageIds: string[];
    onChange: (next: TrackState) => void;
  }
  let { value: _value, imageIds: _imageIds, onChange: _onChange }: Props = $props();
</script>
