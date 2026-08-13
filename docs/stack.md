# Stack & version pins

All versions are pinned **exactly** (`--save-exact`, no `^`/`~`) and were last
refreshed on **2026-08-13**, each cross-checked against a **14-day publish-age
threshold** (see `.claude/skills/npm-safe-install/SKILL.md`). Where npm's
`latest` was younger than that, the pin is the newest same-major version ≥ 14
days old instead.

> Re-run the publish-age check for **every** pin if this has sat idle — a
> version that was safe on 2026-08-13 says nothing about a release pushed since.

The 2026-08-13 refresh cleared all 12 open advisories (10 high) and moved the
runtime from Node 22 to 24; `npm audit` reports 0 vulnerabilities.

## Runtime
| | Version | Notes |
|---|---|---|
| Node | `24.19.0` (Krypton, Active LTS) | ARM64 native. Pinned in `.nvmrc`, Docker base, CI setup-node. Moved off 22 (Jod) on 2026-08-13: 22 entered maintenance 2025-10-21, 24 is Active LTS until 2026-10-20 (EOL 2028-04-30). |
| Base image | `node:24.19.0-bookworm-slim` (linux/arm64) | glibc base for sharp's prebuilt `@img` binaries + argon2. sharp bundles its own libvips (incl. HEIF), so no image libs are apt-installed. Alpine (musl) rejected. |

## Backend dependencies
| Package | Version | Why |
|---|---|---|
| `fastify` | `5.11.0` | HTTP server, schema validation, pino logger. |
| `@fastify/static` | `10.1.2` | Serve built SPA assets. v10 hands `setHeaders` a `FastifyReply`, not a Node response — see `src/spa.ts`. |
| `@fastify/multipart` | `10.1.0` | Image upload handling. |
| `@fastify/cookie` | `11.1.2` | Session + CSRF cookies. |
| `@fastify/sensible` | `6.0.4` | `httpErrors.unauthorized()` etc. |
| `mongoose` | `9.8.1` | ODM. |
| `ioredis` | `5.11.1` | Sentinel-aware Redis client. Held on 5.x — 6.0.0 missed the age gate. |
| `argon2` | `0.45.1` | argon2id password hashing. |
| `@aws-sdk/client-s3` | `3.1098.0` | MinIO/S3 client. |
| `sharp` | `0.35.3` | Image transcode (bundled libvips 8.18.3, incl. libheif). |
| `heic-convert` | `2.1.0` | HEIC fallback if sharp libheif unavailable. |
| `nanoid` | `5.1.16` | 6-char post/trip shortIds. |
| `pino` | `10.3.1` | Structured JSON logs to stdout. |
| `zod` | `4.4.3` | Env-var schema + API request validation. |
| `cheerio` | `1.2.0` | WP HTML → block parsing in importer. |
| `cookie-signature` | `1.2.2` | Cookie signing (`SESSION_COOKIE_SECRET`). |
| `p-limit` | `7.3.1` | Concurrency cap for importer media re-uploads. |
| `dotenv` | `17.4.2` | Local-dev env loading; ignored in container. |

CSRF and login rate limiting are hand-rolled (`src/auth/csrf.ts`,
`src/redis/rateLimit.ts`). `@fastify/csrf-protection` and `@fastify/rate-limit`
were declared but never imported, and were removed on 2026-08-13.

## Backend devDependencies
| Package | Version | Why |
|---|---|---|
| `typescript` | `6.0.3` | Strict mode + ESM. Held at 6 — see "TypeScript 7 blocked" below. |
| `tsx` | `4.23.1` | `npm run dev` watch. |
| `vitest` | `4.1.10` | Unit + integration runner. |
| `@vitest/coverage-v8` | `4.1.10` | Native V8 coverage; 80% gate. |
| `@vitest/ui` | `4.1.10` | Local watch UI. |
| `mongodb-memory-server` | `11.2.0` | In-memory Mongo (replica set) per test run. |
| `supertest` | `7.2.2` | HTTP assertions against Fastify. |
| `@types/supertest` | `7.2.1` | |
| `@types/node` | `24.13.3` | Node 24 type defs — major tracks the runtime major, so this follows `.nvmrc`, not npm's `latest`. |
| `pino-pretty` | `13.1.3` | Local-dev log formatter. |
| `eslint` | `10.8.0` | Flat config. |
| `prettier` | `3.9.6` | Formatter. |
| `ioredis-mock` | `8.13.1` | In-process Redis for tests. |
| `aws-sdk-client-mock` | `4.1.0` | Stub S3 client; assert Put/Delete. |

## Frontend dependencies
| Package | Version | Why |
|---|---|---|
| `svelte` | `5.56.8` | Svelte 5 runes. |
| `vite` | `8.1.5` | Bundler + dev server. |
| `@sveltejs/vite-plugin-svelte` | `7.2.0` | Svelte 5 + Vite 8. |
| `svelte-spa-router` | `5.1.1` | Hash routing. |
| `leaflet` | `1.9.4` | Map. |
| `@types/leaflet` | `1.9.21` | |

## Frontend devDependencies
| Package | Version | Why |
|---|---|---|
| `vitest` | `4.1.10` | Component tests. |
| `@vitest/coverage-v8` | `4.1.10` | |
| `@testing-library/svelte` | `5.4.2` | Svelte 5 compatible. |
| `@testing-library/jest-dom` | `7.0.0` | DOM matchers. |
| `@testing-library/dom` | `10.4.1` | Required *direct* peer of jest-dom 7 (`>=10 <11`); was transitive before. |
| `@testing-library/user-event` | `14.6.1` | |
| `jsdom` | `30.0.1` | DOM env. Needs Node `^22.22.2 \|\| ^24.15.0 \|\| >=26`. |
| `svelte-check` | `4.7.4` | Type-check `.svelte`. |
| `@playwright/test` | `1.62.0` | E2E. |

## Image runtime libs (apt in Dockerfile)
**None.** sharp's prebuilt binary statically bundles its own libvips — including
the HEIF/HEVC decoder (libheif + libde265) and WebP — under `node_modules/@img`.
The system `libvips42` was therefore never loaded and only dragged in heavy
transitive deps (imagemagick, poppler, librsvg, …), so the runtime stage installs
no image libraries. HEIF decode is re-verified by the container smoke test —
`docker/smoke.mjs`, run inside the built image by `.github/workflows/image.yml`
on every PR that touches the Dockerfile, `.nvmrc` or a manifest.

## Deliberately rejected
- **Alpine base image** — sharp's prebuilt `@img` binaries are glibc-built (musl
  needs separate variants) and argon2 compiles cleanly against glibc; bookworm-slim
  keeps the native toolchain simple.
- **Drag-and-drop block reorder** — ▲/▼ only (target picture).
- **i18n framework** — German-only, inline strings.
- **Vitest workspace file** — removed in Vitest 4; we use root `vitest.config.ts`
  `test.projects` instead.

## Lint / format toolchain
`@eslint/js` `10.0.1`, `eslint` `10.8.0`, `typescript-eslint` `8.65.0`,
`eslint-plugin-svelte` `3.22.0`, `globals` `17.8.0`, `prettier` `3.9.6`,
`prettier-plugin-svelte` `4.1.1`.

No `legacy-peer-deps` / overrides needed — peers resolve cleanly. ESLint 10
support arrived in `typescript-eslint` 8.58.0 and `eslint-plugin-svelte` 3.15.0;
anything older crashes on ESLint 10 (`class extends ESLint.FlatESLint`, removed
in v10), so those are the real floors.

`eslint.config.js` ignores `design/` and `tools/`. Neither is tracked, so CI
never sees them, but locally they made `npm run lint` fail on files that are not
part of the repo.

## TypeScript 7 blocked
`typescript` stays on **`6.0.3`**. 7.0.2 clears the age gate, but two peers
exclude it:
- `typescript-eslint` 8.65.0 — and the newest 8.67.0 — declare `typescript:
  ">=4.8.4 <6.1.0"`.
- `svelte-check` 4.7.4 declares `typescript: "^5.0.0 || ^6.0.0"`.

This is an ecosystem wait, not a migration effort. Re-check when
`typescript-eslint` widens its range.

## Advisories cleared on 2026-08-13
`npm audit` had 12 open (1 low, 1 moderate, 10 high). All fixed; audit is clean.

| Package | Bump | Advisory |
|---|---|---|
| `sharp` | 0.34.5 → 0.35.3 | 4 inherited libvips CVEs (high) |
| `@fastify/static` | 9.1.3 → 10.1.2 | auth bypass via non-canonical paths, route-guard bypass via traversal (high) |
| `nanoid` | 5.1.11 → 5.1.16 | 3 non-secure-generator DoS advisories (high) |
| `vite` | 8.0.12 → 8.1.5 | launch-editor NTLMv2 hash disclosure, `server.fs.deny` bypass (high) |
| `mongoose` | 9.6.2 → 9.8.1 | prototype pollution via `__proto__` dotted path (moderate) |

Transitive-only, fixed by `npm audit fix` with no direct dependency: `undici`,
`brace-expansion`, `esbuild`, `fast-uri`, `find-my-way`, `form-data`.

### Held back
| Package | At | Why not newer |
|---|---|---|
| `ioredis` | 5.11.1 | 6.0.0 was 12 days old — under the gate |
| `@fastify/sensible` | 6.0.4 | only newer release (6.0.5) is 4 days old |
| `@testing-library/user-event` | 14.6.1 | only newer release (14.6.4) is 1 day old |
| `@types/leaflet` | 1.9.21 | only newer release (1.9.22) is 12 days old |
| `typescript` | 6.0.3 | peer-blocked, see above |
