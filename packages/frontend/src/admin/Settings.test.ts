import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { auth } from '../lib/auth.svelte.js';
import { api, ApiError } from '../lib/api.js';
import { settings as branding } from '../lib/settings.svelte.js';

vi.mock('svelte-spa-router', () => ({ push: vi.fn() }));

import Settings from './Settings.svelte';

beforeEach(() => {
  auth.user = { id: 'u1', username: 'mum', role: 'admin' };
});
afterEach(() => vi.restoreAllMocks());

describe('Settings', () => {
  it('loads current settings into the form', async () => {
    vi.spyOn(api, 'getSettings').mockResolvedValue({
      siteTitle: 'Unsere Reisen',
      accentColor: '#ff0000',
    });
    render(Settings);
    expect(((await screen.findByLabelText('Seitentitel')) as HTMLInputElement).value).toBe(
      'Unsere Reisen',
    );
  });

  it('saves changes and confirms', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'getSettings').mockResolvedValue({
      siteTitle: 'Alt',
      accentColor: '#000000',
    });
    const save = vi.spyOn(branding, 'save').mockResolvedValue();
    render(Settings);
    const title = (await screen.findByLabelText('Seitentitel')) as HTMLInputElement;
    await user.clear(title);
    await user.type(title, 'Neu');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ siteTitle: 'Neu' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Gespeichert.');
  });

  it('loads existing background images and keeps them on save', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'getSettings').mockResolvedValue({
      siteTitle: 'Alt',
      accentColor: '#000000',
      backgroundImageIds: ['bg1'],
    });
    const save = vi.spyOn(branding, 'save').mockResolvedValue();
    const { container } = render(Settings);
    await screen.findByLabelText('Seitentitel');
    expect(container.querySelector('.bg-thumb')).toHaveAttribute(
      'src',
      '/api/public/images/bg1/thumb',
    );
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ backgroundImageIds: ['bg1'] }),
    );
  });

  it('removes a background image before saving', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'getSettings').mockResolvedValue({
      siteTitle: 'Alt',
      accentColor: '#000000',
      backgroundImageIds: ['bg1', 'bg2'],
    });
    const save = vi.spyOn(branding, 'save').mockResolvedValue();
    render(Settings);
    await screen.findByLabelText('Seitentitel');
    const removeButtons = screen.getAllByRole('button', {
      name: 'Hintergrundbild entfernen',
    });
    await user.click(removeButtons[0]!);
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ backgroundImageIds: ['bg2'] }),
    );
  });

  it('adds background images via the picker', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'getSettings').mockResolvedValue({
      siteTitle: 'Alt',
      accentColor: '#000000',
    });
    vi.spyOn(api, 'listImages').mockResolvedValue({
      items: [
        {
          id: 'bg9',
          originalFilename: 'strand.jpg',
          mime: 'image/webp',
          width: 1,
          height: 1,
          displayUrl: '/api/public/images/bg9/display',
          thumbUrl: '/api/public/images/bg9/thumb',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      page: 1,
      pageSize: 24,
      total: 1,
    });
    const save = vi.spyOn(branding, 'save').mockResolvedValue();
    render(Settings);
    await screen.findByLabelText('Seitentitel');

    await user.click(screen.getByRole('button', { name: 'Hintergrundbilder hinzufügen' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'strand.jpg' }));
    await user.click(screen.getByRole('button', { name: 'Auswählen' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ backgroundImageIds: ['bg9'] }),
    );
  });

  it('opens the background picker with the unused-only filter on', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'getSettings').mockResolvedValue({ siteTitle: 'Alt', accentColor: '#000000' });
    vi.spyOn(api, 'listImages').mockResolvedValue({ items: [], page: 1, pageSize: 24, total: 0 });
    render(Settings);
    await screen.findByLabelText('Seitentitel');
    await user.click(screen.getByRole('button', { name: 'Hintergrundbilder hinzufügen' }));
    expect(await screen.findByLabelText('Nur unbenutzte')).toBeChecked();
    await waitFor(() =>
      expect(api.listImages).toHaveBeenLastCalledWith(
        expect.objectContaining({ orphansOnly: true }),
      ),
    );
  });

  it('shows an error when saving fails', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'getSettings').mockResolvedValue({ siteTitle: 'Alt', accentColor: '#000000' });
    vi.spyOn(branding, 'save').mockRejectedValue(new Error('down'));
    render(Settings);
    await screen.findByLabelText('Seitentitel');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Speichern fehlgeschlagen.');
  });

  describe('admin gating of blog branding', () => {
    beforeEach(() => {
      vi.spyOn(api, 'getSettings').mockResolvedValue({ siteTitle: 'Alt', accentColor: '#000000' });
    });

    it('hides the blog-branding form from a non-admin editor', async () => {
      auth.user = { id: 'u2', username: 'ed', role: 'editor' };
      render(Settings);
      // The self-service password form stays available to every editor…
      expect(await screen.findByLabelText('Aktuelles Passwort')).toBeInTheDocument();
      // …but the admin-only blog branding fields are gone.
      expect(screen.queryByLabelText('Seitentitel')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Speichern' })).toBeNull();
      expect(
        screen.queryByRole('button', { name: 'Hintergrundbilder hinzufügen' }),
      ).toBeNull();
    });

    it('shows the blog-branding form to an admin', async () => {
      auth.user = { id: 'u1', username: 'mum', role: 'admin' };
      render(Settings);
      expect(await screen.findByLabelText('Seitentitel')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Speichern' })).toBeInTheDocument();
    });
  });

  describe('change password', () => {
    beforeEach(() => {
      vi.spyOn(api, 'getSettings').mockResolvedValue({ siteTitle: 'Alt', accentColor: '#000000' });
    });

    async function fillPassword(
      user: ReturnType<typeof userEvent.setup>,
      old: string,
      neu: string,
      confirm: string,
    ): Promise<void> {
      await user.type(await screen.findByLabelText('Aktuelles Passwort'), old);
      await user.type(screen.getByLabelText('Neues Passwort'), neu);
      await user.type(screen.getByLabelText('Neues Passwort bestätigen'), confirm);
    }

    it('changes the password and confirms', async () => {
      const user = userEvent.setup();
      const change = vi.spyOn(api, 'changePassword').mockResolvedValue();
      render(Settings);
      await screen.findByLabelText('Seitentitel');
      await fillPassword(user, 'old-secret', 'new-secret-1', 'new-secret-1');
      await user.click(screen.getByRole('button', { name: 'Passwort ändern' }));
      expect(change).toHaveBeenCalledWith('old-secret', 'new-secret-1', 'new-secret-1');
      expect(await screen.findByText('Passwort geändert.')).toBeInTheDocument();
    });

    it('shows a precise message when the current password is wrong', async () => {
      const user = userEvent.setup();
      vi.spyOn(api, 'changePassword').mockRejectedValue(
        new ApiError(400, 'invalid_current_password', { error: 'invalid_current_password' }),
      );
      render(Settings);
      await screen.findByLabelText('Seitentitel');
      await fillPassword(user, 'wrong-old', 'new-secret-1', 'new-secret-1');
      await user.click(screen.getByRole('button', { name: 'Passwort ändern' }));
      expect(await screen.findByText('Das aktuelle Passwort ist falsch.')).toBeInTheDocument();
    });

    it('rejects a confirmation mismatch client-side without calling the API', async () => {
      const user = userEvent.setup();
      const change = vi.spyOn(api, 'changePassword').mockResolvedValue();
      render(Settings);
      await screen.findByLabelText('Seitentitel');
      await fillPassword(user, 'old-secret', 'new-secret-1', 'mismatch-2');
      await user.click(screen.getByRole('button', { name: 'Passwort ändern' }));
      expect(change).not.toHaveBeenCalled();
      expect(
        await screen.findByText('Die neuen Passwörter stimmen nicht überein.'),
      ).toBeInTheDocument();
    });
  });
});
