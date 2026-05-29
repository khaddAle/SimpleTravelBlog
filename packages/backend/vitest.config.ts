import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'backend',
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    passWithNoTests: true,
    // Integration suites spin up MongoMemoryReplSet — give them headroom.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        // Bootstrap / glue not meaningfully unit-testable (see docs/testing.md).
        'src/server.ts',
        'src/bootstrap/**',
        'src/index.ts',
        'src/importer/cli.ts',
        '**/*.test.ts',
        '**/*.d.ts',
      ],
      thresholds: {
        lines: 80,
        branches: 80,
        functions: 80,
        statements: 80,
      },
    },
  },
});
