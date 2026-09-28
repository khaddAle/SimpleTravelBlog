<script lang="ts">
  import { untrack } from 'svelte';
  import L from 'leaflet';
  import { positionAtTime, timeAtDistance, type PostDto } from '@stb/shared';
  import type { TrackModel } from '../../lib/track/model.js';
  import { addTrackTiles } from '../../lib/track/tiles.js';
  import { drawTracks } from '../../lib/track/draw.js';
  import { fmtKm, fmtLocal, fmtLocalDay, fmtM, fmtOffset } from '../../lib/track/format.js';
  import { buildTimeline, gapAt, Replay } from '../../lib/track/replay.js';
  import { photoGroups, type ReaderPhotoGroup } from '../../lib/track/photos.js';
  import { cardLayout } from '../../lib/track/card.js';
  import { imageUrl } from '../../lib/images.js';
  import ElevationProfile, { type ProfilePointer } from './ElevationProfile.svelte';
  import TrackStats from './TrackStats.svelte';

  let {
    model,
    title,
    images,
    onClose,
  }: {
    model: TrackModel;
    title: string;
    images?: PostDto['images'];
    onClose: () => void;
  } = $props();

  const SPEEDS = [10, 30, 60, 120, 300, 600];
  const NOTE = { before: 'vor dem Start', after: 'nach dem Ende', notime: 'ohne Aufnahmezeit' };

  // The model is fixed while the dialog is open.
  const m = untrack(() => model);
  const two = m.tracks.length > 1;
  const offset = m.utcOffsetMinutes;
  const groups = photoGroups(m);
  const replay = new Replay(
    buildTimeline(m.tracks),
    m.photos.map((p) => p.t),
  );
  const { tMin, tMax } = replay.timeline;

  let clock = $state(replay.clock);
  let playing = $state(false);
  let speed = $state(60);
  let showPhotos = $state(false);
  let follow = $state(0);
  // Profile hover: the time and distance under the pointer, or null.
  let hover = $state<{ t: number; d: number } | null>(null);
  let card = $state<{ group: ReaderPhotoGroup; idx: number; auto: boolean } | null>(null);

  let closeBtn = $state<HTMLButtonElement>();
  let mapEl = $state<HTMLDivElement>();
  let wrapW = $state(0);
  let wrapH = $state(0);
  // Bumped on every map move/zoom so the card and leader line follow.
  let mapTick = $state(0);
  let map: L.Map | null = null;
  let photoLayer: L.LayerGroup | null = null;
  let people: L.Marker[] = [];
  // Leaflet owns the marker state: a plain list, not reactive.
  let photoMarkers: { key: string; mk: L.Marker }[] = [];
  let raf = 0;

  const shownT = $derived(hover?.t ?? clock);
  const positions = $derived(m.tracks.map((t) => positionAtTime(t.series, shownT)));
  const gap = $derived(gapAt(clock, replay.timeline));
  const scrub = $derived(Math.round(((clock - tMin) / (tMax - tMin || 1)) * 1000));
  const cursor = $derived({
    d: hover?.d ?? positions[follow]?.d ?? null,
    dots: positions.map((p, i) => ({
      d: p.d,
      ele: p.ele,
      color: m.tracks[i]!.color,
      out: p.out !== null,
    })),
  });
  const profilePhotos = $derived(
    showPhotos
      ? groups.map((g) => ({
          key: g.key,
          d: g.pos.d,
          ele: g.pos.ele,
          color: m.tracks[g.track]!.color,
          multi: g.photos.length > 1,
        }))
      : [],
  );
  const photo = $derived(card ? card.group.photos[card.idx] : undefined);
  const layout = $derived.by(() => {
    void mapTick;
    if (!card || !photo || !map || wrapW <= 0 || wrapH <= 0) return null;
    const size = images?.[photo.imageId];
    const pt = map.latLngToContainerPoint([card.group.pos.lat, card.group.pos.lon]);
    return cardLayout(pt, wrapW, wrapH, size ? size.height / size.width : 0.75);
  });

  // ---- map ----------------------------------------------------------------
  $effect(() => {
    if (!mapEl) return;
    const mp = L.map(mapEl, { zoomSnap: 0.25 });
    mp.attributionControl.setPrefix(false);
    addTrackTiles(mp);
    drawTracks(L.layerGroup().addTo(mp), m);
    photoLayer = L.layerGroup().addTo(mp);
    people = m.tracks.map((t, i) =>
      L.marker(t.latlngs[0]!, {
        icon: L.divIcon({
          className: '',
          html: `<div class="mk-person" style="background:${t.color}"></div>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        }),
        interactive: false,
        zIndexOffset: 1000 + m.tracks.length - i,
      }).addTo(mp),
    );
    mp.fitBounds(m.bounds, { padding: [30, 30] });
    mp.on('move zoom resize', () => mapTick++);
    map = mp;
    untrack(() => mapTick++);
    // The dialog's layout settles after the first paint (mobile especially):
    // measure again and re-fit.
    const fit = requestAnimationFrame(() => {
      mp.invalidateSize();
      mp.fitBounds(m.bounds, { padding: [30, 30] });
    });
    return () => {
      cancelAnimationFrame(fit);
      map = null;
      mp.remove();
    };
  });

  // People dots follow the shown time; during replay the followed person stays in view.
  $effect(() => {
    void mapTick;
    positions.forEach((p, i) => {
      const mk = people[i];
      mk?.setLatLng([p.lat, p.lon]);
      mk?.getElement()?.firstElementChild?.classList.toggle('out', p.out !== null);
    });
    const fp = positions[follow];
    if (map && fp && playing && !hover) {
      if (!map.getBounds().pad(-0.08).contains([fp.lat, fp.lon])) {
        map.panTo([fp.lat, fp.lon], { animate: true, duration: 0.4 });
      }
    }
  });

  // Photo spots on the map, only while photos are shown.
  $effect(() => {
    const on = showPhotos;
    void mapTick;
    untrack(() => {
      if (!photoLayer || photoMarkers.length === (on ? groups.length : 0)) return;
      photoLayer.clearLayers();
      photoMarkers = [];
      if (!on) return;
      for (const g of groups) {
        const multi = g.photos.length > 1;
        const html = `<div class="mk-photo${multi ? ' multi' : ''}" style="border-color:${m.tracks[g.track]!.color}">${multi ? g.photos.length : ''}</div>`;
        const mk = L.marker([g.pos.lat, g.pos.lon], {
          icon: L.divIcon({
            className: '',
            html,
            iconSize: multi ? [19, 19] : [14, 14],
            iconAnchor: multi ? [9.5, 9.5] : [7, 7],
          }),
          zIndexOffset: 500,
          title: 'Foto anzeigen',
        }).addTo(photoLayer);
        mk.on('click', () => openGroup(g));
        photoMarkers.push({ key: g.key, mk });
      }
    });
  });

  // Highlight the spot of the open card.
  $effect(() => {
    const key = card?.group.key;
    for (const p of photoMarkers) {
      p.mk.getElement()?.firstElementChild?.classList.toggle('active', p.key === key);
    }
  });

  // ---- replay -------------------------------------------------------------
  function sync(): void {
    clock = replay.clock;
    playing = replay.playing;
  }
  function tick(now: number): void {
    if (!replay.playing) return;
    const r = replay.frame(now);
    if (r.closeCard) card = null;
    if (r.photo !== undefined) {
      const index = r.photo;
      const group = groups.find((g) => g.photos.some((p) => p.index === index));
      if (group) card = { group, idx: group.photos.findIndex((p) => p.index === index), auto: true };
    }
    sync();
    if (replay.playing) raf = requestAnimationFrame(tick);
  }
  function setPlaying(on: boolean): void {
    cancelAnimationFrame(raf);
    if (on) {
      card = null;
      replay.play(performance.now());
      raf = requestAnimationFrame(tick);
    } else {
      replay.pause();
    }
    sync();
  }
  function seek(t: number): void {
    replay.seek(t);
    if (card?.auto) card = null;
    sync();
  }
  function setSpeed(v: number): void {
    speed = v;
    replay.speed = v;
  }
  function togglePhotos(): void {
    showPhotos = !showPhotos;
    replay.showPhotos = showPhotos;
    if (!showPhotos) card = null;
  }

  // ---- photo card ---------------------------------------------------------
  function openGroup(g: ReaderPhotoGroup): void {
    setPlaying(false);
    card = { group: g, idx: 0, auto: false };
  }
  function openPhotoSpot(key: string): void {
    const g = groups.find((x) => x.key === key);
    if (g) openGroup(g);
  }
  function stepCard(step: number): void {
    if (!card) return;
    const n = card.group.photos.length;
    card = { group: card.group, idx: (card.idx + step + n) % n, auto: false };
  }
  function closeCard(): void {
    card = null;
    replay.releaseHold();
  }

  // ---- profile hover / touch-drag / click-to-seek -------------------------
  let dragStart: { x: number; touch: boolean } | null = null;
  function onProfile(kind: ProfilePointer, d: number, e: PointerEvent): void {
    const tr = m.tracks[follow]!;
    const at = { t: timeAtDistance(tr.series, d), d: Math.min(d, tr.stats.distance) };
    const mouse = e.pointerType === 'mouse';
    if (kind === 'down') {
      (e.currentTarget as Element | null)?.setPointerCapture?.(e.pointerId);
      dragStart = { x: e.clientX, touch: !mouse };
      hover = at;
    } else if (kind === 'move') {
      if (mouse || dragStart) hover = at;
    } else if (kind === 'up') {
      // A click, or a short tap on touch (not a drag), seeks the replay.
      if (dragStart && (!dragStart.touch || Math.abs(e.clientX - dragStart.x) < 8)) seek(at.t);
      dragStart = null;
      if (!mouse) hover = null;
    } else if (!dragStart) {
      hover = null;
    }
  }

  // ---- dialog -------------------------------------------------------------
  function onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      if (card) closeCard();
      else onClose();
    } else if (event.key === ' ') {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === 'SELECT' || tag === 'BUTTON' || tag === 'INPUT') return;
      event.preventDefault();
      setPlaying(!replay.playing);
    }
  }

  $effect(() => {
    window.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      cancelAnimationFrame(raf);
    };
  });

  $effect(() => {
    closeBtn?.focus();
  });

  function onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) onClose();
  }
</script>

<!-- Keyboard handling is global (window keydown), as in the Lightbox. -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  class="tm-modal"
  role="dialog"
  aria-modal="true"
  aria-label="GPS-Track"
  tabindex="-1"
  onclick={onBackdrop}
>
  <div class="tm-dialog">
    <div class="tm-top">
      <div class="ttl"><small>GPS-Track</small><span>{title}</span></div>
      {#if two}
        <span class="seg-lbl">Folgen</span>
        <div class="seg" role="group" aria-label="Folgen">
          {#each m.tracks as t, i (i)}
            <button
              type="button"
              class:on={follow === i}
              aria-pressed={follow === i}
              style:--c={t.color}
              onclick={() => (follow = i)}
              ><span class="sw" style:background={t.color} aria-hidden="true"></span>{t.label}</button
            >
          {/each}
        </div>
      {/if}
      {#if m.photos.length}
        <button
          class="btn"
          class:on={showPhotos}
          type="button"
          aria-pressed={showPhotos}
          onclick={togglePhotos}
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"
            ><rect x="1.5" y="3.5" width="13" height="10" rx="1" /><circle cx="8" cy="8.5" r="2.6" /><path
              d="M5.5 3.5 6.5 2h3l1 1.5"
            /></svg
          >
          Fotos einblenden
        </button>
      {/if}
      <button class="tm-close" type="button" aria-label="Schließen" bind:this={closeBtn} onclick={onClose}
        >×</button
      >
    </div>

    <div class="tm-mapwrap" bind:clientWidth={wrapW} bind:clientHeight={wrapH}>
      <div class="tm-map" bind:this={mapEl}></div>
      {#if layout}
        <svg class="tm-leader" aria-hidden="true">
          <line x1={layout.leader.x1} y1={layout.leader.y1} x2={layout.leader.x2} y2={layout.leader.y2} />
          <circle cx={layout.leader.x2} cy={layout.leader.y2} r="11" />
        </svg>
      {/if}
      {#if card && photo}
        {@const size = images?.[photo.imageId]}
        <div
          class="tm-card"
          class:compact={layout?.compact}
          style:left={layout ? `${layout.left}px` : null}
          style:top={layout ? `${layout.top}px` : null}
          style:width={layout ? `${layout.width}px` : null}
        >
          <button class="x" type="button" aria-label="Foto schließen" onclick={closeCard}>×</button>
          <img
            src={imageUrl(photo.imageId, 'display')}
            alt=""
            style:aspect-ratio={size ? `${size.width} / ${size.height}` : '4 / 3'}
          />
          <div class="cap">
            <span>
              <b>{photo.where === 'on' ? fmtLocal(photo.t, offset) : '–'}</b>
              {#if two}· {m.tracks[photo.track]?.label}{/if}
              {#if photo.where !== 'on'}· <span class="note">{NOTE[photo.where]}</span>{/if}
            </span>
            {#if card.group.photos.length > 1}
              <span class="nav">
                <button type="button" aria-label="Vorheriges Foto" onclick={() => stepCard(-1)}>‹</button>
                {card.idx + 1}/{card.group.photos.length}
                <button type="button" aria-label="Nächstes Foto" onclick={() => stepCard(1)}>›</button>
              </span>
            {/if}
          </div>
          {#if card.auto}
            <!-- One element per photo: the CSS countdown restarts even when the
                 next photo of the same spot replaces this one in place. -->
            {#key photo.index}
              <div class="hold run"></div>
            {/key}
          {/if}
        </div>
      {/if}
    </div>

    <div class="tm-readout">
      <span><b>{fmtLocal(shownT, offset)}</b></span>
      {#each positions as p, i (i)}
        <span class="who">
          <i style:background={m.tracks[i]!.color}></i>
          {#if two}{m.tracks[i]!.label}{/if}
          <b>{fmtKm(p.d)}</b> · <b>{fmtM(p.ele)}</b>
          {#if p.out === 'before'}<span class="off">noch nicht gestartet</span>{/if}
          {#if p.out === 'after'}<span class="off">im Ziel</span>{/if}
        </span>
      {/each}
      {#if hover}<span class="off">Klick setzt die Wiedergabe hierher</span>{/if}
    </div>

    <ElevationProfile
      model={m}
      height={120}
      onpointer={onProfile}
      {cursor}
      photos={profilePhotos}
      onphoto={openPhotoSpot}
    />

    <div class="tm-controls">
      <button
        class="tm-play"
        type="button"
        aria-label={playing ? 'Pause' : 'Abspielen'}
        onclick={() => setPlaying(!playing)}
      >
        {#if playing}
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"
            ><rect x="3.5" y="2.5" width="3" height="11" /><rect x="9.5" y="2.5" width="3" height="11" /></svg
          >
        {:else}
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"
            ><path d="M4 2.5v11l9.5-5.5z" /></svg
          >
        {/if}
      </button>
      <div class="tm-clock">
        {fmtLocal(clock, offset, true)}
        <small>
          {fmtLocalDay(clock, offset)} · {gap && playing ? '⏩ Pause wird übersprungen' : fmtOffset(offset)}
        </small>
      </div>
      <input
        class="tm-scrub"
        type="range"
        min="0"
        max="1000"
        value={scrub}
        aria-label="Zeitpunkt"
        oninput={(e) => seek(tMin + (Number(e.currentTarget.value) / 1000) * (tMax - tMin))}
      />
      <select
        class="tm-speed"
        aria-label="Geschwindigkeit"
        value={String(speed)}
        onchange={(e) => setSpeed(Number(e.currentTarget.value))}
      >
        {#each SPEEDS as s (s)}
          <option value={String(s)}>{s}×</option>
        {/each}
      </select>
    </div>

    <div class="tm-stats">
      <TrackStats model={m} />
    </div>
  </div>
</div>

<style>
  .tm-modal {
    position: fixed;
    inset: 0;
    /* Above the editor-level overlays, so Leaflet controls stay underneath. */
    z-index: 2000;
    background: rgba(16, 22, 32, 0.84);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }
  .tm-dialog {
    background: var(--surface);
    /* Nearly full screen on any display: only the backdrop margin around it. */
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    box-shadow: 0 30px 80px rgba(0, 0, 0, 0.55);
    padding: 14px 16px;
  }
  .tm-top {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 12px;
  }
  .ttl {
    font-size: 17px;
    font-weight: 700;
    letter-spacing: -0.2px;
    margin-right: auto;
  }
  .ttl small {
    display: block;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--accent);
  }
  .seg {
    display: inline-flex;
    border: 1px solid var(--line);
  }
  .seg button {
    font: inherit;
    font-size: 12.5px;
    font-weight: 600;
    border: 0;
    background: var(--surface);
    color: var(--muted);
    padding: 7px 12px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .seg button + button {
    border-left: 1px solid var(--line);
  }
  .seg button.on {
    background: var(--panel);
    color: var(--ink);
    box-shadow: inset 0 -2px 0 var(--c, var(--accent));
  }
  .sw {
    width: 9px;
    height: 9px;
    border-radius: 50%;
  }
  .seg-lbl {
    font-size: 11.5px;
    color: var(--faint);
    font-weight: 600;
  }
  .btn.on {
    background: var(--panel);
    color: var(--ink);
  }
  .tm-close {
    width: 38px;
    height: 38px;
    border: 0;
    background: var(--panel);
    font-size: 22px;
    cursor: pointer;
    color: var(--ink);
  }
  .tm-close:hover {
    background: var(--line-soft);
  }
  .tm-mapwrap {
    position: relative;
    flex: 1;
    min-height: 200px;
    border: 1px solid var(--keyline);
  }
  .tm-map {
    position: absolute;
    inset: 0;
    isolation: isolate;
    background: var(--panel);
  }
  .tm-leader {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 650;
    width: 100%;
    height: 100%;
  }
  .tm-leader line,
  .tm-leader circle {
    fill: none;
    stroke: var(--ink);
    stroke-width: 1.5;
  }
  .tm-card {
    position: absolute;
    left: 54px;
    top: 12px;
    width: 220px;
    z-index: 660;
    background: #fff;
    padding: 8px;
    box-shadow: 0 14px 40px -8px rgba(18, 28, 46, 0.55);
    border: 1px solid var(--matedge);
  }
  .tm-card.compact {
    padding: 4px;
  }
  .tm-card img {
    display: block;
    width: 100%;
    border: 1px solid var(--keyline);
    background: var(--panel);
    object-fit: cover;
  }
  .cap {
    font-size: 12px;
    color: var(--muted);
    margin-top: 6px;
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .cap b {
    color: var(--ink);
    font-weight: 600;
  }
  .note {
    color: var(--accent);
    font-weight: 600;
  }
  .nav {
    margin-left: auto;
    display: inline-flex;
    gap: 2px;
    align-items: center;
    font-variant-numeric: tabular-nums;
  }
  .nav button,
  .x {
    border: 0;
    background: var(--panel);
    cursor: pointer;
    font-size: 13px;
    width: 24px;
    height: 24px;
    color: var(--ink);
  }
  .x {
    position: absolute;
    top: 12px;
    right: 12px;
    background: rgba(255, 255, 255, 0.88);
    font-size: 16px;
  }
  .hold {
    height: 2px;
    background: var(--accent);
    margin-top: 6px;
    transform-origin: left;
  }
  .hold.run {
    animation: hold 5s linear forwards;
  }
  @keyframes hold {
    from {
      transform: scaleX(1);
    }
    to {
      transform: scaleX(0);
    }
  }
  .tm-readout {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 16px;
    font-size: 12.5px;
    color: var(--muted);
    margin: 10px 0 0;
    min-height: 19px;
    font-variant-numeric: tabular-nums;
  }
  .who {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .who i {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    display: inline-block;
  }
  .tm-readout b {
    color: var(--ink);
    font-weight: 600;
  }
  .off {
    color: var(--faint);
    font-style: italic;
  }
  .tm-controls {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 10px;
    flex-wrap: wrap;
  }
  .tm-play {
    width: 42px;
    height: 42px;
    border-radius: 50%;
    border: 0;
    background: var(--accent);
    color: #fff;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex: none;
  }
  .tm-play:hover {
    background: var(--accent-deep);
  }
  .tm-clock {
    font-size: 15px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    min-width: 150px;
  }
  .tm-clock small {
    display: block;
    font-size: 11px;
    font-weight: 500;
    color: var(--faint);
  }
  .tm-scrub {
    flex: 1;
    min-width: 120px;
    accent-color: var(--accent);
  }
  .tm-speed {
    font: inherit;
    font-size: 13px;
    padding: 6px 8px;
    border: 1px solid var(--line);
    background: var(--surface);
  }
  .tm-stats {
    margin-top: 12px;
    padding-top: 10px;
    border-top: 1px solid var(--line-soft);
  }
  /* Leaflet renders these marker bodies from HTML strings. */
  :global(.mk-person) {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 2.5px solid #fff;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.45);
    box-sizing: border-box;
  }
  :global(.mk-person.out) {
    opacity: 0.45;
  }
  :global(.mk-photo) {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #fff;
    border: 2px solid;
    box-sizing: border-box;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font: 700 9px/1 sans-serif;
    color: var(--ink);
  }
  :global(.mk-photo.multi) {
    width: 19px;
    height: 19px;
  }
  :global(.mk-photo.active) {
    transform: scale(1.35);
  }
  .compact .cap {
    font-size: 11px;
    margin-top: 4px;
  }
  .compact .x {
    top: 7px;
    right: 7px;
    width: 22px;
    height: 22px;
    font-size: 14px;
  }
  .compact .hold {
    margin-top: 4px;
  }
  @media (max-width: 700px) {
    .tm-modal {
      padding: 0;
    }
    .tm-dialog {
      height: 100%;
      padding: 10px;
    }
    .tm-clock {
      min-width: 0;
    }
    .seg-lbl {
      display: none;
    }
  }
</style>
