import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import type { PostDto } from '@stb/shared';
import { auth } from '../lib/auth.svelte.js';
import { api } from '../lib/api.js';

const push = vi.fn();
vi.mock('svelte-spa-router', () => ({ push: (...args: unknown[]) => push(...args) }));

// PostEditor → MetadataSidebar → MapPicker mounts Leaflet; stub it.
vi.mock('leaflet', () => {
  const map = { setView: vi.fn().mockReturnThis(), on: vi.fn().mockReturnThis(), remove: vi.fn() };
  return {
    default: {
      map: vi.fn(() => map),
      tileLayer: vi.fn(() => ({ addTo: vi.fn().mockReturnThis() })),
      marker: vi.fn(() => ({ addTo: vi.fn().mockReturnThis(), setLatLng: vi.fn().mockReturnThis() })),
    },
  };
});

import PostEditor from './PostEditor.svelte';

function samplePost(): PostDto {
  return {
    id: 'p1',
    title: 'Berge',
    blocks: [{ type: 'paragraph', text: 'Hallo' }],
    postDate: '2026-03-05T00:00:00.000Z',
    country: 'DE',
    placeName: 'Zugspitze',
    lat: 47.42,
    lng: 10.98,
    status: 'draft',
    createdAt: '2026-03-05T00:00:00.000Z',
    updatedAt: '2026-03-05T00:00:00.000Z',
  };
}

beforeEach(() => {
  push.mockClear();
  auth.user = { id: 'u1', username: 'mum', role: 'admin' };
  vi.spyOn(api, 'listTrips').mockResolvedValue([]);
});
afterEach(() => vi.restoreAllMocks());

describe('PostEditor (create)', () => {
  it('creates a draft from entered content', async () => {
    const user = userEvent.setup();
    const create = vi.spyOn(api, 'createPost').mockResolvedValue(samplePost());
    render(PostEditor, {});

    const title = await screen.findByLabelText('Titel');
    await user.type(title, 'Neue Reise');
    await user.click(screen.getByRole('button', { name: '+ Absatz' }));
    await user.click(screen.getByRole('button', { name: 'Entwurf speichern' }));

    await waitFor(() => {
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Neue Reise',
          blocks: [{ type: 'paragraph', text: '' }],
        }),
      );
    });
    expect(push).toHaveBeenCalledWith('/admin');
  });

  it('publishes by creating then patching status', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'createPost').mockResolvedValue(samplePost());
    const patch = vi.spyOn(api, 'updatePost').mockResolvedValue(samplePost());
    render(PostEditor, {});
    await screen.findByLabelText('Titel');
    await user.click(screen.getByRole('button', { name: 'Veröffentlichen' }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith('p1', { status: 'published' }));
  });

  it('opens and cancels the image picker modal', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'listImages').mockResolvedValue({ items: [], page: 1, pageSize: 24, total: 0 });
    render(PostEditor, {});
    await screen.findByLabelText('Titel');
    await user.click(screen.getByRole('button', { name: '+ Bild' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Abbrechen' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('shows an error when saving fails', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'createPost').mockRejectedValue(new Error('boom'));
    render(PostEditor, {});
    await screen.findByLabelText('Titel');
    await user.click(screen.getByRole('button', { name: 'Entwurf speichern' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Speichern fehlgeschlagen.');
    expect(push).not.toHaveBeenCalled();
  });
});

describe('PostEditor (edit)', () => {
  it('loads an existing post into the form', async () => {
    vi.spyOn(api, 'getPost').mockResolvedValue(samplePost());
    render(PostEditor, { params: { id: 'p1' } });
    expect(((await screen.findByLabelText('Titel')) as HTMLInputElement).value).toBe('Berge');
  });

  it('saves edits with updatePost', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'getPost').mockResolvedValue(samplePost());
    const patch = vi.spyOn(api, 'updatePost').mockResolvedValue(samplePost());
    render(PostEditor, { params: { id: 'p1' } });
    await screen.findByLabelText('Titel');
    await user.click(screen.getByRole('button', { name: 'Entwurf speichern' }));
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith('p1', expect.objectContaining({ status: 'draft' })),
    );
  });
});
