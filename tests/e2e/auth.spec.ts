import { test, expect } from '@playwright/test';
import { ADMIN, login } from './helpers.js';

test.describe('authentication', () => {
  test('bootstrap admin can log in and reach the admin area', async ({ page }) => {
    await login(page);
    await expect(page.getByRole('link', { name: 'Nutzer' })).toBeVisible();
  });

  test('wrong password shows a German error and stays on login', async ({ page }) => {
    await page.goto('/#/login');
    await page.getByLabel('Benutzername').fill(ADMIN.username);
    await page.getByLabel('Passwort').fill('definitely-wrong');
    await page.getByRole('button', { name: 'Anmelden' }).click();
    await expect(page.getByRole('alert')).toHaveText('Anmeldung fehlgeschlagen.');
    await expect(page).toHaveURL(/#\/login$/);
  });

  test('a logged-out visitor hitting /admin is redirected to login', async ({ page }) => {
    await page.goto('/#/admin');
    await expect(page).toHaveURL(/#\/login$/);
    await expect(page.getByRole('heading', { name: 'Anmelden' })).toBeVisible();
  });

  test('logout returns to login and re-guards the admin area', async ({ page }) => {
    await login(page);
    await page.getByRole('button', { name: 'Abmelden' }).click();
    await expect(page).toHaveURL(/#\/login$/);

    await page.goto('/#/admin');
    await expect(page).toHaveURL(/#\/login$/);
  });
});
