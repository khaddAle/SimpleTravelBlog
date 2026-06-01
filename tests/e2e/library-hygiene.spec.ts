import { test, expect } from '@playwright/test';
import {
  login,
  gotoNewPost,
  openInserterMenu,
  fillMetadata,
  addImageBlockByUpload,
  makeJpegUpload,
  publish,
  uniqueTitle,
  uniqueFilename,
} from './helpers.js';

test('an unused upload is listed under "Nur unbenutzte" and can be deleted', async ({ page }) => {
  const file = await makeJpegUpload(uniqueFilename('verwaist'));

  await login(page);
  await gotoNewPost(page);

  // Upload into the picker, then cancel — the image is persisted but unreferenced.
  await openInserterMenu(page);
  await page.getByRole('button', { name: 'Bild', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Bildauswahl' });
  await dialog.getByLabel('Hochladen').setInputFiles(file);
  await expect(dialog.getByRole('button', { name: file.name })).toBeVisible({ timeout: 30_000 });
  await dialog.getByRole('button', { name: 'Abbrechen' }).click();

  // Library: filter to orphans, the upload is there, delete it.
  await page.getByRole('link', { name: 'Bilder' }).click();
  await expect(page.getByRole('heading', { name: 'Bildbibliothek' })).toBeVisible();
  // `exact` so the segmented filter button isn't confused with the per-image
  // "<verwaist-…> löschen" buttons (role-name matching is substring + cased).
  await page.getByRole('button', { name: 'Verwaist', exact: true }).click();
  await expect(page.getByText(file.name)).toBeVisible();

  await page.getByRole('button', { name: `${file.name} löschen` }).click();
  await expect(page.getByText(file.name)).toHaveCount(0);
});

test('deleting a referenced image is refused with the referencing post', async ({ page }) => {
  const title = uniqueTitle('Mit Bild');
  const file = uniqueFilename('inbenutzung');

  await login(page);
  await gotoNewPost(page);
  await fillMetadata(page, { title, country: 'FR', place: 'Nizza' });
  await addImageBlockByUpload(page, file);
  await publish(page);

  await page.getByRole('link', { name: 'Bilder' }).click();
  await expect(page.getByRole('heading', { name: 'Bildbibliothek' })).toBeVisible();

  await page.getByRole('button', { name: `${file} löschen` }).click();

  const blocked = page.getByRole('alert');
  await expect(blocked).toContainText('wird noch verwendet in:');
  await expect(blocked.getByRole('link', { name: title })).toBeVisible();
  // The image is still present (delete was refused).
  await expect(page.getByText(file, { exact: true })).toBeVisible();
});
