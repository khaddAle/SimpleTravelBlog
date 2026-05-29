<script lang="ts">
  import { onMount } from 'svelte';
  import Router, { push, router } from 'svelte-spa-router';
  import { routes } from './router.js';
  import { auth } from './lib/auth.svelte.js';
  import { settings } from './lib/settings.svelte.js';

  onMount(() => {
    void auth.init();
    void settings.load();
  });

  // Mirror the configured accent colour onto the document for site-wide theming.
  $effect(() => {
    document.documentElement.style.setProperty('--accent', settings.accentColor);
  });

  // Redirect to login when an unauthenticated visitor hits an admin route.
  $effect(() => {
    const path = router.location;
    if (!auth.loading && !auth.isAuthenticated && path.startsWith('/admin')) {
      push('/login');
    }
  });
</script>

<Router {routes} />
