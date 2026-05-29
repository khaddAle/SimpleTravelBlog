import sharp from 'sharp';

/**
 * Remove all metadata from an image buffer. sharp does not copy input metadata
 * to the output unless explicitly told to (`keepMetadata`/`withMetadata`), so a
 * plain re-encode drops EXIF — and therefore any embedded GPS coordinates.
 *
 * `.rotate()` (no args) bakes in the EXIF orientation before the tag is dropped,
 * so the visible orientation is preserved even though the orientation tag isn't.
 *
 * NOTE: the target picture also wishes to *retain* capture datetime/camera while
 * dropping only GPS. Selective EXIF rewriting needs an EXIF parser (none is in
 * the dependency set); that is a documented follow-up (see docs/architecture.md).
 * Until then we strip everything — GPS removal is the non-negotiable requirement.
 */
export async function stripMetadata(input: Buffer): Promise<Buffer> {
  return sharp(input).rotate().toBuffer();
}

/** True if the buffer carries an EXIF block. Used by tests and diagnostics. */
export async function hasExif(input: Buffer): Promise<boolean> {
  const meta = await sharp(input).metadata();
  return meta.exif != null;
}
