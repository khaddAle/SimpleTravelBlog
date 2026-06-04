import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api, ApiError, readCsrfToken } from './api.js';

/** Build a Response-like stub for the mocked fetch. */
function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
  const status = init.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (body === undefined ? '' : JSON.stringify(body)),
  } as Response;
}

function noContent(): Response {
  return { ok: true, status: 204, text: async () => '' } as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  document.cookie = 'csrf=tok-123';
});

afterEach(() => {
  vi.unstubAllGlobals();
  // Clear the csrf cookie between tests.
  document.cookie = 'csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
});

describe('readCsrfToken', () => {
  it('reads the csrf cookie', () => {
    expect(readCsrfToken()).toBe('tok-123');
  });

  it('returns null when absent', () => {
    document.cookie = 'csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    expect(readCsrfToken()).toBeNull();
  });
});

describe('auth', () => {
  it('login posts credentials and returns the user', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ user: { id: 'u1', username: 'mum', role: 'editor' } }),
    );
    const user = await api.login('mum', 'pw');
    expect(user.username).toBe('mum');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/auth/login');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(JSON.parse(init.body)).toEqual({ username: 'mum', password: 'pw' });
  });

  it('me() returns null on 401 instead of throwing', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'unauthorized' }, { status: 401 }));
    expect(await api.me()).toBeNull();
  });

  it('logout sends the csrf header', async () => {
    fetchMock.mockResolvedValue(noContent());
    await api.logout();
    const [, init] = fetchMock.mock.calls[0]!;
    expect(init.headers['x-csrf-token']).toBe('tok-123');
  });
});

describe('mutations send csrf, reads do not', () => {
  it('createPost includes the csrf header and JSON body', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ post: { id: 'p1' } }));
    await api.createPost({
      title: 'T',
      postDate: '2026-01-01T00:00:00.000Z',
      country: 'DE',
      placeName: 'Berlin',
      lat: 1,
      lng: 2,
      blocks: [],
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/posts');
    expect(init.method).toBe('POST');
    expect(init.headers['x-csrf-token']).toBe('tok-123');
  });

  it('savePostDraft PUTs with csrf and returns the ack', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ savedAt: '2026-01-01T00:00:00.000Z', hasPendingDraft: true }),
    );
    const ack = await api.savePostDraft('p1', {
      title: 'T',
      postDate: '2026-01-01T00:00:00.000Z',
      country: 'DE',
      placeName: 'Berlin',
      lat: 1,
      lng: 2,
      blocks: [],
    });
    expect(ack).toEqual({ savedAt: '2026-01-01T00:00:00.000Z', hasPendingDraft: true });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/posts/p1/draft');
    expect(init.method).toBe('PUT');
    expect(init.headers['x-csrf-token']).toBe('tok-123');
  });

  it('publishPost / discardDraft POST with csrf and return the post', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ post: { id: 'p1', title: 'Live' } }));
    expect((await api.publishPost('p1')).title).toBe('Live');
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/posts/p1/publish');
    expect(fetchMock.mock.calls[0]![1].method).toBe('POST');
    expect(fetchMock.mock.calls[0]![1].headers['x-csrf-token']).toBe('tok-123');

    fetchMock.mockResolvedValueOnce(jsonResponse({ post: { id: 'p1', title: 'Original' } }));
    expect((await api.discardDraft('p1')).title).toBe('Original');
    expect(fetchMock.mock.calls[1]![0]).toBe('/api/posts/p1/discard-draft');
  });

  it('listPosts is a plain GET without csrf and returns posts + total', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ posts: [{ id: 'p1' }], total: 1 }));
    const { posts, total } = await api.listPosts();
    expect(posts).toHaveLength(1);
    expect(total).toBe(1);
    const [, init] = fetchMock.mock.calls[0]!;
    expect(init.headers['x-csrf-token']).toBeUndefined();
  });
});

describe('error handling', () => {
  it('throws ApiError with parsed body on 409', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: 'image_in_use', posts: [{ id: 'p1', title: 'X' }] }, { status: 409 }),
    );
    const err = await api.deleteImage('img1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(409);
    expect((err as ApiError).message).toBe('image_in_use');
    expect((err as ApiError).body).toMatchObject({ posts: [{ id: 'p1' }] });
  });
});

describe('query building', () => {
  it('listImages serialises only set params', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ images: [], page: 1, pageSize: 20, total: 0 }),
    );
    await api.listImages({ q: 'berg', orphansOnly: true, sort: 'filename' });
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toContain('q=berg');
    expect(url).toContain('orphansOnly=true');
    expect(url).toContain('sort=filename');
  });

  it('publicSearch maps to query string and returns posts', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ posts: [{ id: 'p1' }], total: 1 }));
    const posts = await api.publicSearch({ q: 'berge', country: 'DE' });
    expect(posts).toHaveLength(1);
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toContain('/api/public/search?');
    expect(url).toContain('q=berge');
    expect(url).toContain('country=DE');
  });
});

describe('uploadImage', () => {
  it('posts FormData with the csrf header', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ uploadId: 'up1', imageId: 'img1' }));
    const file = new File([new Uint8Array([1, 2, 3])], 'foto.jpg', { type: 'image/jpeg' });
    const res = await api.uploadImage(file);
    expect(res).toEqual({ uploadId: 'up1', imageId: 'img1' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/images/upload');
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.headers['x-csrf-token']).toBe('tok-123');
  });
});

describe('error message extraction', () => {
  it('falls back to a generic message when the body has neither field', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, { status: 500 }));
    const err = await api.listPosts().catch((e: unknown) => e);
    expect((err as ApiError).message).toBe('request failed (500)');
  });

  it('rethrows non-401 errors from me()', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'boom' }, { status: 500 }));
    await expect(api.me()).rejects.toBeInstanceOf(ApiError);
  });

  it('parses a non-JSON ok body as text without throwing', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => 'plain' } as Response);
    // The parse fallback returns the raw string; publicTrips then reads .trips → undefined.
    await expect(api.publicTrips()).resolves.toBeUndefined();
  });
});

describe('remaining endpoints', () => {
  it('getPost / updatePost / deletePost', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ post: { id: 'p1', title: 'T' } }));
    expect((await api.getPost('p1')).title).toBe('T');

    fetchMock.mockResolvedValueOnce(jsonResponse({ post: { id: 'p1', title: 'U' } }));
    const updated = await api.updatePost('p1', { status: 'published' });
    expect(updated.title).toBe('U');
    expect(fetchMock.mock.calls[1]![1].method).toBe('PATCH');

    fetchMock.mockResolvedValueOnce(noContent());
    await expect(api.deletePost('p1')).resolves.toBeUndefined();
  });

  it('trips: list / create / delete', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ trips: [{ id: 't1', name: 'Alpen' }] }));
    expect(await api.listTrips()).toHaveLength(1);

    fetchMock.mockResolvedValueOnce(jsonResponse({ trip: { id: 't2', name: 'Nordsee' } }));
    const trip = await api.createTrip('Nordsee');
    expect(trip.name).toBe('Nordsee');

    fetchMock.mockResolvedValueOnce(jsonResponse({ trip: { id: 't2', name: 'Nordsee 2027' } }));
    const renamed = await api.updateTrip('t2', 'Nordsee 2027');
    expect(renamed.name).toBe('Nordsee 2027');
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/trips/t2',
      expect.objectContaining({ method: 'PATCH' }),
    );

    fetchMock.mockResolvedValueOnce(noContent());
    await expect(api.deleteTrip('t2')).resolves.toBeUndefined();
  });

  it('images: usage / delete', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ posts: [{ id: 'p1', title: 'T' }] }));
    expect(await api.imageUsage('img1')).toEqual([{ id: 'p1', title: 'T' }]);

    fetchMock.mockResolvedValueOnce(noContent());
    await expect(api.deleteImage('img1')).resolves.toBeUndefined();
  });

  it('users: list / create / update', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ users: [{ id: 'u1', username: 'mum' }] }));
    expect(await api.listUsers()).toHaveLength(1);

    fetchMock.mockResolvedValueOnce(jsonResponse({ user: { id: 'u2', username: 'kid' } }));
    const created = await api.createUser({ username: 'kid', password: 'longenough', role: 'editor' });
    expect(created.username).toBe('kid');

    fetchMock.mockResolvedValueOnce(jsonResponse({ user: { id: 'u2', username: 'kid' } }));
    await api.updateUser('u2', { deactivated: true });
    expect(fetchMock.mock.calls[2]![1].method).toBe('PATCH');
  });

  it('settings: get / update', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ settings: { siteTitle: 'X', accentColor: '#000000' } }),
    );
    expect((await api.getSettings()).siteTitle).toBe('X');

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ settings: { siteTitle: 'Y', accentColor: '#111111' } }),
    );
    const saved = await api.updateSettings({ siteTitle: 'Y', accentColor: '#111111' });
    expect(saved.siteTitle).toBe('Y');
    expect(fetchMock.mock.calls[1]![1].method).toBe('PUT');
  });

  it('public: post / posts / trips / map / settings', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ post: { id: 'p1', title: 'T' } }));
    expect((await api.publicPost('p1')).title).toBe('T');

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ posts: [{ id: 'p1' }], page: 1, pageSize: 20, total: 1 }),
    );
    expect((await api.publicPosts()).items).toHaveLength(1);

    fetchMock.mockResolvedValueOnce(jsonResponse({ trips: [{ id: 't1', name: 'Alpen' }] }));
    expect(await api.publicTrips()).toHaveLength(1);

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ countries: ['DE', 'IT'], months: [202603, 202605] }),
    );
    const facets = await api.publicFacets();
    expect(facets.countries).toEqual(['DE', 'IT']);
    expect(facets.months).toEqual([202603, 202605]);
    expect(fetchMock).toHaveBeenLastCalledWith('/api/public/facets', expect.anything());

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ points: [{ id: 'p1', title: 'T' }], unlocatedCount: 2 }),
    );
    const map = await api.publicMap();
    expect(map.points).toHaveLength(1);
    expect(map.unlocatedCount).toBe(2);

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ settings: { siteTitle: 'X', accentColor: '#000000' } }),
    );
    expect((await api.publicSettings()).siteTitle).toBe('X');
  });
});
