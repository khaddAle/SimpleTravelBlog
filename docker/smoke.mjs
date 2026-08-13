/**
 * Container smoke test — runs INSIDE the built runtime image, against the
 * production node_modules that survived `npm prune --omit=dev`.
 *
 * It deliberately needs no Mongo/Redis/S3: the server boot path is covered by
 * the test suite, whereas the thing an image build can break on its own is the
 * native layer — sharp's prebuilt libvips and argon2's addon, both rebuilt for
 * linux/arm64 in the build stage. A Node major bump is exactly when that breaks.
 */
import assert from 'node:assert/strict';

const sharp = (await import('sharp')).default;
const argon2 = (await import('argon2')).default;

// 1. libvips is loaded and can encode: solid red 8x8 -> WebP.
const webp = await sharp({
  create: { width: 8, height: 8, channels: 3, background: { r: 255, g: 0, b: 0 } },
})
  .webp()
  .toBuffer();
assert.ok(webp.length > 0, 'sharp produced an empty WebP buffer');
assert.equal(webp.subarray(0, 4).toString('latin1'), 'RIFF', 'not a RIFF/WebP container');

// 2. The bundled libvips carries its HEIF decoder. The runtime image apt-installs
//    no image libraries (see docker/Dockerfile), so this is the only thing that
//    keeps HEIC uploads working — assert the capability rather than trusting it.
assert.ok(sharp.format.heif?.input?.buffer, 'libvips has no HEIF buffer input');

// 3. argon2's native addon loads and round-trips a hash.
const hash = await argon2.hash('smoke-test-password', { type: argon2.argon2id });
assert.ok(await argon2.verify(hash, 'smoke-test-password'), 'argon2 failed to verify its own hash');
assert.equal(await argon2.verify(hash, 'wrong-password'), false, 'argon2 verified a wrong password');

console.log(`OK  node ${process.version}`);
console.log(`OK  sharp ${sharp.versions.sharp} (libvips ${sharp.versions.vips}) — WebP + HEIF input`);
console.log('OK  argon2 hash/verify round-trip');
