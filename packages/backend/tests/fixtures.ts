import sharp from 'sharp';

/**
 * Generated image fixtures. We synthesize images at test time rather than commit
 * binaries, so fixtures are transparent and reviewable.
 *
 * HEIC cannot be reliably *encoded* by the prebuilt sharp (libheif ships a
 * decoder but not always an encoder), so a real `.heic` sample must be committed
 * under tests/fixtures/ for the HEIC decode path (Phase 5). JPEG/PNG/WebP are
 * generated here.
 */

export interface MakeImageOptions {
  width?: number;
  height?: number;
  background?: string;
}

/** A JPEG carrying EXIF with a GPS tag — used to prove GPS is stripped. */
export function makeJpegWithGps(opts: MakeImageOptions = {}): Promise<Buffer> {
  const { width = 64, height = 48, background = '#3477eb' } = opts;
  return sharp({ create: { width, height, channels: 3, background } })
    .withExif({
      IFD0: { Make: 'TestCam', Model: 'X100', DateTime: '2026:05:01 10:00:00' },
      GPS: {
        GPSLatitudeRef: 'N',
        GPSLatitude: '47/1 25/1 12/1',
        GPSLongitudeRef: 'E',
        GPSLongitude: '10/1 59/1 0/1',
      },
    })
    .jpeg()
    .toBuffer();
}

/** A plain PNG with no metadata. */
export function makePng(opts: MakeImageOptions = {}): Promise<Buffer> {
  const { width = 64, height = 48, background = '#22aa55' } = opts;
  return sharp({ create: { width, height, channels: 4, background } })
    .png()
    .toBuffer();
}

/** A plain WebP. */
export function makeWebp(opts: MakeImageOptions = {}): Promise<Buffer> {
  const { width = 64, height = 48, background = '#aa2255' } = opts;
  return sharp({ create: { width, height, channels: 3, background } })
    .webp()
    .toBuffer();
}
