<script lang="ts">
  import { settings } from '../lib/settings.svelte.js';

  /** Which nav section is active, so it can be marked `aria-current="page"`. */
  type Section = 'beitraege' | 'karte' | 'archiv' | 'suche';

  let { current }: { current?: Section } = $props();

  let open = $state(false);

  const links: { section: Section; label: string; href: string }[] = [
    { section: 'beitraege', label: 'Beiträge', href: '#/' },
    { section: 'karte', label: 'Karte', href: '#/karte' },
    { section: 'archiv', label: 'Archiv', href: '#/archiv' },
    { section: 'suche', label: 'Suche', href: '#/suche' },
  ];

  function close(): void {
    open = false;
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') close();
  }

  // Close the open dropdown when clicking anywhere outside the header.
  function onWindowClick(event: MouseEvent): void {
    if (!open) return;
    const target = event.target as Node | null;
    if (target && !headerEl?.contains(target)) close();
  }

  let headerEl: HTMLElement | undefined = $state();
</script>

<svelte:window on:keydown={onKeydown} on:click={onWindowClick} />

<header class="site-header" class:nav-open={open} bind:this={headerEl}>
  <div class="wrap bar">
    <a class="brand" href="#/">
      <span class="brand-name">{settings.siteTitle}</span>
      <span class="brand-tag">Reisetagebuch</span>
    </a>
    <button
      class="nav-toggle"
      type="button"
      aria-expanded={open}
      aria-label={open ? 'Menü schließen' : 'Menü öffnen'}
      onclick={() => (open = !open)}
    >
      <span></span><span></span><span></span>
    </button>
    <nav class="nav">
      {#each links as link (link.section)}
        <a
          href={link.href}
          aria-current={current === link.section ? 'page' : undefined}
          onclick={close}>{link.label}</a
        >
      {/each}
    </nav>
  </div>
</header>
