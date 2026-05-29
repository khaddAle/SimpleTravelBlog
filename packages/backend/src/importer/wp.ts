import * as cheerio from 'cheerio';
import { z } from 'zod';
import type { Block } from '@stb/shared';

/**
 * Pure WordPress-import logic: parse a WP REST corpus, map post HTML to our
 * block model element-by-element, and produce a migration plan/report. Nothing
 * here performs I/O — fetching the WP site, re-uploading media and creating
 * posts is the job of {@link file://./cli.ts}, which composes these functions.
 *
 * Mapping is intentionally lossy and conservative: only the seven block types
 * we support are produced; anything else is recorded as a {@link ImportLoss} so
 * the editor can review the gaps in the generated `migration-report.json`.
 */

// --- WP REST shapes (parse boundary; unknown fields are stripped) ----------

const renderedSchema = z.object({ rendered: z.string() });

export const wpPostSchema = z.object({
  id: z.number(),
  slug: z.string(),
  status: z.string(),
  date_gmt: z.string(),
  featured_media: z.number().default(0),
  title: renderedSchema,
  content: renderedSchema,
});
export type WpPost = z.infer<typeof wpPostSchema>;

export const wpMediaSchema = z.object({
  id: z.number(),
  source_url: z.string(),
  mime_type: z.string().default('application/octet-stream'),
  alt_text: z.string().default(''),
  caption: renderedSchema.optional(),
  media_details: z
    .object({ width: z.number().optional(), height: z.number().optional() })
    .optional(),
});
export type WpMedia = z.infer<typeof wpMediaSchema>;

export function parseWpPosts(json: unknown): WpPost[] {
  return z.array(wpPostSchema).parse(json);
}

export function parseWpMedia(json: unknown): WpMedia[] {
  return z.array(wpMediaSchema).parse(json);
}

export type MediaIndex = Map<number, WpMedia>;

export function buildMediaIndex(media: WpMedia[]): MediaIndex {
  return new Map(media.map((m) => [m.id, m]));
}

// --- block model (intermediate, image src not yet resolved) ----------------

/** An image whose source URL is known but whose imageId is not yet assigned. */
export interface PendingImageBlock {
  type: 'image';
  src: string;
  caption?: string;
}

/**
 * A mapped block before image re-upload. Text blocks are already in their final
 * shape; image blocks are {@link PendingImageBlock} until {@link finalizeBlocks}
 * swaps each `src` for the imageId returned by re-uploading the bytes.
 */
export type ImportBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'subtitle'; text: string }
  | { type: 'quote'; text: string; source?: string }
  | { type: 'divider' }
  | PendingImageBlock;

export type ImportLossKind =
  | 'unsupported_element'
  | 'unresolved_image'
  | 'empty_post'
  | 'location_missing';

/** A loss as produced by a single-post mapping (no slug yet). */
export interface LocalLoss {
  kind: ImportLossKind;
  detail: string;
}

const MAX = { paragraph: 10_000, subtitle: 300, quote: 1_000, caption: 300, title: 200 };

function clamp(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) : text;
}

/** Collapse all whitespace runs to a single space and trim. */
function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Decode entities and strip tags from an HTML fragment to plain text. */
export function stripHtml(html: string): string {
  return normalize(cheerio.load(html, null, false).root().text());
}

// --- HTML → blocks ---------------------------------------------------------

export function htmlToBlocks(html: string): { blocks: ImportBlock[]; losses: LocalLoss[] } {
  const $ = cheerio.load(html, null, false);
  const blocks: ImportBlock[] = [];
  const losses: LocalLoss[] = [];

  const pushImage = (img: cheerio.Cheerio<never>, captionOverride?: string): void => {
    const src = img.attr('src')?.trim();
    if (!src) {
      losses.push({ kind: 'unsupported_element', detail: 'img-without-src' });
      return;
    }
    const caption = normalize(captionOverride ?? img.attr('alt') ?? '');
    blocks.push({
      type: 'image',
      src,
      ...(caption ? { caption: clamp(caption, MAX.caption) } : {}),
    });
  };

  $.root()
    .children()
    .each((_, node) => {
      const el = $(node);
      const tag = el.prop('tagName')?.toLowerCase();
      switch (tag) {
        case 'p': {
          const img = el.find('img').first();
          const text = normalize(el.text());
          if (img.length > 0 && !text) {
            pushImage(img as cheerio.Cheerio<never>);
          } else if (text) {
            blocks.push({ type: 'paragraph', text: clamp(text, MAX.paragraph) });
          }
          break;
        }
        case 'h1':
        case 'h2':
        case 'h3':
        case 'h4': {
          const text = normalize(el.text());
          if (text) blocks.push({ type: 'subtitle', text: clamp(text, MAX.subtitle) });
          break;
        }
        case 'figure': {
          const img = el.find('img').first();
          if (img.length > 0) {
            const cap = normalize(el.find('figcaption').first().text());
            pushImage(img as cheerio.Cheerio<never>, cap || undefined);
          } else {
            losses.push({ kind: 'unsupported_element', detail: 'figure' });
          }
          break;
        }
        case 'img':
          pushImage(el as cheerio.Cheerio<never>);
          break;
        case 'blockquote': {
          const text = normalize(el.text());
          if (text) blocks.push({ type: 'quote', text: clamp(text, MAX.quote) });
          break;
        }
        case 'hr':
          blocks.push({ type: 'divider' });
          break;
        default:
          if (tag) losses.push({ kind: 'unsupported_element', detail: tag });
      }
    });

  return { blocks, losses };
}

/** Unique image source URLs referenced by a pending block list, in order. */
export function collectImageSrcs(blocks: ImportBlock[]): string[] {
  const seen = new Set<string>();
  for (const b of blocks) {
    if (b.type === 'image' && !seen.has(b.src)) seen.add(b.src);
  }
  return [...seen];
}

// --- post mapping ----------------------------------------------------------

export interface MapOptions {
  defaultCountry?: string;
  defaultPlaceName?: string;
  defaultLat?: number;
  defaultLng?: number;
  fallbackTitle?: string;
  /** Import as drafts instead of publishing on import (escape hatch). */
  asDraft?: boolean;
}

export interface MappedPostRequest {
  title: string;
  postDate: string;
  country: string;
  placeName: string;
  lat: number;
  lng: number;
  blocks: ImportBlock[];
  /** 'published' by default (publish-on-import); 'draft' when `asDraft`. */
  status: 'draft' | 'published';
  /** Original WP publish date; set only for published imports, omitted for drafts. */
  publishedAt?: string;
}

export interface MappedPost {
  sourceId: number;
  slug: string;
  /** WP status of the source post (only `publish` posts are ever mapped). */
  originalStatus: string;
  request: MappedPostRequest;
  losses: LocalLoss[];
}

function toIso(dateGmt: string): string {
  const withZone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(dateGmt) ? dateGmt : `${dateGmt}Z`;
  return new Date(withZone).toISOString();
}

export function mapPost(post: WpPost, media: MediaIndex, opts: MapOptions = {}): MappedPost {
  const losses: LocalLoss[] = [];
  const blocks: ImportBlock[] = [];

  if (post.featured_media) {
    const cover = media.get(post.featured_media);
    if (cover) {
      const caption = normalize(cover.alt_text || stripHtml(cover.caption?.rendered ?? ''));
      blocks.push({
        type: 'image',
        src: cover.source_url,
        ...(caption ? { caption: clamp(caption, MAX.caption) } : {}),
      });
    } else {
      losses.push({ kind: 'unresolved_image', detail: `featured_media:${post.featured_media}` });
    }
  }

  const content = htmlToBlocks(post.content.rendered);
  blocks.push(...content.blocks);
  losses.push(...content.losses);

  if (blocks.length === 0) losses.push({ kind: 'empty_post', detail: post.slug });

  const title = clamp(stripHtml(post.title.rendered) || (opts.fallbackTitle ?? 'Ohne Titel'), MAX.title);

  const country = opts.defaultCountry ?? 'XX';
  const placeName = opts.defaultPlaceName ?? 'Unbekannt';
  const lat = opts.defaultLat ?? 0;
  const lng = opts.defaultLng ?? 0;
  // WordPress carries no geo metadata; flag every post so the editor sets it.
  losses.push({ kind: 'location_missing', detail: post.slug });

  const postDate = toIso(post.date_gmt);
  const status: 'draft' | 'published' = opts.asDraft ? 'draft' : 'published';

  return {
    sourceId: post.id,
    slug: post.slug,
    originalStatus: post.status,
    request: {
      title,
      postDate,
      country,
      placeName,
      lat,
      lng,
      blocks,
      status,
      // Publish on import preserves the original WP date; drafts carry none.
      ...(status === 'published' ? { publishedAt: postDate } : {}),
    },
    losses,
  };
}

/** Replace each pending image's `src` with a resolved imageId, dropping misses. */
export function finalizeBlocks(
  blocks: ImportBlock[],
  resolve: (src: string) => string | undefined,
): { blocks: Block[]; losses: LocalLoss[] } {
  const out: Block[] = [];
  const losses: LocalLoss[] = [];
  for (const b of blocks) {
    if (b.type === 'image') {
      const imageId = resolve(b.src);
      if (!imageId) {
        losses.push({ kind: 'unresolved_image', detail: b.src });
        continue;
      }
      out.push({ type: 'image', imageId, ...(b.caption ? { caption: b.caption } : {}) });
    } else {
      out.push(b);
    }
  }
  return { blocks: out, losses };
}

// --- whole-corpus plan + report -------------------------------------------

export interface ImportLoss extends LocalLoss {
  slug: string;
}

/** A WP post excluded from the import because it is not published. */
export interface SkippedPost {
  sourceId: number;
  slug: string;
  status: string;
}

export interface ImportPlan {
  mapped: MappedPost[];
  imageSources: string[];
  losses: ImportLoss[];
  skipped: SkippedPost[];
  counts: { posts: number; blocks: number; images: number; skipped: number };
}

/**
 * Build the import plan. Only WordPress posts with `status: 'publish'` are
 * imported; everything else is recorded in `skipped` (and never uploaded).
 * `limit`, when given, caps the import to the first N published posts (and only
 * their images) — handy for bounded dev trials. The skipped list is always
 * complete regardless of the limit.
 */
export function planImport(
  posts: WpPost[],
  media: WpMedia[],
  opts: MapOptions = {},
  limit?: number,
): ImportPlan {
  const index = buildMediaIndex(media);

  const skipped: SkippedPost[] = posts
    .filter((p) => p.status !== 'publish')
    .map((p) => ({ sourceId: p.id, slug: p.slug, status: p.status }));

  const published = posts.filter((p) => p.status === 'publish');
  const selected = limit === undefined ? published : published.slice(0, Math.max(0, limit));
  const mapped = selected.map((p) => mapPost(p, index, opts));

  const losses: ImportLoss[] = mapped.flatMap((m) =>
    m.losses.map((l) => ({ slug: m.slug, ...l })),
  );

  const seen = new Set<string>();
  for (const m of mapped) {
    for (const src of collectImageSrcs(m.request.blocks)) seen.add(src);
  }
  const imageSources = [...seen];

  const blocks = mapped.reduce((n, m) => n + m.request.blocks.length, 0);

  return {
    mapped,
    imageSources,
    losses,
    skipped,
    counts: { posts: mapped.length, blocks, images: imageSources.length, skipped: skipped.length },
  };
}

/** A German, human-readable summary of a plan for the CLI's dry-run output. */
export function renderReport(plan: ImportPlan): string {
  const lines = [
    'WordPress-Import (Vorschau)',
    `  Beiträge: ${plan.counts.posts}`,
    `  Blöcke:   ${plan.counts.blocks}`,
    `  Bilder:   ${plan.counts.images}`,
  ];
  if (plan.skipped.length > 0) {
    lines.push(`  Übersprungen (nicht veröffentlicht): ${plan.skipped.length}`);
  }
  if (plan.losses.length === 0) {
    lines.push('  Verluste/Hinweise: keine');
  } else {
    lines.push(`  Verluste/Hinweise: ${plan.losses.length}`);
    for (const l of plan.losses) lines.push(`    - [${l.slug}] ${l.kind}: ${l.detail}`);
  }
  return lines.join('\n');
}
