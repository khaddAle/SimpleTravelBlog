import { test, expect } from '@playwright/test';
import {
  login,
  gotoNewPost,
  openInserterMenu,
  makeJpegUpload,
  uniqueFilename,
} from './helpers.js';

test('the picker previews an image in full without changing the selection', async ({ page }) => {
  const file = await makeJpegUpload(uniqueFilename('vorschau'));

  await login(page);
  await gotoNewPost(page);

  // Upload a fresh JPEG into the picker; it gets pre-selected on completion.
  await openInserterMenu(page);
  await page.getByRole('button', { name: 'Bild', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Bildauswahl' });
  await expect(picker).toBeVisible();
  await picker.getByLabel('Hochladen').setInputFiles(file);
  await expect(picker.getByRole('button', { name: file.name, exact: true })).toBeVisible({
    timeout: 30_000,
  });

  // Open the full-image preview via the magnifier.
  await picker.getByRole('button', { name: `${file.name} in voller Größe anzeigen` }).click();
  const lightbox = page.getByRole('dialog', { name: 'Galerie' });
  await expect(lightbox).toBeVisible();
  await expect(lightbox.locator('img').first()).toHaveAttribute('src', /\/display$/);

  // Escape closes the preview but leaves the picker open and the selection intact.
  await page.keyboard.press('Escape');
  await expect(lightbox).toBeHidden();
  await expect(picker).toBeVisible();

  // The upload stays pre-selected, so confirming still works.
  await picker.getByRole('button', { name: 'Auswählen' }).click();
  await expect(picker).toBeHidden();
});

test('the library previews an image in full', async ({ page }) => {
  const file = await makeJpegUpload(uniqueFilename('biblio'));

  await login(page);
  await gotoNewPost(page);

  // Upload into the picker, then cancel — the image is persisted in the library.
  await openInserterMenu(page);
  await page.getByRole('button', { name: 'Bild', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Bildauswahl' });
  await picker.getByLabel('Hochladen').setInputFiles(file);
  await expect(picker.getByRole('button', { name: file.name, exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await picker.getByRole('button', { name: 'Abbrechen' }).click();

  // Go to the library and open the card's full-image preview.
  await page.getByRole('link', { name: 'Bilder' }).click();
  await expect(page.getByRole('heading', { name: 'Bildbibliothek' })).toBeVisible();
  await page.getByRole('button', { name: `${file.name} in voller Größe anzeigen` }).click();

  const lightbox = page.getByRole('dialog', { name: 'Galerie' });
  await expect(lightbox).toBeVisible();
  await expect(lightbox.locator('img').first()).toHaveAttribute('src', /\/display$/);

  await page.keyboard.press('Escape');
  await expect(lightbox).toBeHidden();
});
