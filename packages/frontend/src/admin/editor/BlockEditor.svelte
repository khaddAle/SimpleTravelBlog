<script lang="ts">
  import { untrack, tick } from 'svelte';
  import { SvelteMap } from 'svelte/reactivity';
  import type { Block, BlockType } from '@stb/shared';
  import { imageUrl } from '../../lib/images.js';

  interface PickOpts {
    orphansOnly?: boolean;
    selected?: string[];
  }

  interface Props {
    blocks: Block[];
    onChange: (blocks: Block[]) => void;
    /** Opens the image picker; resolves to a chosen image shortId or null. */
    pickImage?: (opts?: PickOpts) => Promise<string | null>;
    /** Opens the gallery picker; resolves to chosen image shortIds or null. */
    pickGallery?: (opts?: PickOpts) => Promise<string[] | null>;
  }

  let { blocks, onChange, pickImage, pickGallery }: Props = $props();

  interface Entry {
    key: string;
    block: Block;
  }

  // Seeded once from the initial prop; the editor owns its working copy and
  // reports changes via onChange (untrack makes the one-time capture explicit).
  let entries = $state<Entry[]>(
    untrack(() => blocks.map((block) => ({ key: crypto.randomUUID(), block }))),
  );

  // Which gap's insert menu is open (index into the gaps), or null.
  let openInserter = $state<number | null>(null);

  // The text caret in the paragraph currently being edited (keyed by entry key
  // so it survives splices). `collapsed` is false while a range is selected —
  // splitting then is disabled because there is no single point to break at.
  let caret = $state<{ key: string; pos: number; collapsed: boolean } | null>(null);

  // Live paragraph textarea nodes, keyed by entry key, so a split can move focus
  // into the freshly inserted block after the DOM updates.
  const paraNodes = new SvelteMap<string, HTMLTextAreaElement>();

  // Registers a paragraph textarea and tracks its caret. selectionStart is
  // preserved across blur, so the value recorded while editing stays reliable
  // even after the split button takes focus.
  function paragraphCaret(node: HTMLTextAreaElement, key: string) {
    paraNodes.set(key, node);
    const events = ['keyup', 'click', 'select', 'focus'] as const;
    const record = (): void => {
      const pos = node.selectionStart ?? 0;
      caret = { key, pos, collapsed: pos === (node.selectionEnd ?? pos) };
    };
    for (const ev of events) node.addEventListener(ev, record);
    return {
      destroy() {
        for (const ev of events) node.removeEventListener(ev, record);
        paraNodes.delete(key);
      },
    };
  }

  // After a split, focus the new block at offset 0 once it has rendered.
  let pendingFocusKey = $state<string | null>(null);
  $effect(() => {
    if (!pendingFocusKey) return;
    const key = pendingFocusKey;
    pendingFocusKey = null;
    tick().then(() => {
      const node = paraNodes.get(key);
      if (!node) return;
      node.focus();
      node.setSelectionRange(0, 0);
      caret = { key, pos: 0, collapsed: true };
    });
  });

  // A split needs a collapsed caret strictly inside the text, so neither half is
  // empty (an empty paragraph would fail the min(1) validation on save).
  function canSplit(index: number): boolean {
    const entry = entries[index]!;
    if (entry.block.type !== 'paragraph') return false;
    if (!caret || caret.key !== entry.key || !caret.collapsed) return false;
    return caret.pos > 0 && caret.pos < entry.block.text.length;
  }

  function splitParagraph(index: number): void {
    const entry = entries[index]!;
    if (entry.block.type !== 'paragraph' || !caret || caret.key !== entry.key) return;
    const { text } = entry.block;
    const pos = caret.pos;
    if (pos <= 0 || pos >= text.length) return;
    entry.block = { ...entry.block, text: text.slice(0, pos) };
    const newKey = crypto.randomUUID();
    entries.splice(index + 1, 0, {
      key: newKey,
      block: { type: 'paragraph', text: text.slice(pos) },
    });
    emit();
    pendingFocusKey = newKey;
  }

  function emit(): void {
    onChange(entries.map((e) => e.block));
  }

  function move(index: number, delta: number): void {
    const target = index + delta;
    if (target < 0 || target >= entries.length) return;
    const current = entries[index]!;
    entries[index] = entries[target]!;
    entries[target] = current;
    emit();
  }

  function remove(index: number): void {
    // Deleting a block is destructive and not part of the undo-less editor, so
    // confirm first — naming the block type so it's clear what disappears.
    const label = TYPE_LABELS[entries[index]!.block.type];
    if (!globalThis.confirm(`${label} entfernen?`)) return;
    entries.splice(index, 1);
    emit();
  }

  function insertAt(index: number, block: Block): void {
    entries.splice(index, 0, { key: crypto.randomUUID(), block });
    emit();
  }

  function closeMenu(): void {
    openInserter = null;
  }

  function toggleMenu(gap: number): void {
    openInserter = openInserter === gap ? null : gap;
  }

  function insertText(gap: number, type: 'title' | 'subtitle' | 'paragraph'): void {
    insertAt(gap, { type, text: '' });
    closeMenu();
  }

  function insertQuote(gap: number): void {
    insertAt(gap, { type: 'quote', text: '' });
    closeMenu();
  }

  function insertDivider(gap: number): void {
    insertAt(gap, { type: 'divider' });
    closeMenu();
  }

  // Fresh inserts default the picker to "Nur unbenutzte" so newly uploaded
  // images surface first; editing (below) keeps it off so the current image
  // stays visible.
  async function insertImage(gap: number): Promise<void> {
    closeMenu();
    const id = await pickImage?.({ orphansOnly: true });
    if (id) insertAt(gap, { type: 'image', imageId: id });
  }

  async function insertGallery(gap: number): Promise<void> {
    closeMenu();
    const ids = await pickGallery?.({ orphansOnly: true });
    if (ids && ids.length > 0) insertAt(gap, { type: 'gallery', imageIds: ids });
  }

  async function changeImage(index: number): Promise<void> {
    const entry = entries[index]!;
    if (entry.block.type !== 'image') return;
    const id = await pickImage?.({ orphansOnly: false });
    if (!id) return; // cancelled — keep the existing image
    entry.block = { ...entry.block, imageId: id };
    emit();
  }

  async function changeGallery(index: number): Promise<void> {
    const entry = entries[index]!;
    if (entry.block.type !== 'gallery') return;
    const ids = await pickGallery?.({ orphansOnly: false, selected: entry.block.imageIds });
    if (!ids || ids.length === 0) return; // cancelled/empty — keep the existing gallery
    entry.block = { ...entry.block, imageIds: ids };
    emit();
  }

  function setText(index: number, text: string): void {
    const entry = entries[index]!;
    entry.block = { ...entry.block, text } as Block;
    emit();
  }

  function setSource(index: number, source: string): void {
    const entry = entries[index]!;
    if (entry.block.type !== 'quote') return;
    entry.block = { ...entry.block, source: source || undefined };
    emit();
  }

  function setCaption(index: number, caption: string): void {
    const entry = entries[index]!;
    if (entry.block.type !== 'image') return;
    entry.block = { ...entry.block, caption: caption || undefined };
    emit();
  }

  function setGalleryCaption(index: number, caption: string): void {
    const entry = entries[index]!;
    if (entry.block.type !== 'gallery') return;
    entry.block = { ...entry.block, caption: caption || undefined };
    emit();
  }

  const TYPE_LABELS: Record<BlockType, string> = {
    title: 'Titel',
    subtitle: 'Untertitel',
    paragraph: 'Absatz',
    image: 'Bild',
    gallery: 'Galerie',
    quote: 'Zitat',
    divider: 'Trenner',
  };
</script>

{#snippet inserter(gap: number)}
  <div class="inserter">
    <span class="line"></span>
    <button
      type="button"
      class="plus"
      aria-label="Block einfügen"
      aria-expanded={openInserter === gap}
      onclick={() => toggleMenu(gap)}>+</button
    >
    {#if openInserter === gap}
      <button type="button" class="menu-scrim" aria-label="Menü schließen" onclick={closeMenu}
      ></button>
      <div class="menu">
        <div class="grp">Text</div>
        <button type="button" onclick={() => insertText(gap, 'title')}>
          <span class="ic" aria-hidden="true">H1</span>{TYPE_LABELS.title}
        </button>
        <button type="button" onclick={() => insertText(gap, 'subtitle')}>
          <span class="ic" aria-hidden="true">H2</span>{TYPE_LABELS.subtitle}
        </button>
        <button type="button" onclick={() => insertText(gap, 'paragraph')}>
          <span class="ic" aria-hidden="true">¶</span>{TYPE_LABELS.paragraph}
        </button>
        <button type="button" onclick={() => insertQuote(gap)}>
          <span class="ic" aria-hidden="true">”</span>{TYPE_LABELS.quote}
        </button>
        <div class="grp">Medien &amp; mehr</div>
        <button type="button" onclick={() => insertImage(gap)}>
          <span class="ic" aria-hidden="true">▣</span>{TYPE_LABELS.image}
        </button>
        <button type="button" onclick={() => insertGallery(gap)}>
          <span class="ic" aria-hidden="true">▦</span>{TYPE_LABELS.gallery}
        </button>
        <button type="button" onclick={() => insertDivider(gap)}>
          <span class="ic" aria-hidden="true">⋯</span>{TYPE_LABELS.divider}
        </button>
      </div>
    {/if}
  </div>
{/snippet}

<div class="block-editor">
  {#if entries.length === 0}
    <p class="empty">Noch keine Blöcke. Füge mit „+" welche hinzu.</p>
  {/if}

  <div class="blocks">
    {@render inserter(0)}
    {#each entries as entry, index (entry.key)}
      <div class="block b-{entry.block.type}">
        <span class="type-tag">{TYPE_LABELS[entry.block.type]}</span>
        <div class="tools">
          <button
            type="button"
            aria-label="Nach oben verschieben"
            disabled={index === 0}
            onclick={() => move(index, -1)}>▲</button
          >
          <button
            type="button"
            aria-label="Nach unten verschieben"
            disabled={index === entries.length - 1}
            onclick={() => move(index, 1)}>▼</button
          >
          {#if entry.block.type === 'paragraph'}
            <button
              type="button"
              class="split"
              aria-label="Absatz hier teilen"
              disabled={!canSplit(index)}
              onclick={() => splitParagraph(index)}>✂</button
            >
          {/if}
          <button type="button" class="del" aria-label="Entfernen" onclick={() => remove(index)}
            >✕</button
          >
        </div>

        {#if entry.block.type === 'title' || entry.block.type === 'subtitle'}
          <input
            type="text"
            class="text-input {entry.block.type === 'title' ? 'as-title' : 'as-subtitle'}"
            value={entry.block.text}
            aria-label={TYPE_LABELS[entry.block.type]}
            placeholder={TYPE_LABELS[entry.block.type]}
            oninput={(e) => setText(index, e.currentTarget.value)}
          />
        {:else if entry.block.type === 'paragraph'}
          <textarea
            class="text-input as-paragraph"
            value={entry.block.text}
            aria-label="Absatz"
            placeholder="Text schreiben…"
            use:paragraphCaret={entry.key}
            oninput={(e) => setText(index, e.currentTarget.value)}
          ></textarea>
        {:else if entry.block.type === 'quote'}
          <textarea
            class="text-input as-quote"
            value={entry.block.text}
            aria-label="Zitat"
            placeholder="Zitat…"
            oninput={(e) => setText(index, e.currentTarget.value)}
          ></textarea>
          <input
            type="text"
            class="text-input as-cite"
            value={entry.block.source ?? ''}
            aria-label="Quelle"
            placeholder="Quelle (optional)"
            oninput={(e) => setSource(index, e.currentTarget.value)}
          />
        {:else if entry.block.type === 'divider'}
          <div class="b-divider" aria-hidden="true"><span></span><span></span><span></span></div>
        {:else if entry.block.type === 'image'}
          <div class="ph-frame">
            <div class="inner">
              <img src={imageUrl(entry.block.imageId, 'thumb')} alt="" />
              <div class="img-actions">
                <button type="button" class="mini-btn change" onclick={() => changeImage(index)}>
                  Bild ändern
                </button>
              </div>
            </div>
          </div>
          <input
            type="text"
            class="caption-input"
            value={entry.block.caption ?? ''}
            aria-label="Bildunterschrift"
            placeholder="Bildunterschrift (optional)"
            oninput={(e) => setCaption(index, e.currentTarget.value)}
          />
        {:else if entry.block.type === 'gallery'}
          <div class="b-gallery">
            <p class="gallery-summary">{entry.block.imageIds.length} Bilder</p>
            <div class="gallery-thumbs">
              {#each entry.block.imageIds as id (id)}
                <span class="cell"><span class="inner"><img src={imageUrl(id, 'thumb')} alt="" /></span></span>
              {/each}
            </div>
            <button type="button" class="mini-btn change" onclick={() => changeGallery(index)}>
              Galerie bearbeiten
            </button>
          </div>
          <input
            type="text"
            class="caption-input"
            value={entry.block.caption ?? ''}
            aria-label="Galerie-Bildunterschrift"
            placeholder="Bildunterschrift (optional)"
            oninput={(e) => setGalleryCaption(index, e.currentTarget.value)}
          />
        {/if}
      </div>
      {@render inserter(index + 1)}
    {/each}
  </div>
</div>

<style>
  .empty {
    color: var(--faint);
    font-style: italic;
    margin: 0 0 4px;
    padding: 0 14px;
  }

  /* ---- block + control rail ---- */
  .block {
    position: relative;
    padding: 8px 96px 8px 14px;
    border-radius: 6px;
    transition: background 0.12s;
  }
  .block:hover {
    background: #f6f9fc;
  }
  .type-tag {
    position: absolute;
    left: -86px;
    top: 12px;
    width: 76px;
    text-align: right;
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--faint);
    opacity: 0;
    transition: opacity 0.12s;
  }
  .block:hover .type-tag,
  .block:focus-within .type-tag {
    opacity: 1;
  }
  .tools {
    position: absolute;
    right: 8px;
    top: 8px;
    display: flex;
    gap: 2px;
    opacity: 0;
    transition: opacity 0.12s;
  }
  .block:hover .tools,
  .block:focus-within .tools {
    opacity: 1;
  }
  .tools button {
    width: 26px;
    height: 26px;
    border: 1px solid var(--line);
    background: var(--surface);
    border-radius: 5px;
    cursor: pointer;
    color: var(--muted);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    padding: 0;
  }
  .tools button:hover {
    border-color: var(--accent);
    color: var(--ink);
  }
  .tools button.del:hover {
    border-color: #b4452f;
    color: #b4452f;
  }
  .tools button.split {
    font-size: 12px;
  }
  .tools button:disabled {
    opacity: 0.3;
    cursor: default;
    border-color: var(--line);
    color: var(--faint);
  }

  /* ---- editable text blocks (form controls styled as document text) ---- */
  .text-input,
  .caption-input {
    width: 100%;
    border: 0;
    background: transparent;
    padding: 2px 0;
    font: inherit;
    color: var(--ink);
    resize: none;
    field-sizing: content;
  }
  .text-input:focus,
  .caption-input:focus {
    outline: none;
    box-shadow: 0 0 0 2px rgba(63, 102, 153, 0.25);
    border-radius: 4px;
  }
  .text-input::placeholder,
  .caption-input::placeholder {
    color: var(--faint);
  }
  .as-title {
    font-size: 34px;
    font-weight: 700;
    letter-spacing: -1px;
    line-height: 1.08;
  }
  .as-subtitle {
    font-size: 19px;
    color: var(--muted);
    line-height: 1.4;
  }
  .as-paragraph {
    font-size: 16.5px;
    line-height: 1.7;
    color: #262b33;
    min-height: 4.2em;
  }
  .as-quote {
    border-left: 3px solid var(--accent);
    padding-left: 18px;
    font-size: 20px;
    font-weight: 500;
    line-height: 1.4;
    color: var(--ink);
    min-height: 2.4em;
  }
  .as-cite {
    font-size: 12.5px;
    color: var(--faint);
    margin-top: 4px;
  }
  .caption-input {
    font-size: 12.5px;
    color: var(--faint);
    text-align: center;
    margin-top: 9px;
  }

  .b-divider {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 9px;
    padding: 14px 0;
  }
  .b-divider span {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--faint);
    opacity: 0.6;
  }

  /* ---- image + gallery ---- */
  .ph-frame {
    background: var(--surface);
    padding: 11px;
    border: 1px solid var(--matedge);
    box-shadow: var(--shadow-frame-sm);
  }
  .ph-frame .inner {
    border: 1px solid var(--keyline);
    aspect-ratio: 16 / 9;
    overflow: hidden;
    line-height: 0;
    position: relative;
  }
  .ph-frame img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .img-actions {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    opacity: 0;
    background: rgba(18, 28, 46, 0.28);
    transition: opacity 0.12s;
  }
  .ph-frame .inner:hover .img-actions,
  .block:focus-within .img-actions {
    opacity: 1;
  }
  .mini-btn {
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    background: var(--surface);
    border: none;
    padding: 8px 12px;
    border-radius: 5px;
    cursor: pointer;
    color: var(--ink);
  }
  .b-gallery .gallery-summary {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--faint);
    margin: 0 0 10px;
  }
  .gallery-thumbs {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }
  .gallery-thumbs .cell {
    display: block;
    background: var(--surface);
    padding: 8px;
    border: 1px solid var(--matedge);
    box-shadow: var(--shadow-frame-sm);
  }
  .gallery-thumbs .inner {
    display: block;
    border: 1px solid var(--keyline);
    aspect-ratio: 1 / 1;
    overflow: hidden;
    line-height: 0;
  }
  .gallery-thumbs img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .b-gallery .change {
    margin-top: 12px;
    border: 1px solid var(--line);
    background: var(--surface);
  }
  .change.mini-btn:hover {
    border-color: var(--accent);
  }

  /* ---- inserter ---- */
  .inserter {
    position: relative;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .inserter .line {
    position: absolute;
    left: 14px;
    right: 14px;
    height: 1px;
    background: var(--accent);
    opacity: 0;
    transition: opacity 0.12s;
  }
  .inserter:hover .line {
    opacity: 0.5;
  }
  .inserter .plus {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 1px solid var(--line);
    background: var(--surface);
    color: var(--muted);
    font-size: 16px;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    opacity: 0;
    transition:
      opacity 0.12s,
      transform 0.12s;
    z-index: 2;
  }
  .inserter:hover .plus,
  .inserter .plus[aria-expanded='true'] {
    opacity: 1;
  }
  .inserter .plus:hover {
    transform: scale(1.12);
    border-color: var(--accent);
    color: var(--accent);
  }
  .menu-scrim {
    position: fixed;
    inset: 0;
    z-index: 20;
    border: 0;
    background: transparent;
    cursor: default;
  }
  .menu {
    position: absolute;
    top: 28px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 30;
    background: var(--surface);
    border: 1px solid var(--line);
    box-shadow: var(--shadow-pop);
    padding: 5px;
    width: 188px;
  }
  .menu button {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    border: none;
    background: transparent;
    padding: 9px 10px;
    border-radius: 5px;
    font: inherit;
    font-size: 14px;
    color: var(--ink);
    cursor: pointer;
    text-align: left;
  }
  .menu button:hover {
    background: var(--panel);
  }
  .menu .ic {
    width: 22px;
    color: var(--faint);
    font-size: 13px;
  }
  .menu .grp {
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--faint);
    padding: 8px 10px 4px;
  }

  /* Touch: controls are hover-only on desktop, but coarse pointers can't hover —
     keep them visible there. Tap targets grow to a comfortable size. */
  @media (hover: none), (pointer: coarse) {
    .inserter .plus {
      opacity: 1;
    }
    .tools button {
      width: 40px;
      height: 40px;
    }
    .block {
      padding-right: 0;
      padding-top: 50px;
    }
    .tools {
      opacity: 1;
    }
    .type-tag {
      display: none;
    }
    .img-actions {
      opacity: 1;
      background: rgba(18, 28, 46, 0.2);
    }
  }
  @media (max-width: 640px) {
    .block {
      padding-left: 10px;
    }
    .as-title {
      font-size: 28px;
    }
    .gallery-thumbs {
      grid-template-columns: 1fr 1fr;
    }
  }
</style>
