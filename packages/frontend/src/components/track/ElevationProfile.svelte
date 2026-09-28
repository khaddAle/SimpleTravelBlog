<script lang="ts">
  import type { TrackModel } from '../../lib/track/model.js';
  import { profileGeometry } from '../../lib/track/profile.js';

  let { model, height = 104 }: { model: TrackModel; height?: number } = $props();

  // Drawn in CSS pixels (not a scaled viewBox) so labels stay crisp and sharp.
  let width = $state(0);
  const geo = $derived(profileGeometry(model, width, height));
</script>

<div class="profile-box" bind:clientWidth={width}>
  <svg
    class="profile"
    width="100%"
    {height}
    viewBox={`0 0 ${Math.max(width, 1)} ${height}`}
    aria-hidden="true"
  >
    {#if geo}
      <g class="grid">
        {#each geo.eleTicks as t (t.label)}
          <line x1="0" x2={width} y1={t.y} y2={t.y} />
        {/each}
      </g>
      {#each geo.areas as a, i (i)}
        <path
          d={a.d}
          fill={a.color}
          fill-opacity={a.fillOpacity}
          stroke={a.color}
          stroke-opacity="0.85"
          stroke-width="1.5"
        />
      {/each}
      <line class="base" x1="0" x2={width} y1={geo.baseY} y2={geo.baseY} />
      {#each geo.eleTicks as t (t.label)}
        <text class="lbl" x="3" y={t.labelY}>{t.label}</text>
      {/each}
      {#each geo.kmTicks as t (t.label)}
        <text class="lbl" x={t.x} y={height - 4} text-anchor="middle">{t.label}</text>
      {/each}
    {/if}
  </svg>
</div>

<style>
  .profile-box {
    width: 100%;
    margin-top: 8px;
  }
  .profile {
    display: block;
    overflow: visible;
  }
  .grid line {
    stroke: var(--line-soft);
    stroke-width: 1;
  }
  .base {
    stroke: var(--line);
  }
  .lbl {
    font-size: 10.5px;
    fill: var(--faint);
    font-variant-numeric: tabular-nums;
  }
</style>
