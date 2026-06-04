import * as cheerio from 'cheerio';
// cheerio's own typings source the DOM node union from domhandler (always present
// as a cheerio dependency); we only need the type, erased at build.
import type { AnyNode } from 'domhandler';
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
    .object({
      width: z.number().optional(),
      height: z.number().optional(),
      // Present on many WP installs; the only direct signal of the byte size we
      // would have to push through the upload limit. Absent → fall back to pixels.
      filesize: z.number().optional(),
    })
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

/** A gallery whose member source URLs are known but not yet resolved to ids. */
export interface PendingGalleryBlock {
  type: 'gallery';
  srcs: string[];
  caption?: string;
}

/**
 * A mapped block before image re-upload. Text blocks are already in their final
 * shape; image/gallery blocks carry source URLs until {@link finalizeBlocks}
 * swaps each `src` for the imageId returned by re-uploading the bytes.
 */
export type ImportBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'subtitle'; text: string }
  | { type: 'quote'; text: string; source?: string }
  | { type: 'divider' }
  | PendingImageBlock
  | PendingGalleryBlock;

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

/**
 * Strip WordPress's `-<width>x<height>` resize suffix from an upload URL so we
 * fetch the full-size original (e.g. `…/weg-1024x683.jpg` → `…/weg.jpg`). Only a
 * dimension token immediately before the file extension is removed.
 */
export function stripWpSizeSuffix(src: string): string {
  return src.replace(/-\d+x\d+(?=\.[A-Za-z0-9]+$)/, '');
}

/** Read WordPress's `wp-image-<id>` class token, if present, as a media id. */
function wpImageIdFromClass(cls: string | undefined): number | undefined {
  const m = cls?.match(/(?:^|\s)wp-image-(\d+)(?:\s|$)/);
  return m ? Number(m[1]) : undefined;
}

/** Resolve a content `<img src>` to its original. Identity when no resolver. */
export type SrcResolver = (src: string, wpImageId?: number) => string;

export function htmlToBlocks(
  html: string,
  resolveSrc?: SrcResolver,
): { blocks: ImportBlock[]; losses: LocalLoss[] } {
  const $ = cheerio.load(html, null, false);
  const blocks: ImportBlock[] = [];
  const losses: LocalLoss[] = [];

  const pushImage = (img: cheerio.Cheerio<never>, captionOverride?: string): void => {
    const rawSrc = img.attr('src')?.trim();
    if (!rawSrc) {
      losses.push({ kind: 'unsupported_element', detail: 'img-without-src' });
      return;
    }
    const wpImageId = wpImageIdFromClass(img.attr('class'));
    const src = resolveSrc ? resolveSrc(rawSrc, wpImageId) : rawSrc;
    const caption = normalize(captionOverride ?? img.attr('alt') ?? '');
    blocks.push({
      type: 'image',
      src,
      ...(caption ? { caption: clamp(caption, MAX.caption) } : {}),
    });
  };

  const pushParagraph = (raw: string): void => {
    const text = normalize(raw);
    if (text) blocks.push({ type: 'paragraph', text: clamp(text, MAX.paragraph) });
  };

  // Walk a <p>'s inline content in document order, emitting a paragraph block for
  // each text run and an image block for each <img> (descending into inline
  // wrappers such as <a>). WordPress's classic editor groups an image with its
  // surrounding narrative — and several images — into a single <p>; mapping the
  // whole <p> to either text or one image (the old behaviour) silently dropped
  // every other image. Narrative text stays a paragraph; an image's caption only
  // ever comes from its own alt/figcaption, never the surrounding prose.
  const pushParagraphWithInlineImages = (container: cheerio.Cheerio<never>): void => {
    let buffer = '';
    const visit = (node: AnyNode): void => {
      if ('tagName' in node) {
        const tag = node.tagName.toLowerCase();
        if (tag === 'img') {
          pushParagraph(buffer);
          buffer = '';
          pushImage($(node) as cheerio.Cheerio<never>);
          return;
        }
        if (tag === 'br') {
          buffer += ' ';
          return;
        }
        for (const child of node.children) visit(child);
        return;
      }
      if (node.nodeType === 3) buffer += node.data;
    };
    for (const node of container.contents().toArray()) visit(node);
    pushParagraph(buffer);
  };

  $.root()
    .children()
    .each((_, node) => {
      const el = $(node);
      const tag = el.prop('tagName')?.toLowerCase();
      switch (tag) {
        case 'p':
          pushParagraphWithInlineImages(el as cheerio.Cheerio<never>);
          break;
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
    if (b.type === 'image') seen.add(b.src);
    else if (b.type === 'gallery') for (const s of b.srcs) seen.add(s);
  }
  return [...seen];
}

/** Minimum run of consecutive images that collapses into a gallery. */
export const GALLERY_MIN_RUN_DEFAULT = 3;
/** Per-gallery image cap; mirrors `galleryBlockSchema`'s max in @stb/shared. */
export const GALLERY_MAX_IMAGES = 24;

/**
 * Collapse maximal runs of `>= minRun` consecutive caption-less image blocks
 * into gallery blocks. A captioned image stays standalone (its caption would be
 * lost in a single-caption gallery) and breaks the run, as does any non-image
 * block. Runs longer than {@link GALLERY_MAX_IMAGES} are split into multiple
 * galleries; a trailing chunk shorter than `minRun` is emitted as individual
 * image blocks rather than a tiny gallery. `minRun` is floored at 2 (a one-image
 * gallery is never useful, and 0/1 would not terminate / would wrap singles).
 */
export function coalesceImageRuns(
  blocks: ImportBlock[],
  minRun: number = GALLERY_MIN_RUN_DEFAULT,
): ImportBlock[] {
  const min = Math.max(2, Math.floor(minRun));
  const out: ImportBlock[] = [];
  let run: PendingImageBlock[] = [];

  const flush = (): void => {
    let i = 0;
    while (run.length - i >= min) {
      const chunk = run.slice(i, i + GALLERY_MAX_IMAGES);
      out.push({ type: 'gallery', srcs: chunk.map((b) => b.src) });
      i += chunk.length;
    }
    for (; i < run.length; i++) out.push(run[i]!);
    run = [];
  };

  for (const b of blocks) {
    if (b.type === 'image' && b.caption === undefined) {
      run.push(b);
    } else {
      flush();
      out.push(b);
    }
  }
  flush();
  return out;
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
  /** Byte size at/above which a referenced image is flagged in the report. */
  warnImageBytes?: number;
  /** Min consecutive images that collapse into a gallery (default 3, floored at 2). */
  galleryThreshold?: number;
}

/** Default thresholds for flagging an image as worryingly large in the report. */
export const WARN_IMAGE_BYTES_DEFAULT = 15 * 1024 * 1024;
export const WARN_IMAGE_PIXELS_DEFAULT = 24_000_000;

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
  /**
   * Pending source URL of the post's cover image (WP `featured_media`), resolved
   * to a `coverImageId` after re-upload. Undefined when the post has no cover.
   */
  coverSrc?: string;
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

  // WP's featured image becomes the post's first-class cover (coverImageId),
  // not a leading content block — resolved to an id after re-upload.
  let coverSrc: string | undefined;
  if (post.featured_media) {
    const cover = media.get(post.featured_media);
    if (cover) {
      coverSrc = cover.source_url;
    } else {
      losses.push({ kind: 'unresolved_image', detail: `featured_media:${post.featured_media}` });
    }
  }

  // Resolve each content image to its full-size original: prefer the WP media
  // attachment (via the `wp-image-<id>` class), else strip the resize suffix.
  const resolveSrc: SrcResolver = (src, wpImageId) => {
    const original = wpImageId !== undefined ? media.get(wpImageId)?.source_url : undefined;
    return original ?? stripWpSizeSuffix(src);
  };

  const content = htmlToBlocks(post.content.rendered, resolveSrc);
  // Bursts of consecutive photos read better as a grid gallery than a tall
  // stack of full-width images, so collapse runs before assigning ids.
  blocks.push(...coalesceImageRuns(content.blocks, opts.galleryThreshold));
  losses.push(...content.losses);

  if (blocks.length === 0 && !coverSrc) losses.push({ kind: 'empty_post', detail: post.slug });

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
    ...(coverSrc ? { coverSrc } : {}),
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
    } else if (b.type === 'gallery') {
      const imageIds: string[] = [];
      for (const src of b.srcs) {
        const imageId = resolve(src);
        if (!imageId) losses.push({ kind: 'unresolved_image', detail: src });
        else imageIds.push(imageId);
      }
      // A gallery that lost every image disappears; otherwise keep the survivors.
      if (imageIds.length > 0) {
        out.push({ type: 'gallery', imageIds, ...(b.caption ? { caption: b.caption } : {}) });
      }
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

/** A referenced image flagged as large enough to warrant attention pre-import. */
export interface LargeImage {
  src: string;
  width?: number;
  height?: number;
  filesize?: number;
}

export interface ImportPlan {
  mapped: MappedPost[];
  imageSources: string[];
  losses: ImportLoss[];
  skipped: SkippedPost[];
  largeImages: LargeImage[];
  counts: { posts: number; blocks: number; images: number; galleries: number; skipped: number };
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
    // Cover first (it used to be the leading block), then the content images.
    if (m.coverSrc) seen.add(m.coverSrc);
    for (const src of collectImageSrcs(m.request.blocks)) seen.add(src);
  }
  const imageSources = [...seen];

  const largeImages = flagLargeImages(imageSources, media, opts.warnImageBytes);

  const blocks = mapped.reduce((n, m) => n + m.request.blocks.length, 0);
  const galleries = mapped.reduce(
    (n, m) => n + m.request.blocks.filter((b) => b.type === 'gallery').length,
    0,
  );

  return {
    mapped,
    imageSources,
    losses,
    skipped,
    largeImages,
    counts: {
      posts: mapped.length,
      blocks,
      images: imageSources.length,
      galleries,
      skipped: skipped.length,
    },
  };
}

/**
 * Flag referenced images likely to strain the upload limit: by byte size when
 * WP reports `filesize` (default threshold {@link WARN_IMAGE_BYTES_DEFAULT}), or
 * by pixel count as a fallback ({@link WARN_IMAGE_PIXELS_DEFAULT}). Lets a
 * dry-run surface whether `MAX_UPLOAD_BYTES` needs raising before the live run.
 */
export function flagLargeImages(
  imageSources: string[],
  media: WpMedia[],
  warnBytes: number = WARN_IMAGE_BYTES_DEFAULT,
): LargeImage[] {
  const bySrc = new Map(media.map((m) => [m.source_url, m]));
  const large: LargeImage[] = [];
  for (const src of imageSources) {
    const details = bySrc.get(src)?.media_details;
    if (!details) continue;
    const { width, height, filesize } = details;
    const tooManyBytes = filesize !== undefined && filesize >= warnBytes;
    const tooManyPixels =
      filesize === undefined &&
      width !== undefined &&
      height !== undefined &&
      width * height >= WARN_IMAGE_PIXELS_DEFAULT;
    if (tooManyBytes || tooManyPixels) {
      large.push({
        src,
        ...(width !== undefined ? { width } : {}),
        ...(height !== undefined ? { height } : {}),
        ...(filesize !== undefined ? { filesize } : {}),
      });
    }
  }
  return large;
}

/** A German, human-readable summary of a plan for the CLI's dry-run output. */
export function renderReport(plan: ImportPlan): string {
  const lines = [
    'WordPress-Import (Vorschau)',
    `  Beiträge: ${plan.counts.posts}`,
    `  Blöcke:   ${plan.counts.blocks}`,
    `  Bilder:   ${plan.counts.images}`,
    `  Galerien: ${plan.counts.galleries}`,
  ];
  if (plan.skipped.length > 0) {
    lines.push(`  Übersprungen (nicht veröffentlicht): ${plan.skipped.length}`);
  }
  if (plan.largeImages.length > 0) {
    lines.push(`  Große Bilder (Upload-Limit prüfen): ${plan.largeImages.length}`);
    for (const img of plan.largeImages) {
      const mb = img.filesize !== undefined ? `${(img.filesize / 1024 / 1024).toFixed(1)} MB` : undefined;
      const px = img.width !== undefined && img.height !== undefined ? `${img.width}×${img.height}` : undefined;
      const hint = [mb, px].filter(Boolean).join(', ');
      lines.push(`    - ${img.src}${hint ? ` (${hint})` : ''}`);
    }
  }
  if (plan.losses.length === 0) {
    lines.push('  Verluste/Hinweise: keine');
  } else {
    lines.push(`  Verluste/Hinweise: ${plan.losses.length}`);
    for (const l of plan.losses) lines.push(`    - [${l.slug}] ${l.kind}: ${l.detail}`);
  }
  return lines.join('\n');
}
