import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
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
 * Tuning flags: `--throttle-ms=N` (gap between uploads, default 250) eases load
 * on the Pi; `--warn-image-bytes=N` sets the size at which the report flags an
 * image (so you can raise the server's MAX_UPLOAD_BYTES before a live run);
 * `--gallery-min=N` (default 3, floored at 2) sets how many consecutive
 * caption-less images collapse into a single gallery block.
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
  map: MapOptions;
}

const sleep = (ms: number): Promise<void> =>
  ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();

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

  return {
    wpUrl: flags.get('wp-url'),
    sourceDir: flags.get('source-dir'),
    wpToken: flags.get('wp-token'),
    apiUrl: (flags.get('api-url') ?? 'http://localhost:4000').replace(/\/$/, ''),
    username: flags.get('username'),
    password: flags.get('password'),
    dryRun: bare.has('dry-run'),
    out: flags.get('out') ?? 'migration-report.json',
    saveCorpus: flags.get('save-corpus'),
    limit: limit !== undefined && Number.isFinite(limit) ? limit : undefined,
    throttleMs: throttle !== undefined && Number.isFinite(throttle) ? Math.max(0, throttle) : 250,
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
    const res = await fetch(url, { headers });
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
  const res = await fetch(`${apiUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
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

/** Download image bytes and POST them to the upload endpoint; await `done`. */
async function uploadImage(
  apiUrl: string,
  session: Session,
  src: string,
): Promise<string> {
  const dl = await fetch(src);
  if (!dl.ok) throw new Error(`image download failed: ${src} (${dl.status})`);
  const mime = dl.headers.get('content-type') ?? 'application/octet-stream';
  const bytes = new Uint8Array(await dl.arrayBuffer());
  const filename = src.split('/').pop() || 'image';

  const form = new FormData();
  form.append('file', new Blob([bytes], { type: mime }), filename);

  const res = await fetch(`${apiUrl}/api/images/upload`, {
    method: 'POST',
    headers: { cookie: session.cookie, 'x-csrf-token': session.csrf },
    body: form,
  });
  if (res.status !== 202) throw new Error(`upload failed: ${res.status}`);
  const { uploadId, imageId } = uploadAcceptedSchema.parse(await res.json());
  await awaitUpload(apiUrl, session, uploadId);
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
  const res = await fetch(`${apiUrl}/api/posts`, {
    method: 'POST',
    headers: {
      cookie: session.cookie,
      'x-csrf-token': session.csrf,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (res.status !== 201) throw new Error(`post create failed: ${res.status}`);
  return postCreatedSchema.parse(await res.json()).post.id;
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

  const uploaded: Record<string, string> = {};
  let first = true;
  for (const src of plan.imageSources) {
    // Sequential uploads with a configurable gap so the Pi's background
    // transcode (no server-side concurrency cap) is not overwhelmed.
    if (!first) await sleep(args.throttleMs);
    first = false;
    process.stdout.write(`  ↑ ${src}\n`);
    uploaded[src] = await uploadImage(args.apiUrl, session, src);
  }

  const created: RunResult['created'] = [];
  const finalizeLosses: RunResult['finalizeLosses'] = [];
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
