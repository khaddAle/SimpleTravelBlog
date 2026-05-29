# SimpleTravelBlog conventions

## Folders
- packages/backend  Fastify API + image pipeline
- packages/frontend Svelte 5 SPA
- packages/shared   Block types, API DTOs, zod schemas
- docs/             target-picture, stack, testing, architecture (mermaid)
- tests/e2e/        Playwright

## Conventions
- Node 22 (.nvmrc), strict TS, ESM only ("type": "module").
- npm installs: ALWAYS --save-exact --ignore-scripts. No ^/~. No lifecycle scripts.
- TDD: tests first, watch them fail, implement to green, refactor. 80% coverage gate (CI enforced).
- Unit tests co-located as *.test.ts; integration in packages/<x>/tests/integration; e2e in tests/e2e.
- Single Docker image; linux/arm64 only.
- No drag-and-drop block reorder; ▲/▼ only.
- German-only UI strings; inline, no i18n framework.

## Related repos
- the platform repo — Mongo/MinIO/Redis/cloudflared/Argo CD platform.
- an example workload repo   — example business-workload pattern (per-env namespaces).
- the cluster bootstrap repo          — Ansible bootstrap + Argo CD root app-of-apps.
- the private deployment repo (private) — this app's deploy manifests.

## Output rules
- No `any`. `unknown` only at JSON parse boundaries with immediate zod validation.
- Commit messages: type(scope): subject. Types: test, feat, fix, refactor, chore, docs, ci.
