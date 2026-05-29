<script lang="ts">
  import type { Snippet } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { auth } from '../lib/auth.svelte.js';

  let { children }: { children?: Snippet } = $props();

  async function logout(): Promise<void> {
    await auth.logout();
    push('/login');
  }
</script>

<div class="admin">
  <header>
    <nav>
      <a href="#/admin">Beiträge</a>
      <a href="#/admin/bilder">Bilder</a>
      {#if auth.isAdmin}
        <a href="#/admin/nutzer">Nutzer</a>
      {/if}
      <a href="#/admin/einstellungen">Einstellungen</a>
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
