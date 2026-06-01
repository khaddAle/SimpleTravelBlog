import { test, expect } from '@playwright/test';
import {
  login,
  gotoNewPost,
  fillMetadata,
  addImageBlockByUpload,
  publish,
  uniqueTitle,
  uniqueFilename,
} from './helpers.js';

test('upload an image through the picker and publish a post with it', async ({ page }) => {
  const title = uniqueTitle('Bildbeitrag');

  await login(page);
  await gotoNewPost(page);
  await fillMetadata(page, { title, country: 'IT', place: 'Rom' });

  // Upload via the SSE pipeline; helper waits for completion + confirms select.
  await addImageBlockByUpload(page, uniqueFilename('strand'));

  // The image block is now in the editor (its caption field is present).
  await expect(page.getByLabel('Bildunterschrift')).toBeVisible();

  await publish(page);

  // Reader: the post renders and its image variant is fetchable from storage.
  await page.goto('/#/archiv');
  await page.getByRole('link', { name: new RegExp(title) }).first().click();
  await expect(page).toHaveURL(/#\/beitrag\//);
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();

  const img = page.locator('main.article img').first();
  await expect(img).toBeVisible();
  const src = await img.getAttribute('src');
  expect(src).toContain('/api/public/images/');
  const res = await page.request.get(src!);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('image/webp');
});
