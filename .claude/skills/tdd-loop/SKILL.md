---
name: tdd-loop
description: >
  Drive every behavior change in SimpleTravelBlog through a strict
  RED → GREEN → REFACTOR loop. TRIGGER when the user asks to implement a
  feature, add an endpoint, add a component, fix a bug, or otherwise change
  observable behavior in packages/backend, packages/frontend, or packages/shared.
disable-model-invocation: false
---

# TDD loop for SimpleTravelBlog

Strict test-driven development is a hard requirement in this repo (see CLAUDE.md
and docs/testing.md). Never write production code before a failing test exists.

## The loop

### 1. RED — write the smallest failing test
1. Read the existing tests near the area you are about to touch so the new test
   matches local conventions (file layout, helpers, fixtures).
2. Write the **smallest** test that describes the next slice of behavior.
   - Unit logic → co-located `*.test.ts` next to the module.
   - Route/integration → `packages/backend/tests/integration/*.int.test.ts`.
   - Svelte component → co-located `*.test.ts`.
3. Run the focused test and confirm it **fails for the right reason** — an
   assertion failure, not an import/typo/compile error.
   ```
   npm test -- <path-to-test>
   ```
4. Commit: `test(scope): describe X`.

### 2. GREEN — minimum code to pass
1. Implement only enough to make the failing test pass. No speculative extras.
2. Run the test; confirm green. Then run the package suite to confirm no
   regressions.
3. Commit: `feat(scope): implement X` (or `fix(scope): ...`).

### 3. REFACTOR — improve with tests green
1. Improve names/structure/duplication while tests stay green.
2. Re-run the suite.
3. Commit `refactor(scope): ...` only if something actually changed.

## Guardrails
- 80% coverage gate (lines/branches/functions/statements) is CI-enforced.
  Run `npm test -- --coverage` before pushing.
- No `any`. `unknown` is allowed only at JSON parse boundaries, validated
  immediately with a zod schema from `packages/shared`.
- npm installs always use `--save-exact --ignore-scripts` (see
  `npm-safe-install` skill).
- Reorder UI uses ▲/▼ only — never add drag-and-drop. UI strings are German.

## Commit message types
`test`, `feat`, `fix`, `refactor`, `chore`, `docs`, `ci` — `type(scope): subject`.
