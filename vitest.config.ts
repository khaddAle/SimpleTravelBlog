import { defineConfig } from 'vitest/config';

// Vitest 4 removed the standalone `vitest.workspace.ts` file (deprecated in 3.2).
// The monorepo's projects are declared here via `test.projects` instead. Each
// package keeps its own vitest.config.ts with env + coverage thresholds.
export default defineConfig({
  test: {
    projects: [
      'packages/shared',
      'packages/backend',
      'packages/frontend',
    ],
  },
});
