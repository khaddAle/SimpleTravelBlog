# HTTP API

The zod schemas in `packages/shared/src/api.ts` are the **source of truth** for
request/response shapes; this page is the high-level map. All ids in the API are
opaque shortIds (posts, trips, images) — never Mongo ObjectIds — except user ids,
which are ObjectIds on the admin endpoints.

## Conventions

- **Auth**: a signed, HttpOnly `sid` session cookie (see `docs/architecture.md`).
  Protected reads require a valid session → `401` otherwise.
- **CSRF**: every mutation (`POST`/`PUT`/`PATCH`/`DELETE`) must echo the readable
  `csrf` cookie in the `X-CSRF-Token` header → `403` otherwise.
- **Roles**: `/api/users/*` requires `admin` → `403` for editors. All other
  authoring routes accept `admin` or `editor`.
- **Errors**: `400` invalid payload · `401` no session · `403` CSRF/role ·
  `404` not found · `409` conflict (duplicate / referenced) · `415` bad upload type.

## Authoring (session required)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/posts` | All posts (drafts included), newest first. |
| POST | `/api/posts` | Create a draft. Body: `createPostRequestSchema`. → `201`. |
| GET | `/api/posts/:shortId` | Single post (any status). |
| PATCH | `/api/posts/:shortId` | Partial update. Publishing stamps `publishedAt` once. |
| DELETE | `/api/posts/:shortId` | → `204`. |
| GET | `/api/trips` | Trips with `postCount`. |
| POST | `/api/trips` | Create. Unique name → `409` on duplicate. → `201`. |
| DELETE | `/api/trips/:shortId` | `409 { error:'trip_in_use', posts }` if referenced. |
| POST | `/api/images/upload` | Multipart single file → `202 { uploadId, imageId }`. |
| GET | `/api/images/upload/:uploadId/progress` | SSE: `progress`/`done`/`error`. |
| GET | `/api/images` | Paginated. Query: `imageListQuerySchema` (`q`, `orphansOnly`, `sort`). |
| GET | `/api/images/:shortId/usage` | Posts referencing the image. |
| DELETE | `/api/images/:shortId` | `409 { error:'image_in_use', posts }` if referenced. |
| GET | `/api/settings` | Branding (defaults before first save). |
| PUT | `/api/settings` | Upsert branding. Body: `settingsDtoSchema`. |

## Admin only (role: admin)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/users` | List users. |
| POST | `/api/users` | Create. Body: `createUserRequestSchema`. → `201`. |
| PATCH | `/api/users/:id` | Update password / role / `deactivated`. |

## Public (no auth, published content only)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/public/posts` | Published posts, paginated. |
| GET | `/api/public/posts/:shortId` | Single published post (`404` for drafts). |
| GET | `/api/public/search` | `searchQuerySchema`: german `$text` + country + trip + date range. |
| GET | `/api/public/trips` | Trips that have ≥1 published post. |
| GET | `/api/public/map` | Published post coordinates for the map. |
| GET | `/api/public/settings` | Branding. |
| GET | `/api/public/images/:shortId/:variant` | Streams `display`/`thumb` WebP from storage. |
