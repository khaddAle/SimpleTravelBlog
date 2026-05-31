<script lang="ts">
  import type { Snippet } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { auth } from '../lib/auth.svelte.js';
  import { navGuard } from '../lib/navGuard.js';

  let { children }: { children?: Snippet } = $props();

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
  <header>
    <nav>
      <a href="#/admin" onclick={guardNav}>Beiträge</a>
      <a href="#/admin/bilder" onclick={guardNav}>Bilder</a>
      {#if auth.isAdmin}
        <a href="#/admin/nutzer" onclick={guardNav}>Nutzer</a>
      {/if}
      <a href="#/admin/einstellungen" onclick={guardNav}>Einstellungen</a>
    </nav>
    <div class="user">
      {#if auth.user}
        <span class="who">{auth.user.username}</span>
      {/if}
      <button type="button" onclick={logout}>Abmelden</button>
    </div>
  </header>
  <main>
    {@render children?.()}
  </main>
</div>

<style>
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid #e2e8f0;
    margin-bottom: 1.5rem;
  }
  nav {
    display: flex;
    gap: 1rem;
  }
  .user {
    display: flex;
    gap: 0.75rem;
    align-items: center;
  }
  main {
    max-width: 960px;
    margin: 0 auto;
    padding: 0 1rem;
  }
</style>
