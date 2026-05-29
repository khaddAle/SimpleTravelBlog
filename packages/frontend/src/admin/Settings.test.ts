import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { auth } from '../lib/auth.svelte.js';
import { api } from '../lib/api.js';
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

  it('shows an error when saving fails', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'getSettings').mockResolvedValue({ siteTitle: 'Alt', accentColor: '#000000' });
    vi.spyOn(branding, 'save').mockRejectedValue(new Error('down'));
    render(Settings);
    await screen.findByLabelText('Seitentitel');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Speichern fehlgeschlagen.');
  });
});
