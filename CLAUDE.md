# SimpleTravelBlog conventions

## Folders
- packages/backend  Fastify API + image pipeline
- packages/frontend Svelte 5 SPA
- packages/shared   Block types, API DTOs, zod schemas
- docs/             target-picture, stack, testing, architecture (mermaid)
- tests/e2e/        Playwright

## Conventions
- Node 24 (.nvmrc), strict TS, ESM only ("type": "module").
- npm installs: ALWAYS --save-exact --ignore-scripts. No ^/~. No lifecycle scripts.
- TDD: tests first, watch them fail, implement to green, refactor. 80% coverage gate (CI enforced).
- Unit tests co-located as *.test.ts; integration in packages/<x>/tests/integration; e2e in tests/e2e.
- Single Docker image; linux/arm64 only.
- No drag-and-drop block reorder; ▲/▼ only.
- German-only UI strings; inline, no i18n framework.

## Deployment
- This repo is the application only. It produces a single linux/arm64 container
  image; on a tagged release CI builds and pushes that image to GHCR.
- Deployment (manifests, ingress/tunnel, secrets, environment wiring) is
  environment-specific and maintained in a separate private repository — out of
  scope here. Keep environment specifics out of this repo and its docs.

## Output rules
- No `any`. `unknown` only at JSON parse boundaries with immediate zod validation.
- Commit messages: type(scope): subject. Types: test, feat, fix, refactor, chore, docs, ci.
