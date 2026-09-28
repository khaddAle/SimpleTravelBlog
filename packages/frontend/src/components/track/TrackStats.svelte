<script lang="ts">
  import type { TrackModel } from '../../lib/track/model.js';
  import { fmtDuration, fmtKm, fmtM } from '../../lib/track/format.js';

  let { model }: { model: TrackModel } = $props();
</script>

<div class="stats">
  {#each model.tracks as t, i (i)}
    <div class="row">
      {#if model.tracks.length > 1}
        <span class="who"><span class="sw" style:background={t.color}></span>{t.label}</span>
      {/if}
      <span class="v"><b>{fmtKm(t.stats.distance)}</b></span>
      <span class="v">↑ <b>{fmtM(t.stats.ascent)}</b></span>
      <span class="v">↓ <b>{fmtM(t.stats.descent)}</b></span>
      <span class="v"><b>{fmtDuration(t.stats.movingMs)}</b> in Bewegung</span>
    </div>
  {/each}
</div>

<style>
  .stats {
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-size: 13px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0 14px;
  }
  .who {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    color: var(--ink);
    font-weight: 600;
    min-width: 64px;
  }
  .sw {
    width: 14px;
    height: 3px;
    display: inline-block;
  }
  .v b {
    color: var(--ink);
    font-weight: 600;
  }
</style>
