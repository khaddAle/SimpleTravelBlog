import sharp from 'sharp';
import exifReader from 'exif-reader';

/**
 * Remove all metadata from an image buffer. sharp does not copy input metadata
 * to the output unless explicitly told to (`keepMetadata`/`withMetadata`), so a
 * plain re-encode drops EXIF — and therefore any embedded GPS coordinates.
 *
 * `.rotate()` (no args) bakes in the EXIF orientation before the tag is dropped,
 * so the visible orientation is preserved even though the orientation tag isn't.
 *
 * The capture datetime the target picture wants to retain is read separately by
 * {@link readTakenAt} from the input buffer *before* stripping, then persisted
 * on the Image document — the stored objects still carry no metadata, so GPS
 * never reaches storage. Stripping everything here remains the non-negotiable
 * requirement; only the capture date is preserved, and only in the database.
 */
export async function stripMetadata(input: Buffer): Promise<Buffer> {
  return sharp(input).rotate().toBuffer();
}

/** True if the buffer carries an EXIF block. Used by tests and diagnostics. */
export async function hasExif(input: Buffer): Promise<boolean> {
  const meta = await sharp(input).metadata();
  return meta.exif != null;
}

/**
 * Best-effort capture date from the input's EXIF, read before metadata is
 * stripped. Prefers `Photo.DateTimeOriginal`, falling back to
 * `DateTimeDigitized` and then IFD0 `DateTime`. Returns `undefined` when there
 * is no EXIF or no parseable date.
 *
 * EXIF datetimes are timezone-naive; exif-reader interprets them as UTC. We keep
 * the value as-returned and treat it as best-effort — it drives sort order only,
 * never display, so a possible whole-image-offset error is acceptable.
 */
export async function readTakenAt(input: Buffer): Promise<Date | undefined> {
  const meta = await sharp(input).metadata();
  if (meta.exif == null) return undefined;
  const exif = exifReader(meta.exif);
  const taken =
    exif.Photo?.DateTimeOriginal ??
    exif.Photo?.DateTimeDigitized ??
    exif.Image?.DateTime;
  return taken instanceof Date && !Number.isNaN(taken.getTime()) ? taken : undefined;
}
