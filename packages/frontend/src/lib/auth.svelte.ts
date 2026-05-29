import type { UserDto } from '@stb/shared';
import { api } from './api.js';

/**
 * Reactive authentication store (Svelte 5 runes). A single shared instance holds
 * the current user; components read `auth.user` / `auth.isAdmin`. Populated once
 * on app boot via `init()` (GET /api/auth/me).
 */
class AuthStore {
  user = $state<UserDto | null>(null);
  /** True until the initial `me()` probe resolves, so guards can wait. */
  loading = $state(true);

  get isAuthenticated(): boolean {
    return this.user !== null;
  }

  get isAdmin(): boolean {
    return this.user?.role === 'admin';
  }

  async init(): Promise<void> {
    this.loading = true;
    try {
      this.user = await api.me();
    } finally {
      this.loading = false;
    }
  }

  async login(username: string, password: string): Promise<UserDto> {
    const user = await api.login(username, password);
    this.user = user;
    return user;
  }

  async logout(): Promise<void> {
    // Best-effort: clear local state even if the server call fails (e.g. the
    // session already expired). The user is logged out from the SPA's view.
    try {
      await api.logout();
    } catch {
      // ignore — local logout still proceeds
    }
    this.user = null;
  }
}

export const auth = new AuthStore();
