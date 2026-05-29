# Stack & version pins

All versions are pinned **exactly** (`--save-exact`, no `^`/`~`) and were
snapshotted on **2026-05-27**, then cross-checked against a **14-day publish-age
threshold** (see `.claude/skills/npm-safe-install/SKILL.md`). Versions published
in the prior 14 days fell back to the newest same-major version ≥ 14 days old;
those are flagged **[fallback]** with the rejected "latest" in parentheses.

> Re-run the publish-age check for **every** pin if this plan has sat idle — a
> version that was safe on 2026-05-27 says nothing about a release pushed since.

## Runtime
| | Version | Notes |
|---|---|---|
| Node | `22.22.3` (Jod LTS) | ARM64 native. Pinned in `.nvmrc`, Docker base, CI setup-node. |
| Base image | `node:22.22.3-bookworm-slim` (linux/arm64) | glibc base for sharp's prebuilt `@img` binaries + argon2. sharp bundles its own libvips (incl. HEIF), so no image libs are apt-installed. Alpine (musl) rejected. |

## Backend dependencies
| Package | Version | Why |
|---|---|---|
| `fastify` | `5.8.5` | HTTP server, schema validation, pino logger. |
| `@fastify/static` | `9.1.3` | Serve built SPA assets. |
| `@fastify/multipart` | `10.0.0` | Image upload handling. |
| `@fastify/cookie` | `11.0.2` | Session + CSRF cookies. |
| `@fastify/csrf-protection` | `7.1.0` | Double-submit CSRF tokens. |
| `@fastify/rate-limit` | `10.3.0` | Login rate limit (Redis-backed). |
| `@fastify/sensible` | `6.0.4` | `httpErrors.unauthorized()` etc. |
| `mongoose` | `9.6.2` **[fallback]** (latest `9.6.3`) | ODM. |
| `ioredis` | `5.10.1` **[fallback]** (latest `5.11.0`) | Sentinel-aware Redis client. |
| `argon2` | `0.44.0` | argon2id password hashing. |
| `@aws-sdk/client-s3` | `3.1045.0` **[fallback]** (latest `3.1055.0`) | MinIO/S3 client. |
| `sharp` | `0.34.5` | Image transcode (libvips + libheif). |
| `heic-convert` | `2.1.0` | HEIC fallback if sharp libheif unavailable. |
| `nanoid` | `5.1.11` | 6-char post/trip shortIds. |
| `pino` | `10.3.1` | Structured JSON logs to stdout. |
| `zod` | `4.4.3` | Env-var schema + API request validation. |
| `cheerio` | `1.2.0` | WP HTML → block parsing in importer. |
| `cookie-signature` | `1.2.2` | Cookie signing (`SESSION_COOKIE_SECRET`). |
| `p-limit` | `7.3.0` | Concurrency cap for importer media re-uploads. |
| `dotenv` | `17.4.2` | Local-dev env loading; ignored in container. |

## Backend devDependencies
| Package | Version | Why |
|---|---|---|
| `typescript` | `6.0.3` | Strict mode + ESM. |
| `tsx` | `4.21.0` **[fallback]** (latest `4.22.3`) | `npm run dev` watch. |
| `vitest` | `4.1.6` **[fallback]** (latest `4.1.7`) | Unit + integration runner. |
| `@vitest/coverage-v8` | `4.1.6` **[fallback]** | Native V8 coverage; 80% gate. |
| `@vitest/ui` | `4.1.6` **[fallback]** | Local watch UI. |
| `mongodb-memory-server` | `11.1.0` | In-memory Mongo (replica set) per test run. |
| `supertest` | `7.2.2` | HTTP assertions against Fastify. |
| `@types/supertest` | `7.2.0` | |
| `@types/node` | `25.7.0` **[fallback]** (latest `25.9.1`) | Node 22 type defs. |
| `pino-pretty` | `13.1.3` | Local-dev log formatter. |
| `eslint` | `10.3.0` **[fallback]** (latest `10.4.0`) | Flat config. |
| `prettier` | `3.8.3` | Formatter. |
| `ioredis-mock` | `8.13.1` | In-process Redis for tests. |
| `aws-sdk-client-mock` | `4.1.0` | Stub S3 client; assert Put/Delete. |

## Frontend dependencies
| Package | Version | Why |
|---|---|---|
| `svelte` | `5.55.7` (security bump from planned `5.55.5`; see below) | Svelte 5 runes. |
| `vite` | `8.0.12` **[fallback]** (latest `8.0.14`) | Bundler + dev server. |
| `@sveltejs/vite-plugin-svelte` | `7.1.2` | Svelte 5 + Vite 8. |
| `svelte-spa-router` | `5.1.0` | Hash routing. |
| `leaflet` | `1.9.4` | Map. |
| `@types/leaflet` | `1.9.21` | |

## Frontend devDependencies
| Package | Version | Why |
|---|---|---|
| `vitest` | `4.1.6` **[fallback]** | Component tests. |
| `@vitest/coverage-v8` | `4.1.6` **[fallback]** | |
| `@testing-library/svelte` | `5.3.1` | Svelte 5 compatible. |
| `@testing-library/jest-dom` | `6.9.1` | DOM matchers. |
| `@testing-library/user-event` | `14.6.1` | |
| `jsdom` | `29.1.1` | DOM env. |
| `svelte-check` | `4.4.8` | Type-check `.svelte`. |
| `@playwright/test` | `1.60.0` | E2E. |

## Image runtime libs (apt in Dockerfile)
**None.** sharp's prebuilt binary statically bundles its own libvips — including
the HEIF/HEVC decoder (libheif + libde265) and WebP — under `node_modules/@img`.
The system `libvips42` was therefore never loaded and only dragged in heavy
transitive deps (imagemagick, poppler, librsvg, …), so the runtime stage installs
no image libraries. HEIF decode is re-verified by the container smoke test.

## Deliberately rejected
- **Alpine base image** — sharp's prebuilt `@img` binaries are glibc-built (musl
  needs separate variants) and argon2 compiles cleanly against glibc; bookworm-slim
  keeps the native toolchain simple.
- **Drag-and-drop block reorder** — ▲/▼ only (target picture).
- **i18n framework** — German-only, inline strings.
- **Vitest workspace file** — removed in Vitest 4; we use root `vitest.config.ts`
  `test.projects` instead.

## ESLint 10 + TypeScript 6 — resolved with no compromise
Both plan pins are kept: **TypeScript `6.0.3`** and **ESLint `10.3.0`**.

The plan's stack table omitted an ESLint TS/Svelte parser. The first versions I
tried (`typescript-eslint` 8.48.0, `eslint-plugin-svelte` 3.13.0) predate ESLint
10 / TS 6 support and crash on ESLint 10 (`class extends ESLint.FlatESLint` —
removed in v10). Per registry + upstream:
- `typescript-eslint` added **TypeScript 6** support in **8.58.0** and **ESLint
  10** support in the same line (`eslint: ^8.57 || ^9 || ^10`, `typescript:
  <6.1.0`). Pinned **8.59.0** (2026-04-20, 39d old; 8.60.0 was 4d old → too new).
- `eslint-plugin-svelte` added **ESLint 10** support in **3.15.0**. Pinned
  **3.17.0** (2026-04-02, 57d old; 3.18.0 was 2d old → too new).

No `legacy-peer-deps` / overrides needed — peers resolve cleanly.

Added lint/format deps (not in the original plan table; vetted with the 14-day
age check): `@eslint/js` `10.0.1`, `typescript-eslint` `8.59.0`,
`eslint-plugin-svelte` `3.17.0`, `globals` `16.5.0`, `prettier-plugin-svelte`
`3.5.0`.

## Security bump — svelte 5.55.5 → 5.55.7
GHSA advisories (SSR XSS via spread/Promise serialization, DOM-clobbering XSS,
`<svelte:element>` ReDoS) affect svelte ≤ 5.55.6. We render client-only (no SSR),
so the SSR items don't apply, but **5.55.7** (2026-05-14, 15d old) is the first
fixed release and also clears the 14-day bar — strictly better than the planned
fallback 5.55.5 (chosen before these CVEs were disclosed). `npm audit`: 0
vulnerabilities.
