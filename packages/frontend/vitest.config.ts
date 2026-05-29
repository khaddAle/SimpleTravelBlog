import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';

export default defineConfig({
  // `svelteTesting` adds the `browser` resolve condition (so components mount via
  // the client build, not Svelte's SSR entry) and registers auto-cleanup.
  plugins: [svelte(), svelteTesting()],
  resolve: {
    alias: {
      '@stb/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)),
    },
  },
  test: {
    name: 'frontend',
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test-setup.ts'],
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,svelte}'],
      exclude: [
        // Bootstrap / composition glue (mirrors the backend's server.ts exclusion).
        'src/main.ts',
        'src/App.svelte',
        'src/test-setup.ts',
        'src/router.ts',
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
