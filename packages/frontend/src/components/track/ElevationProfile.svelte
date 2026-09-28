<script lang="ts" module>
  export type ProfilePointer = 'down' | 'move' | 'up' | 'leave';

  export interface ProfileCursor {
    /** Distance of the vertical cursor line; null hides it. */
    d: number | null;
    dots: { d: number; ele: number; color: string; out: boolean }[];
  }

  export interface ProfilePhoto {
    key: string;
    d: number;
    ele: number;
    color: string;
    multi: boolean;
  }
</script>

<script lang="ts">
  import type { TrackModel } from '../../lib/track/model.js';
  import { profileGeometry } from '../../lib/track/profile.js';

  let {
    model,
    height = 104,
    onpointer,
    cursor,
    photos = [],
    onphoto,
  }: {
    model: TrackModel;
    height?: number;
    /** Makes the profile interactive: pointer input as a distance along it. */
    onpointer?: (kind: ProfilePointer, d: number, e: PointerEvent) => void;
    cursor?: ProfileCursor | undefined;
    photos?: ProfilePhoto[];
    onphoto?: (key: string) => void;
  } = $props();

  // Drawn in CSS pixels (not a scaled viewBox) so labels stay crisp and sharp.
  let width = $state(0);
  const geo = $derived(profileGeometry(model, width, height));

  function pointer(kind: ProfilePointer, e: PointerEvent): void {
    if (!onpointer) return;
    const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const f = r.width > 0 ? (e.clientX - r.left) / r.width : 0;
    onpointer(kind, Math.min(model.maxDist, Math.max(0, f * model.maxDist)), e);
  }
</script>

<div class="profile-box" bind:clientWidth={width}>
  <svg
    class="profile"
    class:interactive={!!onpointer}
    width="100%"
    {height}
    viewBox={`0 0 ${Math.max(width, 1)} ${height}`}
    aria-hidden="true"
    onpointerdown={(e) => pointer('down', e)}
    onpointermove={(e) => pointer('move', e)}
    onpointerup={(e) => pointer('up', e)}
    onpointerleave={(e) => pointer('leave', e)}
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
      {#each photos as p (p.key)}
        <!-- Pointer-only extra: the same photos open from the map markers. -->
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <circle
          class="photo"
          cx={geo.x(p.d)}
          cy={geo.y(p.ele)}
          r={p.multi ? 5.5 : 4.5}
          stroke={p.color}
          onpointerdown={(e) => e.stopPropagation()}
          onclick={(e) => {
            e.stopPropagation();
            onphoto?.(p.key);
          }}
        />
      {/each}
      {#if cursor}
        {#if cursor.d !== null}
          <line class="cursor" x1={geo.x(cursor.d)} x2={geo.x(cursor.d)} y1="4" y2={geo.baseY} />
        {/if}
        {#each cursor.dots as dot, i (i)}
          <circle
            class="dot"
            class:out={dot.out}
            cx={geo.x(dot.d)}
            cy={geo.y(dot.ele)}
            r="5.5"
            fill={dot.color}
          />
        {/each}
      {/if}
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
  .profile.interactive {
    touch-action: none;
    cursor: crosshair;
    user-select: none;
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
  .cursor {
    stroke: var(--ink);
    stroke-width: 1;
    stroke-dasharray: 3 3;
    pointer-events: none;
  }
  .dot {
    stroke: #fff;
    stroke-width: 2;
    pointer-events: none;
  }
  .dot.out {
    opacity: 0.45;
  }
  .photo {
    fill: #fff;
    stroke-width: 2;
    cursor: pointer;
  }
</style>
