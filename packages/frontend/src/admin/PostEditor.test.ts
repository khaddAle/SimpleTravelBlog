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

/** Fill the metadata the post DTO requires (title + Land + Ortsname). */
async function fillRequiredMeta(
  user: ReturnType<typeof userEvent.setup>,
  title = 'Neue Reise',
): Promise<void> {
  await user.type(await screen.findByLabelText('Titel'), title);
  await user.type(screen.getByLabelText(/^Land/), 'DE');
  await user.type(screen.getByLabelText('Ortsname'), 'Zugspitze');
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

    await fillRequiredMeta(user);
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
    await fillRequiredMeta(user);
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

  it('opens the picker with the unused-only filter on for a fresh "+ Bild"', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'listImages').mockResolvedValue({ items: [], page: 1, pageSize: 24, total: 0 });
    render(PostEditor, {});
    await screen.findByLabelText('Titel');
    await user.click(screen.getByRole('button', { name: '+ Bild' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Nur unbenutzte')).toBeChecked();
  });

  it('blocks save and names the missing required fields when Land/Ortsname are empty', async () => {
    const user = userEvent.setup();
    const create = vi.spyOn(api, 'createPost').mockResolvedValue(samplePost());
    render(PostEditor, {});
    const title = await screen.findByLabelText('Titel');
    await user.type(title, 'Bilder-Optionen');
    await user.click(screen.getByRole('button', { name: 'Entwurf speichern' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Land');
    expect(alert).toHaveTextContent('Ortsname');
    expect(create).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it('shows an Entwurf status pill and no preview link for a new post', async () => {
    render(PostEditor, {});
    await screen.findByLabelText('Titel');
    expect(screen.getByText('Entwurf', { selector: '.pill' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Vorschau' })).toBeNull();
  });

  it('flags unsaved changes in the bar after an edit', async () => {
    const user = userEvent.setup();
    render(PostEditor, {});
    await fillRequiredMeta(user);
    expect(await screen.findByText('Ungespeicherte Änderungen')).toBeInTheDocument();
  });

  it('shows an error when saving fails', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'createPost').mockRejectedValue(new Error('boom'));
    render(PostEditor, {});
    await fillRequiredMeta(user);
    await user.click(screen.getByRole('button', { name: 'Entwurf speichern' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Speichern fehlgeschlagen.');
    expect(push).not.toHaveBeenCalled();
  });
});

describe('PostEditor unsaved-changes guard', () => {
  it('does not warn when navigating away with no unsaved changes', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(PostEditor, {});
    await screen.findByLabelText('Titel');
    await user.click(screen.getByRole('link', { name: 'Bilder' }));
    expect(confirm).not.toHaveBeenCalled();
  });

  it('confirms before leaving via the nav when there are unsaved changes', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(PostEditor, {});
    await fillRequiredMeta(user);
    await user.click(screen.getByRole('link', { name: 'Bilder' }));
    expect(confirm).toHaveBeenCalled();
  });

  it('confirms before logging out with unsaved changes and aborts on decline', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const logout = vi.spyOn(auth, 'logout').mockResolvedValue();
    render(PostEditor, {});
    await fillRequiredMeta(user);
    await user.click(screen.getByRole('button', { name: 'Abmelden' }));
    expect(confirm).toHaveBeenCalled();
    expect(logout).not.toHaveBeenCalled();
  });

  it('registers a beforeunload guard once there are unsaved changes', async () => {
    const user = userEvent.setup();
    const addSpy = vi.spyOn(window, 'addEventListener');
    render(PostEditor, {});
    await screen.findByLabelText('Titel');
    const before = addSpy.mock.calls.filter((c) => c[0] === 'beforeunload').length;
    await fillRequiredMeta(user);
    await waitFor(() => {
      const after = addSpy.mock.calls.filter((c) => c[0] === 'beforeunload').length;
      expect(after).toBeGreaterThan(before);
    });
  });
});

describe('PostEditor (edit)', () => {
  it('loads an existing post into the form', async () => {
    vi.spyOn(api, 'getPost').mockResolvedValue(samplePost());
    render(PostEditor, { params: { id: 'p1' } });
    expect(((await screen.findByLabelText('Titel')) as HTMLInputElement).value).toBe('Berge');
  });

  it('shows a published status pill and a preview link when editing', async () => {
    vi.spyOn(api, 'getPost').mockResolvedValue({ ...samplePost(), status: 'published' });
    render(PostEditor, { params: { id: 'p1' } });
    await screen.findByLabelText('Titel');
    expect(screen.getByText('Veröffentlicht', { selector: '.pill' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Vorschau' })).toHaveAttribute('href', '#/beitrag/p1');
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

  it('hides images already used by the post from a fresh gallery picker', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'getPost').mockResolvedValue({
      ...samplePost(),
      blocks: [{ type: 'gallery', imageIds: ['b'] }],
    });
    const img = (id: string, filename: string) => ({
      id,
      originalFilename: filename,
      mime: 'image/jpeg',
      width: 800,
      height: 600,
      displayUrl: `/api/public/images/${id}/display`,
      thumbUrl: `/api/public/images/${id}/thumb`,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    vi.spyOn(api, 'listImages').mockResolvedValue({
      items: [img('a', 'alpha.jpg'), img('b', 'beta.jpg')],
      page: 1,
      pageSize: 24,
      total: 2,
    });
    render(PostEditor, { params: { id: 'p1' } });
    await screen.findByLabelText('Titel');
    await user.click(screen.getByRole('button', { name: '+ Galerie' }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(await screen.findByLabelText('alpha.jpg')).toBeInTheDocument();
    // 'b' is already used by the post's gallery → hidden from the unused picker.
    expect(screen.queryByLabelText('beta.jpg')).toBeNull();
  });

  it('loads an existing cover image and preserves it on save', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'getPost').mockResolvedValue({ ...samplePost(), coverImageId: 'cov1' });
    const patch = vi.spyOn(api, 'updatePost').mockResolvedValue(samplePost());
    render(PostEditor, { params: { id: 'p1' } });
    await screen.findByLabelText('Titel');
    await user.click(screen.getByRole('button', { name: 'Entwurf speichern' }));
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith(
        'p1',
        expect.objectContaining({ coverImageId: 'cov1' }),
      ),
    );
  });
});
