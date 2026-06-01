import type {
  PostDto,
  TripDto,
  ImageDto,
  UserDto,
  UserListItem,
  SettingsDto,
  CreatePostRequest,
  UpdatePostRequest,
  CreateUserRequest,
  UpdateUserRequest,
  UploadAccepted,
} from '@stb/shared';

/** Header the backend's double-submit CSRF guard reads on mutations. */
const CSRF_HEADER = 'x-csrf-token';

/** Thrown for any non-2xx response. `body` carries the parsed JSON error payload. */
export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

/** Read the readable (non-HttpOnly) `csrf` cookie the server set at login. */
export function readCsrfToken(): string | null {
  const match = /(?:^|;\s*)csrf=([^;]*)/.exec(document.cookie);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export interface ListImagesQuery {
  page?: number;
  pageSize?: number;
  q?: string;
  orphansOnly?: boolean;
  sort?: 'newest' | 'oldest' | 'filename';
  /** Discount this post's persisted refs when filtering orphans (editor only). */
  excludePostId?: string;
}

export interface PublicSearchQuery {
  q?: string;
  country?: string;
  tripId?: string;
  from?: string;
  to?: string;
}

export interface Paginated<T> {
  page: number;
  pageSize: number;
  total: number;
  items: T[];
}

export interface MapPoint {
  id: string;
  title: string;
  lat: number;
  lng: number;
  country: string;
  placeName: string;
}

export interface MapData {
  /** Published posts with real coordinates (Null-Island placeholders excluded). */
  points: MapPoint[];
  /** Count of published posts the import left without a location. */
  unlocatedCount: number;
}

export interface PostRef {
  id: string;
  title: string;
}

type QueryValue = string | number | boolean | undefined;

function toQueryString(query: Record<string, QueryValue>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  csrf?: boolean;
}

async function parseBody(res: Response): Promise<unknown> {
  if (res.status === 204) return undefined;
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function errorMessage(status: number, body: unknown): string {
  if (body && typeof body === 'object') {
    const rec = body as Record<string, unknown>;
    if (typeof rec.message === 'string') return rec.message;
    if (typeof rec.error === 'string') return rec.error;
  }
  return `request failed (${status})`;
}

async function handle<T>(res: Response): Promise<T> {
  const body = await parseBody(res);
  if (!res.ok) throw new ApiError(res.status, errorMessage(res.status, body), body);
  return body as T;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, csrf = false } = opts;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (csrf) {
    const token = readCsrfToken();
    if (token) headers[CSRF_HEADER] = token;
  }
  const res = await fetch(path, {
    method,
    credentials: 'include',
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return handle<T>(res);
}

export const api = {
  // --- auth ---
  async login(username: string, password: string): Promise<UserDto> {
    const { user } = await request<{ user: UserDto }>('/api/auth/login', {
      method: 'POST',
      body: { username, password },
    });
    return user;
  },

  async logout(): Promise<void> {
    await request<void>('/api/auth/logout', { method: 'POST', csrf: true });
  },

  /** Change the current user's password (current password + new password twice). */
  async changePassword(
    oldPassword: string,
    newPassword: string,
    newPasswordConfirm: string,
  ): Promise<void> {
    await request<{ ok: true }>('/api/auth/change-password', {
      method: 'POST',
      body: { oldPassword, newPassword, newPasswordConfirm },
      csrf: true,
    });
  },

  /** Returns the current user, or null when not authenticated (401). */
  async me(): Promise<UserDto | null> {
    try {
      const { user } = await request<{ user: UserDto }>('/api/auth/me');
      return user;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return null;
      throw err;
    }
  },

  // --- posts (authoring) ---
  async listPosts(): Promise<PostDto[]> {
    return (await request<{ posts: PostDto[] }>('/api/posts')).posts;
  },
  async getPost(id: string): Promise<PostDto> {
    return (await request<{ post: PostDto }>(`/api/posts/${id}`)).post;
  },
  async createPost(data: CreatePostRequest): Promise<PostDto> {
    return (
      await request<{ post: PostDto }>('/api/posts', { method: 'POST', body: data, csrf: true })
    ).post;
  },
  async updatePost(id: string, data: UpdatePostRequest): Promise<PostDto> {
    return (
      await request<{ post: PostDto }>(`/api/posts/${id}`, {
        method: 'PATCH',
        body: data,
        csrf: true,
      })
    ).post;
  },
  async deletePost(id: string): Promise<void> {
    await request<void>(`/api/posts/${id}`, { method: 'DELETE', csrf: true });
  },

  // --- trips ---
  async listTrips(): Promise<TripDto[]> {
    return (await request<{ trips: TripDto[] }>('/api/trips')).trips;
  },
  async createTrip(name: string): Promise<TripDto> {
    return (
      await request<{ trip: TripDto }>('/api/trips', {
        method: 'POST',
        body: { name },
        csrf: true,
      })
    ).trip;
  },
  async updateTrip(id: string, name: string): Promise<TripDto> {
    return (
      await request<{ trip: TripDto }>(`/api/trips/${id}`, {
        method: 'PATCH',
        body: { name },
        csrf: true,
      })
    ).trip;
  },
  async deleteTrip(id: string): Promise<void> {
    await request<void>(`/api/trips/${id}`, { method: 'DELETE', csrf: true });
  },

  // --- images ---
  async listImages(query: ListImagesQuery = {}): Promise<Paginated<ImageDto>> {
    const res = await request<{
      images: ImageDto[];
      page: number;
      pageSize: number;
      total: number;
    }>(`/api/images${toQueryString({ ...query })}`);
    return { items: res.images, page: res.page, pageSize: res.pageSize, total: res.total };
  },
  async uploadImage(file: File): Promise<UploadAccepted> {
    const form = new FormData();
    form.append('file', file);
    const headers: Record<string, string> = {};
    const token = readCsrfToken();
    if (token) headers[CSRF_HEADER] = token;
    const res = await fetch('/api/images/upload', {
      method: 'POST',
      credentials: 'include',
      headers,
      body: form,
    });
    return handle<UploadAccepted>(res);
  },
  async imageUsage(id: string): Promise<PostRef[]> {
    return (await request<{ posts: PostRef[] }>(`/api/images/${id}/usage`)).posts;
  },
  async deleteImage(id: string): Promise<void> {
    await request<void>(`/api/images/${id}`, { method: 'DELETE', csrf: true });
  },
  /** How many images are currently unused (for the bulk-delete confirm). */
  async unusedImageCount(): Promise<number> {
    return (await request<{ count: number }>('/api/images/unused/count')).count;
  },
  /** Delete every unused image; returns how many were removed. */
  async deleteUnusedImages(): Promise<number> {
    return (
      await request<{ deleted: number }>('/api/images/unused/delete', {
        method: 'POST',
        csrf: true,
      })
    ).deleted;
  },

  // --- users (admin) ---
  async listUsers(): Promise<UserListItem[]> {
    return (await request<{ users: UserListItem[] }>('/api/users')).users;
  },
  async createUser(data: CreateUserRequest): Promise<UserListItem> {
    return (
      await request<{ user: UserListItem }>('/api/users', {
        method: 'POST',
        body: data,
        csrf: true,
      })
    ).user;
  },
  async updateUser(id: string, data: UpdateUserRequest): Promise<UserListItem> {
    return (
      await request<{ user: UserListItem }>(`/api/users/${id}`, {
        method: 'PATCH',
        body: data,
        csrf: true,
      })
    ).user;
  },

  // --- settings ---
  async getSettings(): Promise<SettingsDto> {
    return (await request<{ settings: SettingsDto }>('/api/settings')).settings;
  },
  async updateSettings(data: SettingsDto): Promise<SettingsDto> {
    return (
      await request<{ settings: SettingsDto }>('/api/settings', {
        method: 'PUT',
        body: data,
        csrf: true,
      })
    ).settings;
  },

  // --- public (anonymous reader) ---
  async publicPosts(page = 1, pageSize = 20): Promise<Paginated<PostDto>> {
    const res = await request<{
      posts: PostDto[];
      page: number;
      pageSize: number;
      total: number;
    }>(`/api/public/posts${toQueryString({ page, pageSize })}`);
    return { items: res.posts, page: res.page, pageSize: res.pageSize, total: res.total };
  },
  async publicPost(id: string): Promise<PostDto> {
    return (await request<{ post: PostDto }>(`/api/public/posts/${id}`)).post;
  },
  async publicSearch(query: PublicSearchQuery): Promise<PostDto[]> {
    const res = await request<{ posts: PostDto[]; total: number }>(
      `/api/public/search${toQueryString({ ...query })}`,
    );
    return res.posts;
  },
  async publicTrips(): Promise<TripDto[]> {
    return (await request<{ trips: TripDto[] }>('/api/public/trips')).trips;
  },
  async publicMap(): Promise<MapData> {
    return await request<MapData>('/api/public/map');
  },
  async publicSettings(): Promise<SettingsDto> {
    return (await request<{ settings: SettingsDto }>('/api/public/settings')).settings;
  },
};

export type Api = typeof api;
