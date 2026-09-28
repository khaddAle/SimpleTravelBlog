import { test, expect } from '@playwright/test';
import {
  login,
  gotoNewPost,
  fillMetadata,
  addParagraph,
  publish,
  uniqueTitle,
  makeGpxUpload,
} from './helpers.js';

// Keep the journeys hermetic: no map tiles from the internet.
test.beforeEach(async ({ page }) => {
  await page.route(/tile\.(opentopomap|openstreetmap)\.org/, (route) => route.abort());
});

test('a post with a GPS track: reader sees map and stats, opens the replay', async ({ page }) => {
  const title = uniqueTitle('Uferweg');

  await login(page);
  await gotoNewPost(page);
  await fillMetadata(page, { title, country: 'NO', place: 'Skjervøy' });
  await addParagraph(page, 'Eine kurze Runde am Wasser.');

  const panel = page.getByRole('region', { name: 'GPS-Tracks' });
  await panel.getByLabel('GPX hochladen').setInputFiles(makeGpxUpload('uferweg.gpx'));
  // 360 points × ~11 m: the track shows up with its distance.
  await expect(panel.getByText('Uferweg')).toBeVisible();
  await expect(panel.getByText('4,0 km', { exact: false })).toBeVisible();
  await panel.getByLabel('Bezeichnung').fill('Anna');
  await publish(page);

  await page.goto('/#/');
  await page.getByRole('link', { name: new RegExp(title) }).click();
  await expect(page).toHaveURL(/#\/beitrag\//);

  const block = page.getByRole('region', { name: 'GPS-Track' });
  await expect(block).toBeVisible();
  await expect(block.getByText('4,0 km')).toBeVisible();
  await expect(block.locator('svg.profile path')).toHaveCount(1);

  await block.getByRole('button', { name: 'Vergrößern', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'GPS-Track' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(title)).toBeVisible();
  const clock = dialog.locator('.tm-clock');
  const start = await clock.textContent();

  await dialog.getByRole('button', { name: 'Abspielen' }).click();
  await expect(dialog.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect(clock).not.toHaveText(start ?? '');
  await dialog.getByRole('button', { name: 'Pause' }).click();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('a GPX file without timestamps is rejected with a German message', async ({ page }) => {
  await login(page);
  await gotoNewPost(page);
  const panel = page.getByRole('region', { name: 'GPS-Tracks' });
  await panel
    .getByLabel('GPX hochladen')
    .setInputFiles(makeGpxUpload('ohne-zeit.gpx', { withTime: false }));
  await expect(panel.getByRole('alert')).toHaveText('GPX ohne Zeitstempel wird nicht unterstützt');
});
