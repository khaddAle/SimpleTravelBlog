import { defineConfig, devices } from '@playwright/test';

/**
 * E2E config. The `webServer` block (commented until the app is wired in
 * Phase 7) will boot the built app + a docker-compose of Mongo/MinIO/Redis.
 * E2E runs in a dedicated nightly/manual workflow, not the per-PR `ci` gate.
 */
export default defineConfig({
  testDir: '.',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4000',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // webServer: {
  //   command: 'node ../../packages/backend/dist/server.js',
  //   url: 'http://127.0.0.1:4000/healthz',
  //   reuseExistingServer: !process.env.CI,
  // },
});
