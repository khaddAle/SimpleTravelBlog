<script lang="ts" module>
  import type { PostTrackRef } from '@stb/shared';

  /** The post's GPS-track fields, edited by this panel. */
  export interface TrackState {
    tracks: PostTrackRef[];
    utcOffsetMinutes?: number;
  }
</script>

<script lang="ts">
  import { untrack } from 'svelte';
  import type { TrackDto, TrackPreviewRequest, TrackPreviewResponse } from '@stb/shared';
  import { api, ApiError } from '../../lib/api.js';
  import { fmtKm, fmtM, fmtOffset, OFFSET_CHOICES } from '../../lib/track/format.js';
  import { trackColor } from '../../lib/track/colors.js';

  interface Props {
    value: TrackState;
    /** The post's photos (blocks + cover), for the placement preview. */
    imageIds: string[];
    onChange: (next: TrackState) => void;
  }

  let { value, imageIds, onChange }: Props = $props();

  // Copied once, like MetadataSidebar; the editor remounts us to reseed.
  let local = $state<TrackState>(
    untrack(() => ({
      tracks: value.tracks.map((t) => ({ ...t })),
      ...(value.utcOffsetMinutes !== undefined ? { utcOffsetMinutes: value.utcOffsetMinutes } : {}),
    })),
  );
  let dtos = $state<Record<string, TrackDto>>({});
  let uploading = $state(false);
  let error = $state('');
  let preview = $state<TrackPreviewResponse | null>(null);

  const labelOf = (i: number): string =>
    local.tracks[i]?.label.trim() || `Person ${i + 1}`;

  /** What the post stores: blank labels fall back, prefixes only matter with two tracks. */
  function normalized(): PostTrackRef[] {
    const two = local.tracks.length === 2;
    return local.tracks.map((t, i) => ({
      trackId: t.trackId,
      label: labelOf(i),
      ...(two && t.prefix?.trim() ? { prefix: t.prefix.trim() } : {}),
    }));
  }

  function emit(): void {
    onChange({
      tracks: normalized(),
      ...(local.utcOffsetMinutes !== undefined ? { utcOffsetMinutes: local.utcOffsetMinutes } : {}),
    });
  }

  // Name + stats of attached tracks (the post only stores the reference).
  $effect(() => {
    for (const { trackId } of local.tracks) {
      if (untrack(() => dtos[trackId])) continue;
      api
        .getTrack(trackId)
        .then((dto) => (dtos[trackId] = dto))
        .catch(() => {});
    }
  });

  async function onFile(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    error = '';
    uploading = true;
    try {
      const dto = await api.uploadTrack(file);
      dtos[dto.id] = dto;
      local.tracks.push({ trackId: dto.id, label: `Person ${local.tracks.length + 1}` });
      emit();
    } catch (err) {
      error = err instanceof ApiError ? err.message : 'Hochladen fehlgeschlagen.';
    } finally {
      uploading = false;
    }
  }

  function remove(i: number): void {
    local.tracks.splice(i, 1);
    emit();
  }

  // Placement preview, debounced; re-requested only when its input changes
  // (the editor recomputes imageIds on every block edit).
  let lastKey = '';
  let seq = 0;
  $effect(() => {
    const tracks = normalized();
    if (!tracks.length) {
      preview = null;
      lastKey = '';
      return;
    }
    const off = local.utcOffsetMinutes;
    const req: TrackPreviewRequest = {
      tracks,
      ...(off !== undefined ? { utcOffsetMinutes: off } : {}),
      imageIds,
    };
    const key = JSON.stringify(req);
    if (key === lastKey) return;
    lastKey = key;
    const mine = ++seq;
    const timer = setTimeout(() => {
      api
        .previewTracks(req)
        .then((res) => {
          if (mine !== seq) return;
          preview = res;
          // Prefill the offset from the suggestion; always editable.
          if (local.utcOffsetMinutes === undefined) {
            local.utcOffsetMinutes = res.suggestion.offset;
            emit();
          }
        })
        .catch(() => {
          if (mine === seq) preview = null;
        });
    }, 300);
    return () => clearTimeout(timer);
  });

  /** "Fotos: 5 Anna · 4 Ben · 2 am Ende". */
  const summary = $derived.by(() => {
    if (!preview) return '';
    if (!preview.photos.length) return 'Noch keine Fotos im Beitrag.';
    const on = local.tracks.map(() => 0);
    let start = 0;
    let end = 0;
    for (const p of preview.photos) {
      if (p.where === 'on') {
        if (p.track < on.length) on[p.track] = (on[p.track] ?? 0) + 1;
      } else if (p.where === 'before') start++;
      else end++;
    }
    const parts = on.map((n, i) => `${n} ${labelOf(i)}`);
    if (start) parts.push(`${start} am Start`);
    if (end) parts.push(`${end} am Ende`);
    return `Fotos: ${parts.join(' · ')}`;
  });
</script>

<section class="panel" aria-labelledby="track-panel-h">
  <h3 id="track-panel-h">GPS-Tracks</h3>

  {#if local.tracks.length}
    <ul class="list">
      {#each local.tracks as ref, i (ref.trackId)}
        {@const dto = dtos[ref.trackId]}
        <li class="track">
          <div class="head">
            <span class="swatch" style:background={trackColor(i)}></span>
            <span class="name">{dto ? dto.name || dto.originalFilename : 'Lädt…'}</span>
          </div>
          {#if dto}
            <span class="meta">{fmtKm(dto.stats.distance)} · {fmtM(dto.stats.ascent)} ↑</span>
          {/if}
          <label class="fld">
            Bezeichnung
            <input
              type="text"
              maxlength="40"
              value={ref.label}
              oninput={(e) => {
                ref.label = e.currentTarget.value;
                emit();
              }}
            />
          </label>
          {#if local.tracks.length === 2}
            <label class="fld">
              Dateiname beginnt mit
              <input
                type="text"
                maxlength="40"
                placeholder="z. B. IMG_"
                value={ref.prefix ?? ''}
                oninput={(e) => {
                  ref.prefix = e.currentTarget.value;
                  emit();
                }}
              />
            </label>
          {/if}
          <button type="button" class="tb-btn" onclick={() => remove(i)}>Entfernen</button>
        </li>
      {/each}
    </ul>
  {/if}

  {#if local.tracks.length < 2}
    <label class="tb-btn upload" class:busy={uploading}>
      GPX hochladen
      <input type="file" accept=".gpx" disabled={uploading} onchange={onFile} />
    </label>
  {/if}
  {#if uploading}
    <p class="hint">Lädt hoch…</p>
  {/if}
  {#if error}
    <p class="err" role="alert">{error}</p>
  {/if}

  {#if local.tracks.length}
    <label class="fld">
      Zeitzone der Fotos
      <select
        value={local.utcOffsetMinutes !== undefined ? String(local.utcOffsetMinutes) : ''}
        onchange={(e) => {
          local.utcOffsetMinutes = Number(e.currentTarget.value);
          emit();
        }}
      >
        {#if local.utcOffsetMinutes === undefined}
          <option value="" disabled>—</option>
        {/if}
        {#each OFFSET_CHOICES as off (off)}
          <option value={String(off)}>{fmtOffset(off)}</option>
        {/each}
      </select>
    </label>
    {#if preview}
      <p class="hint">
        Vorschlag: {fmtOffset(preview.suggestion.offset)} ({preview.suggestion.reason})
      </p>
      <p class="summary">{summary}</p>
    {/if}
  {/if}
</section>

<style>
  .panel {
    background: var(--surface);
    border: 1px solid var(--line);
    box-shadow: var(--shadow-frame-sm);
    padding: 18px;
  }
  .panel h3 {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--faint);
    margin: 0 0 14px;
  }
  .list {
    list-style: none;
    margin: 0 0 14px;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .track {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-bottom: 14px;
    border-bottom: 1px solid var(--keyline);
  }
  .head {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .swatch {
    width: 14px;
    height: 4px;
    border-radius: 2px;
    flex: none;
  }
  .name {
    font-size: 14px;
    font-weight: 600;
    color: var(--ink);
    overflow-wrap: anywhere;
  }
  .meta {
    font-size: 12.5px;
    color: var(--muted);
  }
  .fld {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 10px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--faint);
  }
  .fld input,
  .fld select {
    font: inherit;
    font-size: 14px;
    font-weight: 400;
    letter-spacing: normal;
    text-transform: none;
    color: var(--ink);
    background: var(--panel);
    border: 1px solid var(--line);
    padding: 10px 11px;
    border-radius: 6px;
    appearance: none;
  }
  .fld input:focus,
  .fld select:focus {
    outline: none;
    border-color: var(--accent);
    background: var(--surface);
  }
  .tb-btn {
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    color: var(--ink);
    background: var(--surface);
    border: 1px solid var(--line);
    padding: 9px 13px;
    border-radius: 7px;
    cursor: pointer;
    align-self: flex-start;
    margin-top: 8px;
  }
  .tb-btn:hover {
    border-color: var(--accent);
  }
  .upload {
    display: inline-block;
    position: relative;
    overflow: hidden;
  }
  .upload input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }
  .upload.busy {
    opacity: 0.6;
    pointer-events: none;
  }
  .hint,
  .summary {
    font-size: 12.5px;
    color: var(--muted);
    margin: 8px 0 0;
  }
  .summary {
    color: var(--ink);
  }
  .err {
    color: #b4452f;
    background: #f7e4df;
    padding: 8px 11px;
    margin: 10px 0 0;
    font-size: 13px;
  }
</style>
