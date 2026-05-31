import { z } from 'zod';

/**
 * Cross-run dedup for the importer. The migration has no server-side dedup: a
 * crashed multi-hour run would otherwise re-download and re-upload every image
 * on the next attempt, piling up orphans. We record a `source_url → imageId`
 * map to a local JSON file (in the git-ignored `import/` folder); before
 * uploading a source we consult it and reuse the existing id, making the run
 * resumable and idempotent.
 *
 * The manifest is namespaced by target host because a dev imageId is
 * meaningless against prod — reusing one manifest across targets would graft
 * dangling ids. I/O lives in `cli.ts`; the pure parse + filename logic is here
 * so it can be unit-tested.
 *
 * Caveat: the manifest trusts that a recorded image still exists on the target.
 * If images are deleted between runs, pass `--reset-manifest` to start clean.
 */
const manifestSchema = z.record(z.string(), z.string());
export type Manifest = z.infer<typeof manifestSchema>;

/** Validate a parsed JSON payload as a `source_url → imageId` map. */
export function parseManifest(raw: unknown): Manifest {
  return manifestSchema.parse(raw);
}

/** Derive a host-namespaced manifest filename from the target API URL. */
export function manifestFilename(apiUrl: string): string {
  let host: string;
  try {
    host = new URL(apiUrl).host;
  } catch {
    host = '';
  }
  const safe = host.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `manifest-${safe || 'unknown'}.json`;
}
