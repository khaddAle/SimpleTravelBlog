import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { processImage, DISPLAY_MAX, THUMB_MAX } from './pipeline.js';
import { hasExif } from './exif.js';
import { makeJpegWithGps, makePng } from '../../tests/fixtures.js';

describe('processImage', () => {
  it('produces two WebP variants', async () => {
    const { display, thumb } = await processImage(await makePng());
    expect((await sharp(display).metadata()).format).toBe('webp');
    expect((await sharp(thumb).metadata()).format).toBe('webp');
  });

  it('strips EXIF (and thus GPS) from both variants', async () => {
    const input = await makeJpegWithGps();
    expect(await hasExif(input)).toBe(true);

    const { display, thumb } = await processImage(input);
    expect(await hasExif(display)).toBe(false);
    expect(await hasExif(thumb)).toBe(false);
  });

  it('downscales large images within the variant bounds', async () => {
    const big = await sharp({
      create: { width: 3000, height: 2000, channels: 3, background: '#888' },
    })
      .jpeg()
      .toBuffer();

    const { display, thumb, width, height } = await processImage(big);
    expect(width).toBe(DISPLAY_MAX);
    expect(height).toBe(Math.round((DISPLAY_MAX * 2000) / 3000));

    const thumbMeta = await sharp(thumb).metadata();
    expect(thumbMeta.width).toBe(THUMB_MAX);
    void display;
  });

  it('does not enlarge images smaller than the bounds', async () => {
    const { width } = await processImage(await makePng({ width: 64, height: 48 }));
    expect(width).toBe(64);
  });
});
