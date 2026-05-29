# Testing & TDD discipline

Strict TDD is mandatory. Production code is never written before a failing test
exists. The loop is also codified as the `tdd-loop` skill (`.claude/skills/`).

## RED → GREEN → REFACTOR
1. **RED** — write the smallest test that describes the next behavior. Run it,
   confirm it fails **for the right reason** (assertion, not an import error).
   Commit `test(scope): describe X`.
2. **GREEN** — write the minimum code to pass. Confirm green. Commit
   `feat(scope): implement X`.
3. **REFACTOR** — improve structure with tests green. Commit
   `refactor(scope): ...` if anything changed.

## Coverage gate
80% on **lines, branches, functions, statements**. Enforced per package in each
`vitest.config.ts`; CI fails below threshold.

Documented exclusions (bootstrap / glue, not meaningfully unit-testable):
- `src/server.ts` (plugin/route composition)
- `src/bootstrap/**` (first-run admin, bucket ensure)
- `src/index.ts` (glue / re-exports)
- `src/importer/cli.ts` (entrypoint)
- generated / vendored code, `**/*.d.ts`

## The testing pyramid
| Layer | Tools | Location |
|---|---|---|
| Unit | vitest (node) | co-located `*.test.ts` |
| Integration | vitest + `mongodb-memory-server` + `ioredis-mock` + `aws-sdk-client-mock` + `supertest` | `packages/backend/tests/integration/*.int.test.ts` |
| Component | vitest + `@testing-library/svelte` + jsdom | co-located `*.test.ts` |
| E2E | Playwright | `tests/e2e/*.spec.ts` |

## Test infra decisions
- **Mongo**: `MongoMemoryReplSet` (a replica set, not standalone) — required for
  `$text` indexes and transactions. Started once in
  `packages/backend/tests/setup.ts`, torn down after the run.
- **Redis**: `ioredis-mock` (in-process) for unit + integration speed. No real
  Redis container in CI.
- **S3/MinIO**: `aws-sdk-client-mock` stubs the S3 client; tests assert
  `PutObject` / `DeleteObject` parameters.
- **Fixtures**: `packages/backend/tests/fixtures/` holds a GPS-tagged JPEG, a
  PNG, a HEIC, and the WordPress JSON corpus (`wp-posts.json`, `wp-media.json`).
- **Frontend components**: the `svelteTesting()` Vite plugin (in
  `packages/frontend/vitest.config.ts`) adds the `browser` resolve condition so
  components mount via the client build, plus auto-cleanup. `fetch` is stubbed
  with `vi.stubGlobal`; `leaflet` is `vi.mock`-ed (no real map in jsdom); the
  upload SSE stream is driven through an injectable `EventSourceFactory`.
  Bootstrap/glue (`main.ts`, `App.svelte`, `router.ts`) is excluded from
  coverage, mirroring the backend's `server.ts` exclusion.
- **E2E harness**: `packages/backend/tests/e2e-harness.ts` boots the *real*
  Fastify app against hermetic, in-process backing services so Playwright needs
  no external infrastructure — an in-memory `MongoMemoryReplSet`, `ioredis-mock`,
  the integration-test in-memory `ObjectStorage`, and the built
  `packages/frontend/dist` served via `@fastify/static` (with an index.html
  fallback for hash routes). One admin user is seeded. It is launched by
  Playwright's `webServer` block via `tsx` and is distinct from the production
  entrypoint (`src/server.ts`), which talks to real Mongo/Redis/MinIO. E2E specs
  generate their own image fixtures (sharp) and use unique titles/filenames so
  reruns and a reused dev server never collide.

## Running tests locally
```bash
npm test                 # whole monorepo (vitest run, all projects)
npm test -- --coverage   # with the 80% gate
npm test -- packages/backend/src/lib/shortId.test.ts   # one file
npm run test:watch       # watch mode
```
E2E (Playwright):
```bash
npm run build            # build @stb/shared + @stb/frontend (harness serves dist)
npx playwright install chromium   # one-time browser download
npm run test:e2e         # boots the harness via webServer, runs all specs
```
`npm run e2e:server` starts just the harness (port 4000) for manual poking. CI
runs E2E nightly + on demand via `.github/workflows/e2e.yml`, not on every PR.
