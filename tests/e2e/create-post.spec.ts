import { test, expect } from '@playwright/test';
import {
  login,
  gotoNewPost,
  fillMetadata,
  addParagraph,
  addImageBlockByUpload,
  splitParagraphAt,
  publish,
  uniqueTitle,
} from './helpers.js';

test('create → publish → reader sees the post', async ({ page }) => {
  const title = uniqueTitle('Wanderung');
  const body = 'Wir liefen durch die Berge und Taeler bei Sonnenschein.';

  await login(page);
  await gotoNewPost(page);

  await fillMetadata(page, { title, country: 'DE', place: 'Garmisch' });
  await addParagraph(page, body);
  await publish(page);

  // It shows up in the admin list as published.
  const row = page.locator('.post-row').filter({ hasText: title });
  await expect(row).toContainText('Veröffentlicht');

  // The anonymous reader sees it on the landing page and can open it.
  await page.goto('/#/');
  await page.getByRole('link', { name: new RegExp(title) }).click();
  await expect(page).toHaveURL(/#\/beitrag\//);
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await expect(page.getByText(body)).toBeVisible();
  await expect(page.getByText('Garmisch, Deutschland')).toBeVisible();
});

test('split a paragraph, drop an image into the gap, reader sees all three in order', async ({
  page,
}) => {
  const title = uniqueTitle('Gipfeltour');
  const firstHalf = 'Am Morgen brachen wir zur langen Bergwanderung auf.';
  const secondHalf = 'Am Nachmittag erreichten wir endlich den Gipfel.';

  await login(page);
  await gotoNewPost(page);
  await fillMetadata(page, { title, country: 'DE', place: 'Garmisch' });

  // One long paragraph, then split it where the two thoughts meet…
  await addParagraph(page, `${firstHalf} ${secondHalf}`);
  await splitParagraphAt(page, firstHalf.length);

  // …and insert an image into the gap between the two halves (gap 1).
  await addImageBlockByUpload(page, 'gipfel.jpg', 1);
  await publish(page);

  // The reader sees first paragraph, image, second paragraph — in that order.
  await page.goto('/#/');
  await page.getByRole('link', { name: new RegExp(title) }).click();
  await expect(page).toHaveURL(/#\/beitrag\//);

  // `.prose` wraps each paragraph block; `figure` is the image block. (The
  // location eyebrow is a separate `<p>`, so we match block content only.)
  const items = page.locator('main.article :is(.prose, figure)');
  await expect(items).toHaveCount(3);
  await expect(items.nth(0)).toHaveText(firstHalf);
  await expect(items.nth(1).getByRole('button', { name: 'Bild öffnen' })).toBeVisible();
  await expect(items.nth(2)).toHaveText(secondHalf);
});

test('an unpublished draft is hidden from the reader', async ({ page }) => {
  const title = uniqueTitle('Geheimer Entwurf');

  await login(page);
  await gotoNewPost(page);
  await fillMetadata(page, { title });
  await addParagraph(page, 'Noch nicht fertig.');
  // No manual "save" button anymore — autosave persists the new draft and swaps
  // the URL to its edit route. That id-bearing URL is the real "saved" signal:
  // the new-post → edit-route transition re-instantiates the editor, so the
  // transient "Gespeichert" pill never lands in the DOM and can't be awaited.
  // Once persisted the editor is no longer dirty, so the nav must not prompt.
  await expect(page).toHaveURL(/#\/admin\/beitrag\/[a-z0-9]+$/i);
  await page.getByRole('link', { name: 'Beiträge' }).click();
  await expect(page).toHaveURL(/#\/admin$/);

  await expect(page.locator('.post-row').filter({ hasText: title })).toContainText('Entwurf');

  // Not present in the public archive (drafts are hidden).
  await page.goto('/#/archiv');
  await expect(page.getByRole('heading', { level: 1, name: 'Alle Beiträge' })).toBeVisible();
  await expect(page.getByRole('link', { name: new RegExp(title) })).toHaveCount(0);
});
