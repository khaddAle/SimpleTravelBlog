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

## Running tests locally
```bash
npm test                 # whole monorepo (vitest run, all projects)
npm test -- --coverage   # with the 80% gate
npm test -- packages/backend/src/lib/shortId.test.ts   # one file
npm run test:watch       # watch mode
```
E2E (Phase 7+):
```bash
npm -w @stb/frontend exec playwright install --with-deps
npx playwright test                                    # from tests/e2e
```
