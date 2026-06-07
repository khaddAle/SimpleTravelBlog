import sharp from 'sharp';
import { readTakenAt } from './exif.js';

/**
 * Transcode an uploaded image into the two WebP variants the blog serves:
 * a display image (bounded to {@link DISPLAY_MAX}px on the long edge) and a
 * thumbnail (bounded to {@link THUMB_MAX}px). A plain sharp re-encode drops all
 * input metadata, so EXIF — and therefore any embedded GPS — never reaches the
 * stored objects. `.rotate()` bakes in EXIF orientation before the tag is lost.
 *
 * The capture date is read from the input buffer here (before the variants are
 * encoded) and surfaced as {@link ProcessedImage.takenAt}; it is persisted on
 * the Image document, not embedded in the stored objects, so GPS stays out of
 * storage.
 *
 * sharp's prebuilt binary decodes JPEG/PNG/WebP and (via bundled libheif) HEIC,
 * so this function is format-agnostic about its input.
 */

export const DISPLAY_MAX = 1600;
export const THUMB_MAX = 400;
export const WEBP_QUALITY = 80;

export interface ProcessedImage {
  display: Buffer;
  thumb: Buffer;
  /** Dimensions of the display variant. */
  width: number;
  height: number;
  /** EXIF capture date, read before stripping; absent when the input had none. */
  takenAt?: Date;
}

export async function processImage(input: Buffer): Promise<ProcessedImage> {
  const base = sharp(input).rotate();
  const takenAt = await readTakenAt(input);

  // `resolveWithObject` returns the encoded buffer alongside its final
  // dimensions, so we read width/height without a second metadata pass.
  const display = await base
    .clone()
    .resize({
      width: DISPLAY_MAX,
      height: DISPLAY_MAX,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer({ resolveWithObject: true });

  const thumb = await base
    .clone()
    .resize({
      width: THUMB_MAX,
      height: THUMB_MAX,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();

  return {
    display: display.data,
    thumb,
    width: display.info.width,
    height: display.info.height,
    ...(takenAt ? { takenAt } : {}),
  };
}
