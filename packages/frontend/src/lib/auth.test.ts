import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { auth } from './auth.svelte.js';
import { api } from './api.js';

beforeEach(() => {
  auth.user = null;
  auth.loading = true;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('auth store', () => {
  it('init populates the user from me() and clears loading', async () => {
    vi.spyOn(api, 'me').mockResolvedValue({ id: 'u1', username: 'mum', role: 'admin' });
    await auth.init();
    expect(auth.user?.username).toBe('mum');
    expect(auth.loading).toBe(false);
    expect(auth.isAuthenticated).toBe(true);
    expect(auth.isAdmin).toBe(true);
  });

  it('init leaves user null when unauthenticated', async () => {
    vi.spyOn(api, 'me').mockResolvedValue(null);
    await auth.init();
    expect(auth.user).toBeNull();
    expect(auth.isAuthenticated).toBe(false);
    expect(auth.isAdmin).toBe(false);
  });

  it('login sets the user', async () => {
    vi.spyOn(api, 'login').mockResolvedValue({ id: 'u2', username: 'dad', role: 'editor' });
    const user = await auth.login('dad', 'pw');
    expect(user.role).toBe('editor');
    expect(auth.user?.username).toBe('dad');
    expect(auth.isAdmin).toBe(false);
  });

  it('logout clears the user even if the request fails', async () => {
    auth.user = { id: 'u1', username: 'mum', role: 'admin' };
    vi.spyOn(api, 'logout').mockRejectedValue(new Error('network'));
    await auth.logout();
    expect(auth.user).toBeNull();
  });
});
