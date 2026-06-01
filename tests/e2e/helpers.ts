import sharp from 'sharp';
import { expect, type Page } from '@playwright/test';

/** Credentials seeded by the E2E harness (`packages/backend/tests/e2e-harness.ts`). */
export const ADMIN = {
  username: process.env.E2E_ADMIN_USERNAME ?? 'admin',
  password: process.env.E2E_ADMIN_PASSWORD ?? 'admin-password-123',
} as const;

/** Log in through the real login form and land on the admin post list. */
export async function login(page: Page): Promise<void> {
  await page.goto('/#/login');
  await page.getByLabel('Benutzername').fill(ADMIN.username);
  await page.getByLabel('Passwort').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page).toHaveURL(/#\/admin$/);
  await expect(page.getByRole('heading', { name: 'Beiträge' })).toBeVisible();
}

/**
 * Synthesize a small JPEG in-memory for upload journeys (no committed binary).
 * Returns a Playwright `setInputFiles` payload.
 */
export async function makeJpegUpload(
  name = 'strand.jpg',
): Promise<{ name: string; mimeType: string; buffer: Buffer }> {
  const buffer = await sharp({
    create: { width: 240, height: 160, channels: 3, background: '#3477eb' },
  })
    .jpeg()
    .toBuffer();
  return { name, mimeType: 'image/jpeg', buffer };
}

/**
 * A value unique per process so titles/filenames never collide across specs,
 * retries, or a reused dev server.
 */
let counter = 0;
function unique(): string {
  counter += 1;
  return `${process.pid}-${counter}`;
}

export function uniqueTitle(prefix: string): string {
  return `${prefix} ${unique()}`;
}

/** A unique upload filename, e.g. `strand-12345-3.jpg`. */
export function uniqueFilename(stem: string): string {
  return `${stem}-${unique()}.jpg`;
}

/** From the admin post list, open the "new post" editor. */
export async function gotoNewPost(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Neuer Beitrag' }).click();
  // The Fernweh editor opens straight to the block sheet — there is no page
  // heading; the sidebar's publish action is the stable "editor ready" signal.
  await expect(page.getByRole('button', { name: 'Veröffentlichen' })).toBeVisible();
}

/**
 * Open the block inserter menu at the end of the block list. Blocks are added
 * through a per-gap "+" (aria-label "Block einfügen"); the trailing gap appends.
 */
export async function openInserterMenu(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Block einfügen' }).last().click();
}

/** Fill the metadata sidebar's required fields (title/country/place). */
export async function fillMetadata(
  page: Page,
  opts: { title: string; country?: string; place?: string },
): Promise<void> {
  await page.getByLabel('Titel', { exact: true }).fill(opts.title);
  await page.getByLabel('Land', { exact: false }).fill(opts.country ?? 'DE');
  await page.getByLabel('Ortsname').fill(opts.place ?? 'Berlin');
}

/** Append a paragraph block and type its text. */
export async function addParagraph(page: Page, text: string): Promise<void> {
  await openInserterMenu(page);
  await page.getByRole('button', { name: 'Absatz', exact: true }).click();
  await page.getByLabel('Absatz').last().fill(text);
}

/**
 * Open the single-image picker (via "+ Bild"), upload a fresh JPEG, wait for the
 * SSE pipeline to finish, and confirm the selection — leaving an image block in
 * the editor. Returns the uploaded file's name.
 */
export async function addImageBlockByUpload(page: Page, name = 'strand.jpg'): Promise<string> {
  const file = await makeJpegUpload(name);
  await openInserterMenu(page);
  await page.getByRole('button', { name: 'Bild', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Bildauswahl' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Hochladen').setInputFiles(file);
  // The pipeline transcodes + persists, then the picker reloads and pre-selects
  // the new image (its thumbnail button is labelled with the filename).
  await expect(dialog.getByRole('button', { name: file.name })).toBeVisible({
    timeout: 30_000,
  });
  await dialog.getByRole('button', { name: 'Auswählen' }).click();
  await expect(dialog).toBeHidden();
  return file.name;
}

/** Click "Veröffentlichen" and wait for the redirect back to the post list. */
export async function publish(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Veröffentlichen' }).click();
  await expect(page).toHaveURL(/#\/admin$/);
}
