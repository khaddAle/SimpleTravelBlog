<script lang="ts">
  import type { Snippet } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { auth } from '../lib/auth.svelte.js';
  import { settings } from '../lib/settings.svelte.js';
  import { navGuard } from '../lib/navGuard.js';

  /** Which admin section is active, so its nav link gets `aria-current="page"`. */
  type Section = 'beitraege' | 'bilder' | 'reisen' | 'nutzer' | 'einstellungen';

  let {
    children,
    current,
    actions,
  }: { children?: Snippet; current?: Section; actions?: Snippet } = $props();

  // Veto a nav-link click when a registered guard (e.g. the post editor with
  // unsaved edits) says the user should confirm first.
  function guardNav(event: MouseEvent): void {
    if (!navGuard.confirmLeave()) event.preventDefault();
  }

  async function logout(): Promise<void> {
    if (!navGuard.confirmLeave()) return;
    await auth.logout();
    push('/login');
  }
</script>

<div class="admin">
  <header class="admin-bar">
    <div class="bar">
      <a class="brand" href="#/admin" onclick={guardNav}>
        <span class="brand-name">{settings.siteTitle}</span>
        <span class="brand-tag">Redaktion</span>
      </a>
      <nav class="admin-nav">
        <a href="#/admin" onclick={guardNav} aria-current={current === 'beitraege' ? 'page' : undefined}>
          Beiträge
        </a>
        <a href="#/admin/bilder" onclick={guardNav} aria-current={current === 'bilder' ? 'page' : undefined}>
          Bilder
        </a>
        <a href="#/admin/reisen" onclick={guardNav} aria-current={current === 'reisen' ? 'page' : undefined}>
          Reisen
        </a>
        {#if auth.isAdmin}
          <a href="#/admin/nutzer" onclick={guardNav} aria-current={current === 'nutzer' ? 'page' : undefined}>
            Nutzer
          </a>
        {/if}
        <a
          href="#/admin/einstellungen"
          onclick={guardNav}
          aria-current={current === 'einstellungen' ? 'page' : undefined}
        >
          Einstellungen
        </a>
      </nav>
      <span class="spacer"></span>
      {#if actions}
        <div class="bar-actions">{@render actions()}</div>
      {/if}
      {#if auth.user}
        <span class="who">{auth.user.username}</span>
      {/if}
      <button type="button" class="tb-btn" onclick={logout}>Abmelden</button>
    </div>
  </header>
  <main>
    {@render children?.()}
  </main>
</div>

<style>
  .admin {
    min-height: 100vh;
    background: #eef2f7;
  }
  .admin-bar {
    position: sticky;
    top: 0;
    z-index: 60;
    background: rgba(238, 242, 247, 0.85);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid var(--line);
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 20px;
    height: 64px;
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 40px;
  }
  .brand {
    text-decoration: none;
  }
  .admin-nav {
    display: flex;
    gap: 6px;
  }
  .admin-nav a {
    font-size: 13.5px;
    font-weight: 500;
    color: var(--muted);
    text-decoration: none;
    padding: 7px 11px;
    border-radius: 6px;
  }
  .admin-nav a:hover {
    background: rgba(18, 28, 46, 0.05);
    color: var(--ink);
  }
  .admin-nav a[aria-current='page'] {
    color: var(--ink);
    background: rgba(18, 28, 46, 0.06);
  }
  .spacer {
    flex: 1;
  }
  .bar-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .who {
    font-size: 13px;
    color: var(--muted);
  }
  .tb-btn {
    font: inherit;
    font-size: 13.5px;
    font-weight: 600;
    color: var(--ink);
    background: #fff;
    border: 1px solid var(--line);
    padding: 9px 14px;
    border-radius: 7px;
    cursor: pointer;
  }
  .tb-btn:hover {
    border-color: var(--accent);
  }
  main {
    max-width: 1200px;
    margin: 0 auto;
    padding: 30px 40px 90px;
  }
  @media (max-width: 640px) {
    .bar {
      padding: 0 18px;
      gap: 10px;
    }
    .admin-nav a {
      padding: 7px 8px;
    }
    .brand-tag {
      display: none;
    }
    main {
      padding: 22px 18px 70px;
    }
  }
</style>
