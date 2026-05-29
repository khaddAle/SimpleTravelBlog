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

  it('listPosts is a plain GET without csrf', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ posts: [{ id: 'p1' }] }));
    const posts = await api.listPosts();
    expect(posts).toHaveLength(1);
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
