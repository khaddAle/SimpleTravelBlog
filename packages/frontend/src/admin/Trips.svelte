<script lang="ts">
  import { onMount } from 'svelte';
  import type { TripDto } from '@stb/shared';
  import { api, ApiError, type PostRef } from '../lib/api.js';
  import AdminLayout from './AdminLayout.svelte';

  let trips = $state<TripDto[]>([]);
  let loading = $state(true);

  // New-trip form.
  let newName = $state('');
  let createError = $state('');

  // Inline rename state (one row at a time).
  let editingId = $state<string | null>(null);
  let editName = $state('');
  let editError = $state('');

  // Set when a delete is refused because posts still reference the trip.
  let blocked = $state<{ name: string; posts: PostRef[] } | null>(null);
  let deleteError = $state('');

  function byName(a: TripDto, b: TripDto): number {
    return a.name.localeCompare(b.name);
  }

  onMount(async () => {
    try {
      trips = await api.listTrips();
    } finally {
      loading = false;
    }
  });

  async function create(event: Event): Promise<void> {
    event.preventDefault();
    createError = '';
    try {
      const created = await api.createTrip(newName);
      trips = [...trips, created].sort(byName);
      newName = '';
    } catch (err) {
      createError =
        err instanceof ApiError && err.status === 409
          ? 'Eine Reise mit diesem Namen existiert bereits.'
          : 'Anlegen fehlgeschlagen.';
    }
  }

  function startRename(t: TripDto): void {
    editingId = t.id;
    editName = t.name;
    editError = '';
  }
  function cancelRename(): void {
    editingId = null;
    editName = '';
    editError = '';
  }
  async function saveRename(t: TripDto): Promise<void> {
    editError = '';
    try {
      const updated = await api.updateTrip(t.id, editName);
      trips = trips.map((x) => (x.id === updated.id ? updated : x)).sort(byName);
      cancelRename();
    } catch (err) {
      editError =
        err instanceof ApiError && err.status === 409
          ? 'Eine Reise mit diesem Namen existiert bereits.'
          : 'Umbenennen fehlgeschlagen.';
    }
  }

  async function remove(t: TripDto): Promise<void> {
    if (!globalThis.confirm(`Reise „${t.name}“ löschen?`)) return;
    blocked = null;
    deleteError = '';
    try {
      await api.deleteTrip(t.id);
      trips = trips.filter((x) => x.id !== t.id);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const body = err.body as { posts?: PostRef[] } | undefined;
        blocked = { name: t.name, posts: body?.posts ?? [] };
      } else {
        deleteError = 'Löschen fehlgeschlagen.';
      }
    }
  }
</script>

<AdminLayout current="reisen">
  <h1>Reisen</h1>

  <form class="new-trip" onsubmit={create}>
    {#if createError}
      <p role="alert" class="err">{createError}</p>
    {/if}
    <input type="text" aria-label="Reisename" placeholder="Neue Reise" bind:value={newName} />
    <button type="submit">Anlegen</button>
  </form>

  {#if blocked}
    <div class="blocked" role="alert">
      <p>
        „{blocked.name}“ kann nicht gelöscht werden – noch {blocked.posts.length === 1
          ? '1 Beitrag verweist'
          : `${blocked.posts.length} Beiträge verweisen`} darauf. Weise sie zuerst einer
        anderen Reise zu:
      </p>
      <ul>
        {#each blocked.posts as post (post.id)}
          <li><a href={`#/admin/beitrag/${post.id}`}>{post.title}</a></li>
        {/each}
      </ul>
    </div>
  {/if}
  {#if deleteError}
    <p role="alert" class="err">{deleteError}</p>
  {/if}

  {#if loading}
    <p>Lädt…</p>
  {:else if trips.length === 0}
    <p>Noch keine Reisen.</p>
  {:else}
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Beiträge</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#each trips as trip (trip.id)}
          <tr>
            {#if editingId === trip.id}
              <td>
                <input type="text" aria-label="Reise umbenennen" bind:value={editName} />
                {#if editError}
                  <p role="alert" class="err">{editError}</p>
                {/if}
              </td>
              <td>{trip.postCount ?? 0}</td>
              <td class="actions">
                <button type="button" onclick={() => saveRename(trip)}>Speichern</button>
                <button type="button" onclick={cancelRename}>Abbrechen</button>
              </td>
            {:else}
              <td>{trip.name}</td>
              <td>{trip.postCount ?? 0}</td>
              <td class="actions">
                <button type="button" onclick={() => startRename(trip)}>Umbenennen</button>
                <button type="button" onclick={() => remove(trip)}>Löschen</button>
              </td>
            {/if}
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</AdminLayout>

<style>
  .new-trip {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 1.5rem;
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  th,
  td {
    text-align: left;
    padding: 0.5rem;
    border-bottom: 1px solid #edf2f7;
  }
  .actions {
    display: flex;
    gap: 0.5rem;
  }
  .err {
    color: #c53030;
    flex-basis: 100%;
    margin: 0.25rem 0 0;
  }
  .blocked {
    background: #fff5f5;
    border: 1px solid #feb2b2;
    border-radius: 6px;
    padding: 0.75rem 1rem;
    margin-bottom: 1.5rem;
    color: #742a2a;
  }
  .blocked ul {
    margin: 0.5rem 0 0;
    padding-left: 1.25rem;
  }
</style>
