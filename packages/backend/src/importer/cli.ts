import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { uploadAcceptedSchema } from '@stb/shared';
import {
  parseWpPosts,
  parseWpMedia,
  planImport,
  finalizeBlocks,
  renderReport,
  type ImportPlan,
  type MapOptions,
} from './wp.js';
import { drainSseEvents } from './sse.js';
import { withRetry } from './retry.js';
import { createProgressTracker } from './progress.js';
import { manifestFilename, parseManifest, type Manifest } from './manifest.js';

/** Build an onRetry handler that logs each transient failure + backoff to stdout. */
const warnRetry =
  (label: string) =>
  (err: unknown, attempt: number, delayMs: number): void => {
    const msg = err instanceof Error ? err.message : String(err);
    process.stdout.write(`  ⚠ ${label}: ${msg} — Versuch ${attempt} gescheitert, erneut in ${delayMs}ms\n`);
  };

/**
 * WordPress importer entrypoint. Reads a WP REST corpus (live `--wp-url` or a
 * local `--source-dir`), maps it to our block model via the pure logic in
 * {@link file://./wp.ts}, and — unless `--dry-run` — re-uploads media and
 * creates draft posts against a running blog instance. A `migration-report.json`
 * is always written. This file is I/O glue (excluded from coverage); the mapping
 * itself is unit-tested in `wp.test.ts`.
 *
 *   npm run import-wp -- --source-dir=./corpus --dry-run
 *   npm run import-wp -- --wp-url=https://old.example.com --save-corpus=./corpus --dry-run
 *   npm run import-wp -- --wp-url=https://old.example.com \
 *     --api-url=http://localhost:4000 --username=admin --password=… \
 *     --default-country=DE --default-place=Berlin
 *
 * Tuning flags: `--throttle-ms=N` (gap between uploads, default 50) paces the
 * sequential uploads; the Pi has ample headroom (peaks <0.4 of its 1-core limit
 * with zero CPU throttling during a run), so this is mostly courtesy to the
 * source WP host's downloads — raise it to be gentler, lower toward 0 for speed; `--warn-image-bytes=N` sets the size at which the report flags an
 * image (so you can raise the server's MAX_UPLOAD_BYTES before a live run);
 * `--gallery-min=N` (default 3, floored at 2) sets how many consecutive
 * caption-less images collapse into a single gallery block.
 *
 * Resumability: a live run records each uploaded `source_url → imageId` to a
 * dedup manifest beside the report (host-namespaced, e.g.
 * `manifest-<host>.json`), so re-running after a crash skips already-uploaded
 * images instead of duplicating them. `--manifest=<path>` overrides the path,
 * `--reset-manifest` forces a clean re-upload, `--no-dedup` disables it. The
 * upload/create loops print a throttled progress line (current/total, %,
 * elapsed, rate, ETA) so a multi-hour run is visibly alive.
 */

interface Args {
  wpUrl: string | undefined;
  sourceDir: string | undefined;
  wpToken: string | undefined;
  apiUrl: string;
  username: string | undefined;
  password: string | undefined;
  dryRun: boolean;
  out: string;
  /** Dump the fetched WP corpus here (wp-posts.json + wp-media.json) for repeatable offline trials. */
  saveCorpus: string | undefined;
  limit: number | undefined;
  /** Delay between sequential image uploads, ms — eases load on the Pi. */
  throttleMs: number;
  /**
   * Path to the cross-run dedup manifest (`source_url → imageId`), or undefined
   * to disable dedup (`--no-dedup`). Defaults to a host-namespaced file beside
   * the report so a crashed run can resume without re-uploading.
   */
  manifestPath: string | undefined;
  /** Ignore (and overwrite) any existing manifest — force a clean re-upload. */
  resetManifest: boolean;
  map: MapOptions;
}

const sleep = (ms: number): Promise<void> =>
  ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();

// Default output target for the report + dedup manifest: the git-ignored
// repo-root `import/` folder (where corpora and prior reports live), resolved
// from this module's location so it's independent of the cwd the importer is
// run from (it runs in packages/backend via the workspace script). An explicit
// --out / --manifest still overrides and stays relative to the cwd.
const DEFAULT_OUT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../import/migration-report.json',
);

function parseArgs(argv: string[]): Args {
  const flags = new Map<string, string>();
  const bare = new Set<string>();
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    if (eq === -1) bare.add(arg.slice(2));
    else flags.set(arg.slice(2, eq), arg.slice(eq + 1));
  }
  const num = (key: string): number | undefined => {
    const v = flags.get(key);
    return v === undefined ? undefined : Number(v);
  };
  const map: MapOptions = {};
  const country = flags.get('default-country');
  const place = flags.get('default-place');
  const lat = num('default-lat');
  const lng = num('default-lng');
  const warnBytes = num('warn-image-bytes');
  const galleryMin = num('gallery-min');
  if (country !== undefined) map.defaultCountry = country;
  if (place !== undefined) map.defaultPlaceName = place;
  if (lat !== undefined) map.defaultLat = lat;
  if (lng !== undefined) map.defaultLng = lng;
  if (warnBytes !== undefined && Number.isFinite(warnBytes)) map.warnImageBytes = warnBytes;
  if (galleryMin !== undefined && Number.isFinite(galleryMin)) map.galleryThreshold = galleryMin;
  if (bare.has('as-draft')) map.asDraft = true;

  const limit = num('limit');
  const throttle = num('throttle-ms');

  const apiUrl = (flags.get('api-url') ?? 'http://localhost:4000').replace(/\/$/, '');
  const out = flags.get('out') ?? DEFAULT_OUT;
  // Dedup manifest lives beside the report, namespaced by target host, unless
  // overridden by --manifest or disabled by --no-dedup.
  const manifestFlag = flags.get('manifest');
  const manifestPath = bare.has('no-dedup')
    ? undefined
    : (manifestFlag ?? path.join(path.dirname(out), manifestFilename(apiUrl)));

  return {
    wpUrl: flags.get('wp-url'),
    sourceDir: flags.get('source-dir'),
    wpToken: flags.get('wp-token'),
    apiUrl,
    username: flags.get('username'),
    password: flags.get('password'),
    dryRun: bare.has('dry-run'),
    out,
    saveCorpus: flags.get('save-corpus'),
    limit: limit !== undefined && Number.isFinite(limit) ? limit : undefined,
    throttleMs: throttle !== undefined && Number.isFinite(throttle) ? Math.max(0, throttle) : 50,
    manifestPath,
    resetManifest: bare.has('reset-manifest'),
    map,
  };
}

// --- WP corpus loading -----------------------------------------------------

/** Page through a WP REST collection until a short/empty page is returned. */
async function fetchAll(base: string, kind: 'posts' | 'media', token?: string): Promise<unknown[]> {
  const perPage = 100;
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const all: unknown[] = [];
  for (let page = 1; ; page++) {
    const url = `${base}/wp-json/wp/v2/${kind}?per_page=${perPage}&page=${page}`;
    const res = await withRetry(() => fetch(url, { headers }), {
      onRetry: warnRetry(`WP ${kind} Seite ${page}`),
    });
    if (res.status === 400) break; // WP returns 400 past the last page
    if (!res.ok) throw new Error(`WP ${kind} fetch failed: ${res.status} ${res.statusText}`);
    const batch = z.array(z.unknown()).parse(await res.json());
    all.push(...batch);
    if (batch.length < perPage) break;
  }
  return all;
}

async function loadCorpus(args: Args): Promise<{ posts: unknown; media: unknown }> {
  if (args.sourceDir) {
    const read = (f: string): Promise<unknown> =>
      readFile(path.join(args.sourceDir!, f), 'utf8').then((s) => JSON.parse(s) as unknown);
    return { posts: await read('wp-posts.json'), media: await read('wp-media.json') };
  }
  if (args.wpUrl) {
    const base = args.wpUrl.replace(/\/$/, '');
    return {
      posts: await fetchAll(base, 'posts', args.wpToken),
      media: await fetchAll(base, 'media', args.wpToken),
    };
  }
  throw new Error('provide --wp-url=<site> or --source-dir=<dir>');
}

// --- blog API client (live mode) ------------------------------------------

const loginResponseSchema = z.object({ user: z.object({ id: z.string() }) });
const postCreatedSchema = z.object({ post: z.object({ id: z.string() }) });

interface Session {
  cookie: string;
  csrf: string;
}

/** Log in to the blog API; capture the session cookie + CSRF token. */
async function login(apiUrl: string, username: string, password: string): Promise<Session> {
  const res = await withRetry(
    () =>
      fetch(`${apiUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password }),
      }),
    { onRetry: warnRetry('Login') },
  );
  if (!res.ok) throw new Error(`login failed: ${res.status}`);
  loginResponseSchema.parse(await res.json());

  const pairs = res.headers
    .getSetCookie()
    .map((c) => c.split(';', 1)[0]?.trim())
    .filter((c): c is string => !!c);
  const cookie = pairs.join('; ');
  const csrfPair = pairs.find((c) => c.startsWith('csrf='));
  if (!csrfPair) throw new Error('login did not return a CSRF cookie');
  return { cookie, csrf: csrfPair.slice('csrf='.length) };
}

/** Fetch the original image bytes from the WP source. */
async function downloadImage(src: string): Promise<{ bytes: Uint8Array<ArrayBuffer>; mime: string }> {
  const dl = await fetch(src);
  if (!dl.ok) throw new Error(`image download failed: ${src} (${dl.status})`);
  const mime = dl.headers.get('content-type') ?? 'application/octet-stream';
  const bytes = new Uint8Array(await dl.arrayBuffer());
  return { bytes, mime };
}

/** POST image bytes to the upload endpoint, returning the accepted ids. */
async function postUpload(
  apiUrl: string,
  session: Session,
  bytes: Uint8Array<ArrayBuffer>,
  mime: string,
  filename: string,
): Promise<{ uploadId: string; imageId: string }> {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: mime }), filename);
  const res = await fetch(`${apiUrl}/api/images/upload`, {
    method: 'POST',
    headers: { cookie: session.cookie, 'x-csrf-token': session.csrf },
    body: form,
  });
  if (res.status !== 202) throw new Error(`upload failed: ${res.status}`);
  return uploadAcceptedSchema.parse(await res.json());
}

/**
 * Download an image and re-upload it, awaiting the transcode. Each network step
 * is retried independently with backoff so a transient `fetch failed` mid-run
 * self-heals instead of aborting the whole migration. The steps are split (not
 * one wrapped block) so a retry never re-downloads bytes that already uploaded.
 */
async function uploadImage(apiUrl: string, session: Session, src: string): Promise<string> {
  const { bytes, mime } = await withRetry(() => downloadImage(src), {
    onRetry: warnRetry(`Download ${src}`),
  });
  const filename = src.split('/').pop() || 'image';

  const { uploadId, imageId } = await withRetry(
    () => postUpload(apiUrl, session, bytes, mime, filename),
    { onRetry: warnRetry(`Upload ${src}`) },
  );
  await withRetry(() => awaitUpload(apiUrl, session, uploadId), {
    onRetry: warnRetry(`Fortschritt ${src}`),
  });
  return imageId;
}

/** Block on the SSE progress stream until the transcode reports done/error. */
async function awaitUpload(apiUrl: string, session: Session, uploadId: string): Promise<void> {
  const res = await fetch(`${apiUrl}/api/images/upload/${uploadId}/progress`, {
    headers: { cookie: session.cookie, accept: 'text/event-stream' },
  });
  if (!res.ok || !res.body) throw new Error(`progress stream failed: ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buf += decoder.decode(value, { stream: true });
    // Only parse complete lines; a `data:` event split across chunks (common
    // over the Cloudflare tunnel) stays in `rest` until its newline arrives.
    const { events, rest } = drainSseEvents(buf);
    buf = rest;
    for (const event of events) {
      if (event.type === 'error') throw new Error(`transcode failed: ${event.message ?? ''}`);
      if (event.type === 'done') return;
    }
  }
}

async function createPost(
  apiUrl: string,
  session: Session,
  body: unknown,
): Promise<string> {
  const res = await withRetry(
    () =>
      fetch(`${apiUrl}/api/posts`, {
        method: 'POST',
        headers: {
          cookie: session.cookie,
          'x-csrf-token': session.csrf,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      }),
    { onRetry: warnRetry('Beitrag anlegen') },
  );
  if (res.status !== 201) throw new Error(`post create failed: ${res.status}`);
  return postCreatedSchema.parse(await res.json()).post.id;
}

/** Load the dedup manifest, returning an empty map if the file does not exist. */
async function loadManifest(file: string): Promise<Manifest> {
  try {
    const raw: unknown = JSON.parse(await readFile(file, 'utf8'));
    return parseManifest(raw);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw err;
  }
}

// --- orchestration ---------------------------------------------------------

interface RunResult {
  plan: ImportPlan;
  created: { slug: string; id: string }[];
  uploaded: Record<string, string>;
  finalizeLosses: { slug: string; src: string }[];
}

async function runLive(args: Args, plan: ImportPlan): Promise<RunResult> {
  if (!args.username || !args.password) throw new Error('live import needs --username and --password');
  const session = await login(args.apiUrl, args.username, args.password);

  // Cross-run dedup: reuse already-uploaded sources so a crashed run resumes
  // instead of re-uploading everything. Persisted incrementally (and at the
  // end) so progress survives an abort mid-run.
  const manifest: Manifest =
    args.manifestPath && !args.resetManifest ? await loadManifest(args.manifestPath) : {};
  let sinceFlush = 0;
  const persistManifest = async (): Promise<void> => {
    if (!args.manifestPath) return;
    await mkdir(path.dirname(path.resolve(args.manifestPath)), { recursive: true });
    await writeFile(args.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  };

  const uploaded: Record<string, string> = {};
  const total = plan.imageSources.length;
  const progress = createProgressTracker({ total, label: 'Bilder' });
  let done = 0;
  let skipped = 0;
  let first = true;
  process.stdout.write(`\nBilder hochladen: ${total}\n`);
  for (const src of plan.imageSources) {
    const cached = manifest[src];
    if (cached) {
      // Already uploaded in a previous run — reuse the id, no network call.
      uploaded[src] = cached;
      skipped += 1;
    } else {
      // Sequential uploads with a configurable gap so the Pi's background
      // transcode (no server-side concurrency cap) is not overwhelmed.
      if (!first) await sleep(args.throttleMs);
      first = false;
      const imageId = await uploadImage(args.apiUrl, session, src);
      uploaded[src] = imageId;
      manifest[src] = imageId;
      sinceFlush += 1;
      if (sinceFlush >= 25) {
        await persistManifest();
        sinceFlush = 0;
      }
    }
    done += 1;
    const line = progress.tick(done, { skipped });
    if (line) process.stdout.write(`  ${line}\n`);
  }
  await persistManifest();

  const created: RunResult['created'] = [];
  const finalizeLosses: RunResult['finalizeLosses'] = [];
  process.stdout.write(`\nBeiträge anlegen: ${plan.mapped.length}\n`);
  for (const m of plan.mapped) {
    const { blocks, losses } = finalizeBlocks(m.request.blocks, (src) => uploaded[src]);
    for (const l of losses) finalizeLosses.push({ slug: m.slug, src: l.detail });
    // The WP featured image becomes the post's cover; record a loss if its
    // re-upload did not produce an id.
    const coverImageId = m.coverSrc ? uploaded[m.coverSrc] : undefined;
    if (m.coverSrc && !coverImageId) finalizeLosses.push({ slug: m.slug, src: m.coverSrc });
    const id = await createPost(args.apiUrl, session, {
      ...m.request,
      blocks,
      ...(coverImageId ? { coverImageId } : {}),
    });
    created.push({ slug: m.slug, id });
    process.stdout.write(`  + ${m.slug} → ${id}\n`);
  }

  return { plan, created, uploaded, finalizeLosses };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const corpus = await loadCorpus(args);

  // Persist the raw corpus (esp. after a live fetch) so subsequent trials can
  // run offline from --source-dir without re-hitting the WP REST API.
  if (args.saveCorpus) {
    await mkdir(args.saveCorpus, { recursive: true });
    await writeFile(
      path.join(args.saveCorpus, 'wp-posts.json'),
      `${JSON.stringify(corpus.posts, null, 2)}\n`,
      'utf8',
    );
    await writeFile(
      path.join(args.saveCorpus, 'wp-media.json'),
      `${JSON.stringify(corpus.media, null, 2)}\n`,
      'utf8',
    );
    process.stdout.write(`Korpus gespeichert: ${args.saveCorpus}\n`);
  }

  const posts = parseWpPosts(corpus.posts);
  const media = parseWpMedia(corpus.media);
  const plan = planImport(posts, media, args.map, args.limit);

  process.stdout.write(`${renderReport(plan)}\n`);

  const report: Record<string, unknown> = {
    dryRun: args.dryRun,
    counts: plan.counts,
    losses: plan.losses,
    skipped: plan.skipped,
    largeImages: plan.largeImages,
    posts: plan.mapped.map((m) => ({
      sourceId: m.sourceId,
      slug: m.slug,
      originalStatus: m.originalStatus,
      status: m.request.status,
      publishedAt: m.request.publishedAt,
      title: m.request.title,
      coverSrc: m.coverSrc,
    })),
  };

  if (!args.dryRun) {
    const result = await runLive(args, plan);
    report.created = result.created;
    report.uploaded = result.uploaded;
    report.finalizeLosses = result.finalizeLosses;
  }

  await mkdir(path.dirname(path.resolve(args.out)), { recursive: true });
  await writeFile(args.out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`\nBericht geschrieben: ${args.out}\n`);
}

main().catch((err: unknown) => {
  process.stderr.write(`[import-wp] ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
