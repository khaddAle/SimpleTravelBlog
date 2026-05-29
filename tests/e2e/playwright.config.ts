import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const repoRoot = path.resolve(fileURLToPath(import.meta.url), '../../..');
const PORT = Number(process.env.E2E_PORT ?? 4000);
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

/**
 * E2E config. `webServer` boots the hermetic harness
 * (`packages/backend/tests/e2e-harness.ts`) — the real app over in-memory
 * Mongo/Redis/storage, serving the built SPA. Run `npm run build` first so
 * `packages/frontend/dist` exists. E2E runs in a dedicated nightly/manual
 * workflow, not the per-PR `ci` gate.
 */
export default defineConfig({
  testDir: '.',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run e2e:server',
    cwd: repoRoot,
    url: `${baseURL}/healthz`,
    reuseExistingServer: !process.env.CI,
    // First CI run downloads the in-memory mongod binary before listening.
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
