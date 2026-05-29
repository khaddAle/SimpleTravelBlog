import { test, expect } from '@playwright/test';

// Trivial Phase 1 placeholder so the Playwright harness is exercisable before
// the app exists. Replaced by real journeys in Phase 7 (auth, create-post,
// image-upload, reader, library-hygiene).
test('playwright harness renders a page', async ({ page }) => {
  await page.setContent('<main><h1>Reiseblog</h1></main>');
  await expect(page.getByRole('heading', { name: 'Reiseblog' })).toBeVisible();
});
