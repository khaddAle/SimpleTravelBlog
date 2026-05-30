<script lang="ts">
  import { untrack } from 'svelte';
  import type { Block, BlockType } from '@stb/shared';
  import { imageUrl } from '../../lib/images.js';

  interface Props {
    blocks: Block[];
    onChange: (blocks: Block[]) => void;
    /** Opens the image picker; resolves to a chosen image shortId or null. */
    pickImage?: () => Promise<string | null>;
    /** Opens the gallery picker; resolves to chosen image shortIds or null. */
    pickGallery?: () => Promise<string[] | null>;
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
    entries.splice(index, 1);
    emit();
  }

  function add(block: Block): void {
    entries.push({ key: crypto.randomUUID(), block });
    emit();
  }

  function insertText(type: 'title' | 'subtitle' | 'paragraph'): void {
    add({ type, text: '' });
  }

  function insertQuote(): void {
    add({ type: 'quote', text: '' });
  }

  function insertDivider(): void {
    add({ type: 'divider' });
  }

  async function insertImage(): Promise<void> {
    const id = await pickImage?.();
    if (id) add({ type: 'image', imageId: id });
  }

  async function insertGallery(): Promise<void> {
    const ids = await pickGallery?.();
    if (ids && ids.length > 0) add({ type: 'gallery', imageIds: ids });
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

<div class="block-editor">
  <ol class="entries">
    {#each entries as entry, index (entry.key)}
      <li class="entry" data-type={entry.block.type}>
        <div class="entry-header">
          <span class="entry-label">{TYPE_LABELS[entry.block.type]}</span>
          <div class="entry-actions">
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
            <button type="button" aria-label="Entfernen" onclick={() => remove(index)}
              >✕</button
            >
          </div>
        </div>

        {#if entry.block.type === 'title' || entry.block.type === 'subtitle'}
          <input
            type="text"
            value={entry.block.text}
            aria-label={TYPE_LABELS[entry.block.type]}
            oninput={(e) => setText(index, e.currentTarget.value)}
          />
        {:else if entry.block.type === 'paragraph'}
          <textarea
            value={entry.block.text}
            aria-label="Absatz"
            oninput={(e) => setText(index, e.currentTarget.value)}
          ></textarea>
        {:else if entry.block.type === 'quote'}
          <textarea
            value={entry.block.text}
            aria-label="Zitat"
            oninput={(e) => setText(index, e.currentTarget.value)}
          ></textarea>
          <input
            type="text"
            value={entry.block.source ?? ''}
            aria-label="Quelle"
            placeholder="Quelle (optional)"
            oninput={(e) => setSource(index, e.currentTarget.value)}
          />
        {:else if entry.block.type === 'image'}
          <img class="preview" src={imageUrl(entry.block.imageId, 'thumb')} alt="" />
          <input
            type="text"
            value={entry.block.caption ?? ''}
            aria-label="Bildunterschrift"
            placeholder="Bildunterschrift (optional)"
            oninput={(e) => setCaption(index, e.currentTarget.value)}
          />
        {:else if entry.block.type === 'gallery'}
          <p class="gallery-summary">{entry.block.imageIds.length} Bilder</p>
          <div class="gallery-thumbs">
            {#each entry.block.imageIds as id (id)}
              <img src={imageUrl(id, 'thumb')} alt="" />
            {/each}
          </div>
          <input
            type="text"
            value={entry.block.caption ?? ''}
            aria-label="Galerie-Bildunterschrift"
            placeholder="Bildunterschrift (optional)"
            oninput={(e) => setGalleryCaption(index, e.currentTarget.value)}
          />
        {/if}
      </li>
    {/each}
  </ol>

  {#if entries.length === 0}
    <p class="empty">Noch keine Blöcke. Füge unten welche hinzu.</p>
  {/if}

  <div class="palette" role="group" aria-label="Block hinzufügen">
    <button type="button" onclick={() => insertText('title')}>+ Titel</button>
    <button type="button" onclick={() => insertText('subtitle')}>+ Untertitel</button>
    <button type="button" onclick={() => insertText('paragraph')}>+ Absatz</button>
    <button type="button" onclick={insertQuote}>+ Zitat</button>
    <button type="button" onclick={insertDivider}>+ Trenner</button>
    <button type="button" onclick={insertImage}>+ Bild</button>
    <button type="button" onclick={insertGallery}>+ Galerie</button>
  </div>
</div>

<style>
  .entries {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .entry {
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 0.5rem 0.75rem;
  }
  .entry-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.4rem;
  }
  .entry-label {
    font-size: 0.8rem;
    font-weight: 600;
    color: #718096;
    text-transform: uppercase;
  }
  .entry-actions button {
    margin-left: 0.25rem;
  }
  input[type='text'],
  textarea {
    width: 100%;
    padding: 0.4rem;
    font: inherit;
  }
  textarea {
    min-height: 4rem;
    resize: vertical;
  }
  .preview {
    max-height: 80px;
    border-radius: 4px;
    margin-bottom: 0.4rem;
  }
  .gallery-thumbs {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(64px, 1fr));
    gap: 0.3rem;
    margin-top: 0.3rem;
  }
  .gallery-thumbs img {
    width: 100%;
    height: 64px;
    object-fit: cover;
    border-radius: 4px;
  }
  .palette {
    margin-top: 1rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .empty {
    color: #a0aec0;
    font-style: italic;
  }
</style>
