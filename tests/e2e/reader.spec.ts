import { test, expect } from '@playwright/test';
import { login, gotoNewPost, fillMetadata, addParagraph, publish, uniqueTitle } from './helpers.js';

test('reader can browse landing, archive, map, search to a published post', async ({ page }) => {
  const title = uniqueTitle('Inselreise');
  const keyword = 'Vulkanwanderung';

  // Arrange: publish a post with a distinctive searchable word.
  await login(page);
  await gotoNewPost(page);
  await fillMetadata(page, { title, country: 'IT', place: 'Stromboli' });
  await addParagraph(page, `Eine ${keyword} ueber heisse Lavafelder.`);
  await publish(page);

  // Landing: hero + reader navigation.
  await page.goto('/#/');
  await expect(page.getByRole('heading', { level: 1, name: 'Reiseblog' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Alle Beiträge' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Karte' })).toBeVisible();

  // Archive: grouped by country; our post appears under its country.
  await page.goto('/#/archiv');
  await expect(page.getByRole('heading', { name: 'Alle Beiträge' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'IT', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: new RegExp(title) })).toBeVisible();

  // Map: the post is listed in the places index.
  await page.goto('/#/karte');
  await expect(page.getByRole('heading', { name: 'Karte' })).toBeVisible();
  await expect(page.getByRole('link', { name: new RegExp(title) })).toBeVisible();

  // Search: the distinctive keyword finds the post; clicking opens it.
  await page.goto('/#/suche');
  await page.getByLabel('Suchbegriff').fill(keyword);
  await page.getByRole('button', { name: 'Suchen' }).click();
  const hit = page.getByRole('link', { name: new RegExp(title) });
  await expect(hit).toBeVisible();
  await hit.click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
});

test('an unknown post slug shows the not-found message', async ({ page }) => {
  await page.goto('/#/beitrag/zzzzzz');
  await expect(page.getByRole('alert')).toHaveText('Beitrag nicht gefunden.');
});
