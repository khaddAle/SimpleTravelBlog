import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { stripMetadata, hasExif } from './exif.js';

async function jpegWithGps(): Promise<Buffer> {
  // A small red square carrying EXIF incl. a GPS latitude tag.
  return sharp({
    create: { width: 8, height: 8, channels: 3, background: '#f00' },
  })
    .withExif({
      IFD0: { Make: 'TestCam', DateTime: '2026:05:01 10:00:00' },
      GPS: { GPSLatitudeRef: 'N', GPSLatitude: '47/1 0/1 0/1' },
    })
    .jpeg()
    .toBuffer();
}

describe('image EXIF handling', () => {
  it('the fixture input actually carries EXIF (test is meaningful)', async () => {
    expect(await hasExif(await jpegWithGps())).toBe(true);
  });

  it('stripMetadata removes all EXIF (no GPS can leak)', async () => {
    const out = await stripMetadata(await jpegWithGps());
    expect(await hasExif(out)).toBe(false);
  });

  it('preserves image dimensions while stripping metadata', async () => {
    const out = await stripMetadata(await jpegWithGps());
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(8);
    expect(meta.height).toBe(8);
  });
});
