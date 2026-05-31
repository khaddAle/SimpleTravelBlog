import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { auth } from '../lib/auth.svelte.js';

const push = vi.fn();
vi.mock('svelte-spa-router', () => ({ push: (...args: unknown[]) => push(...args) }));

import AdminLayout from './AdminLayout.svelte';

beforeEach(() => {
  push.mockClear();
  auth.user = null;
});
afterEach(() => vi.restoreAllMocks());

describe('AdminLayout', () => {
  it('shows the Nutzer link only for admins', () => {
    auth.user = { id: 'u1', username: 'mum', role: 'admin' };
    render(AdminLayout);
    expect(screen.getByRole('link', { name: 'Nutzer' })).toBeInTheDocument();
  });

  it('hides the Nutzer link for editors', () => {
    auth.user = { id: 'u2', username: 'dad', role: 'editor' };
    render(AdminLayout);
    expect(screen.queryByRole('link', { name: 'Nutzer' })).toBeNull();
  });

  it('logs out and redirects to login', async () => {
    const user = userEvent.setup();
    auth.user = { id: 'u1', username: 'mum', role: 'admin' };
    const logout = vi.spyOn(auth, 'logout').mockResolvedValue();
    render(AdminLayout);
    await user.click(screen.getByRole('button', { name: 'Abmelden' }));
    expect(logout).toHaveBeenCalled();
    await waitFor(() => expect(push).toHaveBeenCalledWith('/login'));
  });

  it('shows the Redaktion brand', () => {
    auth.user = { id: 'u1', username: 'mum', role: 'admin' };
    render(AdminLayout);
    expect(screen.getByText('Redaktion')).toBeInTheDocument();
  });

  it('marks the active section with aria-current', () => {
    auth.user = { id: 'u1', username: 'mum', role: 'admin' };
    render(AdminLayout, { props: { current: 'bilder' } });
    expect(screen.getByRole('link', { name: 'Bilder' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Beiträge' })).not.toHaveAttribute('aria-current');
  });
});
