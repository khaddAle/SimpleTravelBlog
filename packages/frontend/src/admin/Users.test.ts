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

  it('asks for a username before calling the API when it is empty', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'listUsers').mockResolvedValue([]);
    const create = vi.spyOn(api, 'createUser');
    render(Users);
    await screen.findByRole('button', { name: 'Anlegen' });
    // No username, valid password.
    await user.type(screen.getByLabelText('Passwort'), 'longenough');
    await user.click(screen.getByRole('button', { name: 'Anlegen' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Bitte einen Benutzernamen angeben.',
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('flags a too-short password before calling the API', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'listUsers').mockResolvedValue([]);
    const create = vi.spyOn(api, 'createUser');
    render(Users);
    await screen.findByRole('button', { name: 'Anlegen' });
    await user.type(screen.getByLabelText('Benutzername'), 'kid');
    await user.type(screen.getByLabelText('Passwort'), 'short');
    await user.click(screen.getByRole('button', { name: 'Anlegen' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Das Passwort muss mindestens 8 Zeichen lang sein.',
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('maps a server validation error (400) to a guiding message', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'listUsers').mockResolvedValue([]);
    vi.spyOn(api, 'createUser').mockRejectedValue(new ApiError(400, 'invalid user payload'));
    render(Users);
    await screen.findByRole('button', { name: 'Anlegen' });
    await user.type(screen.getByLabelText('Benutzername'), 'kid');
    await user.type(screen.getByLabelText('Passwort'), 'longenough');
    await user.click(screen.getByRole('button', { name: 'Anlegen' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Bitte Benutzername und ein Passwort mit mindestens 8 Zeichen angeben.',
    );
  });

  it('shows a generic message for an unexpected failure', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'listUsers').mockResolvedValue([]);
    vi.spyOn(api, 'createUser').mockRejectedValue(new ApiError(500, 'boom'));
    render(Users);
    await screen.findByRole('button', { name: 'Anlegen' });
    await user.type(screen.getByLabelText('Benutzername'), 'kid');
    await user.type(screen.getByLabelText('Passwort'), 'longenough');
    await user.click(screen.getByRole('button', { name: 'Anlegen' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Anlegen fehlgeschlagen.');
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
