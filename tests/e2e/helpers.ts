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
 * Open the block inserter menu. Blocks are added through a per-gap "+"
 * (aria-label "Block einfügen"); `gap` picks a specific gap (0 = before the
 * first block), and the default trailing gap appends.
 */
export async function openInserterMenu(page: Page, gap?: number): Promise<void> {
  const adders = page.getByRole('button', { name: 'Block einfügen' });
  if (gap === undefined) await adders.last().click();
  else await adders.nth(gap).click();
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
export async function addImageBlockByUpload(
  page: Page,
  name = 'strand.jpg',
  gap?: number,
): Promise<string> {
  const file = await makeJpegUpload(name);
  await openInserterMenu(page, gap);
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

/**
 * Place a collapsed caret at `offset` in the last "Absatz" textarea and click
 * the per-block "Absatz hier teilen" (✂) tool to split it there. The split tool
 * lives in the hover/focus rail and reads `selectionStart`, so we focus, set the
 * range, and fire `select` before clicking.
 */
export async function splitParagraphAt(page: Page, offset: number): Promise<void> {
  const textarea = page.getByLabel('Absatz').last();
  await textarea.evaluate((node, pos) => {
    const ta = node as HTMLTextAreaElement;
    ta.focus();
    ta.setSelectionRange(pos, pos);
    ta.dispatchEvent(new Event('select', { bubbles: true }));
  }, offset);
  await page.getByRole('button', { name: 'Absatz hier teilen' }).click();
}

/** Click "Veröffentlichen" and wait for the redirect back to the post list. */
export async function publish(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Veröffentlichen' }).click();
  await expect(page).toHaveURL(/#\/admin$/);
}
