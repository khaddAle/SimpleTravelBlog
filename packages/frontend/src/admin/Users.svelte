<script lang="ts">
  import { onMount } from 'svelte';
  import type { UserListItem, UserDto } from '@stb/shared';
  import { api, ApiError } from '../lib/api.js';
  import { formatDate } from '../lib/dates.js';
  import AdminLayout from './AdminLayout.svelte';

  type Role = UserDto['role'];

  let users = $state<UserListItem[]>([]);
  let loading = $state(true);
  let error = $state('');

  // New-user form.
  let username = $state('');
  let password = $state('');
  let role = $state<Role>('editor');

  onMount(async () => {
    try {
      users = await api.listUsers();
    } finally {
      loading = false;
    }
  });

  // Mirrors createUserRequestSchema so we can name the exact problem before a
  // round trip, instead of one catch-all message.
  const MIN_PASSWORD = 8;

  function createErrorMessage(err: unknown): string {
    if (err instanceof ApiError) {
      if (err.status === 409) return 'Benutzername bereits vergeben.';
      if (err.status === 400) {
        return 'Bitte Benutzername und ein Passwort mit mindestens 8 Zeichen angeben.';
      }
    }
    return 'Anlegen fehlgeschlagen.';
  }

  async function create(event: Event): Promise<void> {
    event.preventDefault();
    error = '';
    // Catch the two common input mistakes up front with a precise hint.
    if (!username.trim()) {
      error = 'Bitte einen Benutzernamen angeben.';
      return;
    }
    if (password.length < MIN_PASSWORD) {
      error = 'Das Passwort muss mindestens 8 Zeichen lang sein.';
      return;
    }
    try {
      const created = await api.createUser({ username, password, role });
      users = [...users, created].sort((a, b) => a.username.localeCompare(b.username));
      username = '';
      password = '';
      role = 'editor';
    } catch (err) {
      error = createErrorMessage(err);
    }
  }

  async function setDeactivated(user: UserListItem, deactivated: boolean): Promise<void> {
    const updated = await api.updateUser(user.id, { deactivated });
    users = users.map((u) => (u.id === updated.id ? updated : u));
  }
</script>

<AdminLayout>
  <h1>Nutzer</h1>

  <form class="new-user" onsubmit={create}>
    {#if error}
      <p role="alert" class="err">{error}</p>
    {/if}
    <input type="text" aria-label="Benutzername" placeholder="Benutzername" bind:value={username} />
    <input type="password" aria-label="Passwort" placeholder="Passwort" bind:value={password} />
    <select aria-label="Rolle" bind:value={role}>
      <option value="editor">Redakteur</option>
      <option value="admin">Administrator</option>
    </select>
    <button type="submit">Anlegen</button>
  </form>

  {#if loading}
    <p>Lädt…</p>
  {:else}
    <table>
      <thead>
        <tr>
          <th>Benutzername</th>
          <th>Rolle</th>
          <th>Status</th>
          <th>Erstellt</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#each users as user (user.id)}
          <tr>
            <td>{user.username}</td>
            <td>{user.role === 'admin' ? 'Administrator' : 'Redakteur'}</td>
            <td>{user.deactivated ? 'Deaktiviert' : 'Aktiv'}</td>
            <td>{formatDate(user.createdAt)}</td>
            <td>
              {#if user.deactivated}
                <button type="button" onclick={() => setDeactivated(user, false)}>
                  Aktivieren
                </button>
              {:else}
                <button type="button" onclick={() => setDeactivated(user, true)}>
                  Deaktivieren
                </button>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</AdminLayout>

<style>
  .new-user {
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
  .err {
    color: #c53030;
    flex-basis: 100%;
  }
</style>
