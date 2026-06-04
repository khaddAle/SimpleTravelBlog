import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tick } from 'svelte';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import type { PostDto } from '@stb/shared';
import { auth } from '../lib/auth.svelte.js';
import { api } from '../lib/api.js';

const push = vi.fn();
const replace = vi.fn();
vi.mock('svelte-spa-router', () => ({
  push: (...args: unknown[]) => push(...args),
  replace: (...args: unknown[]) => replace(...args),
}));

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

function samplePost(over: Partial<PostDto> = {}): PostDto {
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
    ...over,
  };
}

const sampleDraft = () => ({
  title: 'Entwurf-Titel',
  postDate: '2026-03-05T00:00:00.000Z',
  country: 'DE',
  placeName: 'Zugspitze',
  lat: 47.42,
  lng: 10.98,
  blocks: [{ type: 'paragraph' as const, text: 'entwurf' }],
  savedAt: '2026-03-06T00:00:00.000Z',
});

/** Fill the metadata the post DTO requires (title + Land + Ortsname). */
async function fillRequiredMeta(
  user: ReturnType<typeof userEvent.setup>,
  title = 'Neue Reise',
): Promise<void> {
  await user.type(await screen.findByLabelText('Titel'), title);
  await user.type(screen.getByLabelText(/^Land/), 'DE');
  await user.type(screen.getByLabelText('Ortsname'), 'Zugspitze');
}

/** Add a block through the Fernweh inserter "+" menu (last gap = append). */
async function insertBlock(
  user: ReturnType<typeof userEvent.setup>,
  typeLabel: string,
): Promise<void> {
  const adders = screen.getAllByRole('button', { name: 'Block einfügen' });
  await user.click(adders[adders.length - 1]!);
  await user.click(screen.getByRole('button', { name: typeLabel }));
}

/**
 * Deterministically flush a pending (debounced) autosave: hiding the tab calls
 * the editor's visibilitychange handler, which flushes immediately — no need to
 * wait out the 2s debounce in tests.
 */
async function flushAutosave(): Promise<void> {
  await tick();
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  push.mockClear();
  replace.mockClear();
  auth.user = { id: 'u1', username: 'mum', role: 'admin' };
  // Benign defaults so an unmount-time autosave flush is always harmless.
  vi.spyOn(api, 'listTrips').mockResolvedValue([]);
  vi.spyOn(api, 'createPost').mockResolvedValue(samplePost());
  vi.spyOn(api, 'savePostDraft').mockResolvedValue({ savedAt: 'x', hasPendingDraft: false });
  vi.spyOn(api, 'publishPost').mockResolvedValue(samplePost({ status: 'published' }));
  vi.spyOn(api, 'discardDraft').mockResolvedValue(samplePost());
});
afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
});

describe('PostEditor (create)', () => {
  it('autosaves a new post by creating it as a draft, then swaps to the edit URL', async () => {
    const user = userEvent.setup();
    const create = vi.spyOn(api, 'createPost').mockResolvedValue(samplePost());
    render(PostEditor, {});

    await fillRequiredMeta(user);
    await insertBlock(user, 'Absatz');
    await flushAutosave();

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Neue Reise',
          blocks: [{ type: 'paragraph', text: '' }],
        }),
      ),
    );
    expect(replace).toHaveBeenCalledWith('/admin/beitrag/p1');
    expect(push).not.toHaveBeenCalled();
  });

  it('does not autosave a new post until the required fields are valid', async () => {
    const user = userEvent.setup();
    const create = vi.spyOn(api, 'createPost').mockResolvedValue(samplePost());
    render(PostEditor, {});
    await user.type(await screen.findByLabelText('Titel'), 'Nur Titel');
    await flushAutosave();
    // Land + Ortsname still missing → nothing to persist yet.
    expect(create).not.toHaveBeenCalled();
  });

  it('publishes a new post by creating then publishing it', async () => {
    const user = userEvent.setup();
    const create = vi.spyOn(api, 'createPost').mockResolvedValue(samplePost());
    const pub = vi.spyOn(api, 'publishPost').mockResolvedValue(samplePost({ status: 'published' }));
    render(PostEditor, {});
    await fillRequiredMeta(user);
    await user.click(screen.getByRole('button', { name: 'Veröffentlichen' }));
    await waitFor(() => expect(pub).toHaveBeenCalledWith('p1'));
    expect(create).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith('/admin');
  });

  it('opens and cancels the image picker modal', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'listImages').mockResolvedValue({ items: [], page: 1, pageSize: 24, total: 0 });
    render(PostEditor, {});
    await screen.findByLabelText('Titel');
    await insertBlock(user, 'Bild');
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Abbrechen' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('opens the picker with the unused-only filter on for a fresh "+ Bild"', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'listImages').mockResolvedValue({ items: [], page: 1, pageSize: 24, total: 0 });
    render(PostEditor, {});
    await screen.findByLabelText('Titel');
    await insertBlock(user, 'Bild');
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Nur unbenutzte')).toBeChecked();
  });

  it('blocks publish and names the missing required fields when Land/Ortsname are empty', async () => {
    const user = userEvent.setup();
    const create = vi.spyOn(api, 'createPost').mockResolvedValue(samplePost());
    render(PostEditor, {});
    const title = await screen.findByLabelText('Titel');
    await user.type(title, 'Bilder-Optionen');
    await user.click(screen.getByRole('button', { name: 'Veröffentlichen' }));

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

  it('shows an error when publishing fails', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'createPost').mockRejectedValue(new Error('boom'));
    render(PostEditor, {});
    await fillRequiredMeta(user);
    await user.click(screen.getByRole('button', { name: 'Veröffentlichen' }));
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
    vi.spyOn(api, 'getPost').mockResolvedValue(samplePost({ status: 'published' }));
    render(PostEditor, { params: { id: 'p1' } });
    await screen.findByLabelText('Titel');
    expect(screen.getByText('Veröffentlicht', { selector: '.pill' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Vorschau' })).toHaveAttribute('href', '#/beitrag/p1');
  });

  it('autosaves edits as a draft snapshot', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'getPost').mockResolvedValue(samplePost());
    const saveDraft = vi
      .spyOn(api, 'savePostDraft')
      .mockResolvedValue({ savedAt: 'x', hasPendingDraft: false });
    render(PostEditor, { params: { id: 'p1' } });
    const title = await screen.findByLabelText('Titel');
    await user.clear(title);
    await user.type(title, 'Berge neu');
    await flushAutosave();
    await waitFor(() =>
      expect(saveDraft).toHaveBeenCalledWith('p1', expect.objectContaining({ title: 'Berge neu' })),
    );
  });

  it('keeps an existing cover image when autosaving', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'getPost').mockResolvedValue(samplePost({ coverImageId: 'cov1' }));
    const saveDraft = vi
      .spyOn(api, 'savePostDraft')
      .mockResolvedValue({ savedAt: 'x', hasPendingDraft: false });
    render(PostEditor, { params: { id: 'p1' } });
    const title = await screen.findByLabelText('Titel');
    await user.clear(title);
    await user.type(title, 'Berge cover');
    await flushAutosave();
    await waitFor(() =>
      expect(saveDraft).toHaveBeenCalledWith('p1', expect.objectContaining({ coverImageId: 'cov1' })),
    );
  });

  it('publishes an existing post (persists the latest edit, then promotes it)', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'getPost').mockResolvedValue(samplePost());
    const saveDraft = vi
      .spyOn(api, 'savePostDraft')
      .mockResolvedValue({ savedAt: 'x', hasPendingDraft: true });
    const pub = vi.spyOn(api, 'publishPost').mockResolvedValue(samplePost({ status: 'published' }));
    render(PostEditor, { params: { id: 'p1' } });
    await screen.findByLabelText('Titel');
    await user.click(screen.getByRole('button', { name: 'Veröffentlichen' }));
    await waitFor(() => expect(pub).toHaveBeenCalledWith('p1'));
    expect(saveDraft).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith('/admin');
  });

  it('flags a pending draft after autosaving an edit to a published post', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'getPost').mockResolvedValue(samplePost({ status: 'published' }));
    vi.spyOn(api, 'savePostDraft').mockResolvedValue({ savedAt: 'x', hasPendingDraft: true });
    render(PostEditor, { params: { id: 'p1' } });
    const title = await screen.findByLabelText('Titel');
    await user.clear(title);
    await user.type(title, 'Berge editiert');
    await flushAutosave();
    expect(await screen.findByText('Nicht veröffentlichte Änderungen')).toBeInTheDocument();
  });

  it('seeds the form from a pending draft and offers to discard it', async () => {
    vi.spyOn(api, 'getPost').mockResolvedValue(
      samplePost({ status: 'published', title: 'Live', draft: sampleDraft() }),
    );
    render(PostEditor, { params: { id: 'p1' } });
    const title = (await screen.findByLabelText('Titel')) as HTMLInputElement;
    expect(title.value).toBe('Entwurf-Titel');
    expect(screen.getByText('Nicht veröffentlichte Änderungen')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Änderungen verwerfen' })).toBeInTheDocument();
  });

  it('discards a pending draft and reverts to the live article', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(api, 'getPost').mockResolvedValue(
      samplePost({ status: 'published', title: 'Live', draft: sampleDraft() }),
    );
    const discardSpy = vi
      .spyOn(api, 'discardDraft')
      .mockResolvedValue(samplePost({ status: 'published', title: 'Live' }));
    render(PostEditor, { params: { id: 'p1' } });
    await screen.findByLabelText('Titel');
    await user.click(screen.getByRole('button', { name: 'Änderungen verwerfen' }));
    await waitFor(() => expect(discardSpy).toHaveBeenCalledWith('p1'));
    await waitFor(() =>
      expect((screen.getByLabelText('Titel') as HTMLInputElement).value).toBe('Live'),
    );
  });

  it('hides images already used by the post from a fresh gallery picker', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'getPost').mockResolvedValue(
      samplePost({ blocks: [{ type: 'gallery', imageIds: ['b'] }] }),
    );
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
    await insertBlock(user, 'Galerie');

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(await screen.findByLabelText('alpha.jpg')).toBeInTheDocument();
    // 'b' is already used by the post's gallery → hidden from the unused picker.
    expect(screen.queryByLabelText('beta.jpg')).toBeNull();
  });
});
