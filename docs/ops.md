# Operations

An operational runbook for a **running** Simple Travel Blog instance: health,
configuration, admin/user management, secret rotation, running the importer, and
the backup/restore model.

This describes the application itself. **Environment-specific concerns**
(manifests, ingress, secret storage, backup schedules and destinations) live with
your deployment and are intentionally out of scope here.

## Health & logs

| Endpoint | Purpose |
|---|---|
| `GET /healthz` | Liveness — always `200 {"status":"ok"}` while the process is up. Backs the container `HEALTHCHECK`. |
| `GET /readyz` | Readiness — `200 {"status":"ready"}`. |

Logs are structured JSON (pino) on **stdout** — collect them at the platform level.

The process is **stateless**: sessions live in Redis, data in MongoDB, image
binaries in object storage. With more than one replica it tolerates rolling
restarts with no downtime. Configuration is read **once at boot**, so any env
change requires a restart to take effect.

## Configuration

All configuration is environment variables, validated by a zod schema at startup —
an invalid environment **fails fast** before the server listens. The schema is the
source of truth: [`packages/backend/src/config.ts`](../packages/backend/src/config.ts)
(version pins and rationale in [stack.md](./stack.md)).

Operationally relevant variables:

| Variable | Notes |
|---|---|
| `PUBLIC_ORIGIN` | Absolute external URL of the site. |
| `MONGO_URI` | MongoDB connection string (secret). |
| `REDIS_SENTINELS` / `REDIS_MASTER_NAME` | Sentinel topology; falls back to `REDIS_HOST`/`REDIS_PORT` for local dev. |
| `REDIS_PASSWORD` | Redis auth (secret). |
| `REDIS_KEY_PREFIX` | Namespaces every key — **must be unique per environment** when sharing one Redis. |
| `S3_ENDPOINT` / `S3_REGION` / `S3_BUCKET` / `S3_FORCE_PATH_STYLE` | Object storage wiring. |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | Object storage credentials (secret). |
| `SESSION_COOKIE_SECRET` / `CSRF_COOKIE_SECRET` | Cookie signing (secret, ≥16 chars). |
| `SESSION_TTL_SECONDS` | Session lifetime (default 14 days, sliding). |
| `ADMIN_BOOTSTRAP_USERNAME` / `ADMIN_BOOTSTRAP_PASSWORD` | First-run admin (see below). |
| `MAX_UPLOAD_BYTES` | Upload size cap (default 20 MiB). |

## First-run admin bootstrap

On startup, if the user collection is **empty** and both `ADMIN_BOOTSTRAP_USERNAME`
and `ADMIN_BOOTSTRAP_PASSWORD` are set, the app creates that first admin. The step
is **idempotent** — once any user exists it does nothing, so the variables can stay
set across restarts. Usernames are stored lowercased.

## User management

Admins manage accounts in the admin UI (or via the API):

- `GET /api/users` — list.
- `POST /api/users` — create an `admin` or `editor` (username, password, role).
- `PATCH /api/users/:id` — change a user's password or role, or deactivate /
  reactivate them (`deactivated: true|false`).

See [api.md](./api.md) for the full surface.

## Reset a lost admin password

- **If another admin can still log in:** they reset the locked-out account's
  password via the UI (or `PATCH /api/users/:id`).
- **If no admin can log in:** because the bootstrap only runs against an empty user
  collection, either delete just the locked-out admin document, or empty the user
  collection entirely, in MongoDB — then ensure `ADMIN_BOOTSTRAP_*` are set and
  **restart** the app to re-bootstrap the first admin. Removing user documents does
  **not** touch posts, trips, images, or settings.

## Rotating cookie secrets

`SESSION_COOKIE_SECRET` and `CSRF_COOKIE_SECRET` are signing keys. Generate strong
values with `openssl rand -hex 32`, update the environment, and restart.

> Rotating `SESSION_COOKIE_SECRET` invalidates **all existing sessions** — every
> user has to log in again. This is also the deliberate action to take if you
> suspect a session secret has leaked.

## Running the WordPress importer

The importer re-uploads media through the image pipeline and creates posts. Full
mapping rules and limitations are in [migration.md](./migration.md). Always
**dry-run first** and review `migration-report.json`.

```bash
# Dry run from a local corpus (no writes):
npm run import-wp -- --source-dir=./corpus --dry-run

# Bounded live trial against a running instance:
npm run import-wp -- --wp-url=https://old.example.com \
  --api-url=https://<your-host> --username=<admin> --password=<…> \
  --default-country=DE --default-place=Berlin --limit=5
```

| Flag | Meaning |
|---|---|
| `--wp-url=<site>` / `--source-dir=<dir>` | Source: live WordPress REST API, or a local `wp-posts.json` + `wp-media.json` corpus. |
| `--wp-token=<token>` | Bearer token for the WP REST API (if required). |
| `--api-url=<url>` | Target blog API (default `http://localhost:4000`). |
| `--username` / `--password` | Admin login for the target (required for a live, non-dry-run import). |
| `--limit=<N>` | Import only the first N mapped (published) posts — for bounded trials. |
| `--as-draft` | Import as drafts instead of published (escape hatch; default is publish-on-import). |
| `--default-country` / `--default-place` / `--default-lat` / `--default-lng` | Fallback location (WordPress has no geo data). |
| `--dry-run` | Parse + map only; write the report, make no changes. |
| `--out=<file>` | Report path (default `migration-report.json`). |

Notes:
- Only WordPress posts with `status: publish` are imported, created **published on
  their original date**; non-published posts are skipped and listed in the report.
- The importer is **not idempotent** (no dedup by WP source id). To re-run within
  the same environment, delete the previously imported posts first.

## Backups & restore

The data lives in **two** stores that must be backed up and restored **together**
for consistency:

1. **MongoDB** — posts, trips, users, settings, and image *metadata*.
2. **Object storage bucket** — the image *binaries* (display + thumbnail WebP).

Generic approach: `mongodump`/`mongorestore` for the database, and a bucket mirror
for the images, captured close together in time. The concrete schedule,
destinations, and restore procedure are environment-specific and belong with your
deployment, not this repository.
