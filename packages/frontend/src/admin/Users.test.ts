import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import type { UserListItem } from '@stb/shared';
import { auth } from '../lib/auth.svelte.js';
import { api, ApiError } from '../lib/api.js';

vi.mock('svelte-spa-router', () => ({ push: vi.fn() }));

import Users from './Users.svelte';

function userItem(id: string, username: string, deactivated = false): UserListItem {
  return {
    id,
    username,
    role: 'editor',
    deactivated,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

beforeEach(() => {
  auth.user = { id: 'admin1', username: 'mum', role: 'admin' };
});
afterEach(() => vi.restoreAllMocks());

describe('Users', () => {
  it('lists users with status', async () => {
    vi.spyOn(api, 'listUsers').mockResolvedValue([userItem('u1', 'dad', true)]);
    render(Users);
    expect(await screen.findByText('dad')).toBeInTheDocument();
    expect(screen.getByText('Deaktiviert')).toBeInTheDocument();
  });

  it('creates a user', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'listUsers').mockResolvedValue([]);
    const create = vi
      .spyOn(api, 'createUser')
      .mockResolvedValue(userItem('u2', 'kid'));
    render(Users);
    await screen.findByRole('button', { name: 'Anlegen' });
    await user.type(screen.getByLabelText('Benutzername'), 'kid');
    await user.type(screen.getByLabelText('Passwort'), 'longenough');
    await user.click(screen.getByRole('button', { name: 'Anlegen' }));
    expect(create).toHaveBeenCalledWith({ username: 'kid', password: 'longenough', role: 'editor' });
    expect(await screen.findByText('kid')).toBeInTheDocument();
  });

  it('shows a conflict error for duplicate usernames', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'listUsers').mockResolvedValue([]);
    vi.spyOn(api, 'createUser').mockRejectedValue(new ApiError(409, 'taken'));
    render(Users);
    await screen.findByRole('button', { name: 'Anlegen' });
    await user.type(screen.getByLabelText('Benutzername'), 'mum');
    await user.type(screen.getByLabelText('Passwort'), 'longenough');
    await user.click(screen.getByRole('button', { name: 'Anlegen' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Benutzername bereits vergeben.');
  });

  it('deactivates an active user', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'listUsers').mockResolvedValue([userItem('u1', 'dad', false)]);
    const update = vi
      .spyOn(api, 'updateUser')
      .mockResolvedValue(userItem('u1', 'dad', true));
    render(Users);
    await user.click(await screen.findByRole('button', { name: 'Deaktivieren' }));
    expect(update).toHaveBeenCalledWith('u1', { deactivated: true });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Aktivieren' })).toBeInTheDocument(),
    );
  });
});
