import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { auth } from '../lib/auth.svelte.js';
import { ApiError } from '../lib/api.js';

const push = vi.fn();
vi.mock('svelte-spa-router', () => ({ push: (...args: unknown[]) => push(...args) }));

import Login from './Login.svelte';

beforeEach(() => {
  push.mockClear();
  auth.user = null;
});
afterEach(() => vi.restoreAllMocks());

describe('Login', () => {
  it('logs in and redirects to the admin home', async () => {
    const user = userEvent.setup();
    vi.spyOn(auth, 'login').mockResolvedValue({ id: 'u1', username: 'mum', role: 'admin' });
    render(Login);
    await user.type(screen.getByLabelText('Benutzername'), 'mum');
    await user.type(screen.getByLabelText('Passwort'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Anmelden' }));
    expect(auth.login).toHaveBeenCalledWith('mum', 'secret');
    expect(push).toHaveBeenCalledWith('/admin');
  });

  it('shows an error on bad credentials', async () => {
    const user = userEvent.setup();
    vi.spyOn(auth, 'login').mockRejectedValue(new ApiError(401, 'invalid credentials'));
    render(Login);
    await user.type(screen.getByLabelText('Benutzername'), 'mum');
    await user.type(screen.getByLabelText('Passwort'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Anmelden' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Anmeldung fehlgeschlagen.');
    expect(push).not.toHaveBeenCalled();
  });

  it('shows a rate-limit message on 429', async () => {
    const user = userEvent.setup();
    vi.spyOn(auth, 'login').mockRejectedValue(new ApiError(429, 'too many'));
    render(Login);
    await user.type(screen.getByLabelText('Benutzername'), 'mum');
    await user.type(screen.getByLabelText('Passwort'), 'x');
    await user.click(screen.getByRole('button', { name: 'Anmelden' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Zu viele Anmeldeversuche');
  });

  it('shows the Redaktion brand and a link back to the public site', () => {
    vi.spyOn(auth, 'login').mockResolvedValue({ id: 'u1', username: 'mum', role: 'admin' });
    render(Login);
    expect(screen.getByText('Redaktion')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Anmelden' })).toBeInTheDocument();
    expect(screen.getByText(/Privater Bereich/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Zur Website/ })).toHaveAttribute('href', '#/');
  });
});
