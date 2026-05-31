<script lang="ts">
  import { settings } from '../lib/settings.svelte.js';
</script>

<footer class="site-footer">
  <div class="wrap bar">
    <div class="links">
      <a class="btn ghost" href="#/karte">Kartenansicht</a>
      <a class="btn ghost" href="#/archiv">Alle Beiträge</a>
    </div>
    <div class="note">
      Ein privates Reisetagebuch · {settings.siteTitle} ·
      <a href="#/login" style="color: var(--muted); text-decoration: none;">Redaktion</a>
    </div>
  </div>
</footer>
