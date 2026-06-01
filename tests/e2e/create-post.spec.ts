import { test, expect } from '@playwright/test';
import { login, gotoNewPost, fillMetadata, addParagraph, publish, uniqueTitle } from './helpers.js';

test('create → publish → reader sees the post', async ({ page }) => {
  const title = uniqueTitle('Wanderung');
  const body = 'Wir liefen durch die Berge und Taeler bei Sonnenschein.';

  await login(page);
  await gotoNewPost(page);

  await fillMetadata(page, { title, country: 'DE', place: 'Garmisch' });
  await addParagraph(page, body);
  await publish(page);

  // It shows up in the admin list as published.
  const row = page.getByRole('row', { name: new RegExp(title) });
  await expect(row).toContainText('Veröffentlicht');

  // The anonymous reader sees it on the landing page and can open it.
  await page.goto('/#/');
  await page.getByRole('link', { name: new RegExp(title) }).click();
  await expect(page).toHaveURL(/#\/beitrag\//);
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await expect(page.getByText(body)).toBeVisible();
  await expect(page.getByText('Garmisch, Deutschland')).toBeVisible();
});

test('an unpublished draft is hidden from the reader', async ({ page }) => {
  const title = uniqueTitle('Geheimer Entwurf');

  await login(page);
  await gotoNewPost(page);
  await fillMetadata(page, { title });
  await addParagraph(page, 'Noch nicht fertig.');
  await page.getByRole('button', { name: 'Entwurf speichern' }).click();
  await expect(page).toHaveURL(/#\/admin$/);

  await expect(page.getByRole('row', { name: new RegExp(title) })).toContainText('Entwurf');

  // Not present in the public archive.
  await page.goto('/#/archiv');
  await expect(page.getByRole('heading', { name: 'Nach Ländern & Reisen' })).toBeVisible();
  await expect(page.getByRole('link', { name: new RegExp(title) })).toHaveCount(0);
});
