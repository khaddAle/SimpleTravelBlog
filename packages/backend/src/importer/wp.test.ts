import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import type { Block } from '@stb/shared';
import {
  parseWpPosts,
  parseWpMedia,
  buildMediaIndex,
  htmlToBlocks,
  collectImageSrcs,
  stripWpSizeSuffix,
  mapPost,
  finalizeBlocks,
  planImport,
  renderReport,
  type ImportBlock,
  type WpPost,
} from './wp.js';

const fixture = (name: string): unknown =>
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`../../tests/fixtures/${name}`, import.meta.url)),
      'utf8',
    ),
  );

const rawPosts = fixture('wp-posts.json');
const rawMedia = fixture('wp-media.json');

describe('parseWpPosts / parseWpMedia', () => {
  it('parses the WP post corpus, tolerating unknown fields', () => {
    const posts = parseWpPosts(rawPosts);
    expect(posts).toHaveLength(3);
    expect(posts[0]).toMatchObject({ id: 101, slug: 'wanderung-zugspitze' });
    // `modified_gmt` is an unknown field — stripped, not retained.
    expect(posts[0]).not.toHaveProperty('modified_gmt');
  });

  it('parses the WP media corpus', () => {
    const media = parseWpMedia(rawMedia);
    expect(media).toHaveLength(3);
    expect(media[0]).toMatchObject({
      id: 201,
      source_url: 'https://old.example.com/wp-content/uploads/2019/07/zugspitze.jpg',
      mime_type: 'image/jpeg',
    });
  });

  it('throws on a structurally invalid post', () => {
    expect(() => parseWpPosts([{ id: 'not-a-number' }])).toThrow();
  });

  it('throws on a non-array payload', () => {
    expect(() => parseWpMedia({ not: 'an array' })).toThrow();
  });
});

describe('buildMediaIndex', () => {
  it('indexes media by numeric id', () => {
    const index = buildMediaIndex(parseWpMedia(rawMedia));
    expect(index.get(201)?.source_url).toContain('zugspitze.jpg');
    expect(index.get(999)).toBeUndefined();
  });
});

describe('htmlToBlocks — per-element mapping', () => {
  it('maps <p> to a paragraph block with decoded entities', () => {
    const { blocks } = htmlToBlocks('<p>Caf&#233; am Morgen</p>');
    expect(blocks).toEqual([{ type: 'paragraph', text: 'Café am Morgen' }]);
  });

  it('maps <h2> (and <h3>) to subtitle blocks', () => {
    const { blocks } = htmlToBlocks('<h2>Der Aufstieg</h2><h3>Etappe 1</h3>');
    expect(blocks).toEqual([
      { type: 'subtitle', text: 'Der Aufstieg' },
      { type: 'subtitle', text: 'Etappe 1' },
    ]);
  });

  it('maps a bare <img> to a pending image block, alt becomes caption', () => {
    const { blocks } = htmlToBlocks('<img src="https://x/a.jpg" alt="Strand"/>');
    expect(blocks).toEqual([
      { type: 'image', src: 'https://x/a.jpg', caption: 'Strand' },
    ]);
  });

  it('maps a <figure><img><figcaption> to an image block, figcaption wins', () => {
    const { blocks } = htmlToBlocks(
      '<figure><img src="https://x/b.jpg" alt="alt"/><figcaption>Bildunterschrift</figcaption></figure>',
    );
    expect(blocks).toEqual([
      { type: 'image', src: 'https://x/b.jpg', caption: 'Bildunterschrift' },
    ]);
  });

  it('treats an image-only <p> as an image block', () => {
    const { blocks } = htmlToBlocks('<p><img src="https://x/c.jpg"/></p>');
    expect(blocks).toEqual([{ type: 'image', src: 'https://x/c.jpg' }]);
  });

  it('maps <blockquote> to a quote block', () => {
    const { blocks } = htmlToBlocks('<blockquote><p>Der Berg ruft.</p></blockquote>');
    expect(blocks).toEqual([{ type: 'quote', text: 'Der Berg ruft.' }]);
  });

  it('maps <hr> to a divider block', () => {
    const { blocks } = htmlToBlocks('<hr/>');
    expect(blocks).toEqual([{ type: 'divider' }]);
  });

  it('skips empty / whitespace-only paragraphs', () => {
    const { blocks, losses } = htmlToBlocks('<p>&nbsp;</p><p>   </p>');
    expect(blocks).toEqual([]);
    expect(losses).toEqual([]);
  });

  it('records unsupported top-level elements as losses and drops them', () => {
    const { blocks, losses } = htmlToBlocks('<ul><li>a</li></ul><table></table>');
    expect(blocks).toEqual([]);
    expect(losses).toEqual([
      { kind: 'unsupported_element', detail: 'ul' },
      { kind: 'unsupported_element', detail: 'table' },
    ]);
  });

  it('records a figure without an img as a loss', () => {
    const { blocks, losses } = htmlToBlocks('<figure><figcaption>nur Text</figcaption></figure>');
    expect(blocks).toEqual([]);
    expect(losses).toEqual([{ kind: 'unsupported_element', detail: 'figure' }]);
  });

  it('records an img without src as a loss', () => {
    const { blocks, losses } = htmlToBlocks('<img alt="kein src"/>');
    expect(blocks).toEqual([]);
    expect(losses).toEqual([{ kind: 'unsupported_element', detail: 'img-without-src' }]);
  });

  it('clamps over-long paragraph text to the block max (10000)', () => {
    const long = 'a'.repeat(10_050);
    const { blocks } = htmlToBlocks(`<p>${long}</p>`);
    expect(blocks[0]).toMatchObject({ type: 'paragraph' });
    if (blocks[0].type === 'paragraph') expect(blocks[0].text).toHaveLength(10_000);
  });

  it('applies the original-src resolver to image blocks, passing the wp-image id', () => {
    const { blocks } = htmlToBlocks(
      '<p><img src="https://x/a-300x200.jpg" class="size-large wp-image-42"/></p>',
      (src, wpImageId) => `resolved:${wpImageId ?? '?'}:${src}`,
    );
    expect(blocks).toEqual([{ type: 'image', src: 'resolved:42:https://x/a-300x200.jpg' }]);
  });

  it('passes an undefined wp-image id to the resolver when the class is absent', () => {
    const { blocks } = htmlToBlocks('<img src="https://x/b.jpg"/>', (src, wpImageId) =>
      wpImageId === undefined ? `${src}#orig` : src,
    );
    expect(blocks).toEqual([{ type: 'image', src: 'https://x/b.jpg#orig' }]);
  });
});

describe('stripWpSizeSuffix', () => {
  it('removes a -WxH suffix before the extension', () => {
    expect(stripWpSizeSuffix('https://x/a-1024x683.jpg')).toBe('https://x/a.jpg');
  });

  it('leaves a URL without a size suffix unchanged', () => {
    expect(stripWpSizeSuffix('https://x/a.jpg')).toBe('https://x/a.jpg');
  });

  it('only strips a trailing dimension token directly before the extension', () => {
    expect(stripWpSizeSuffix('https://x/2020x-trip.jpg')).toBe('https://x/2020x-trip.jpg');
  });
});

describe('collectImageSrcs', () => {
  it('returns unique image sources in order', () => {
    const blocks: ImportBlock[] = [
      { type: 'image', src: 'https://x/1.jpg' },
      { type: 'paragraph', text: 'zwischen' },
      { type: 'image', src: 'https://x/2.jpg' },
      { type: 'image', src: 'https://x/1.jpg' },
    ];
    expect(collectImageSrcs(blocks)).toEqual(['https://x/1.jpg', 'https://x/2.jpg']);
  });
});

describe('mapPost', () => {
  const posts = parseWpPosts(rawPosts);
  const index = buildMediaIndex(parseWpMedia(rawMedia));
  const byId = (id: number): WpPost => posts.find((p) => p.id === id)!;

  it('maps title (entities decoded) and postDate (date_gmt → ISO UTC)', () => {
    const m = mapPost(byId(101), index);
    expect(m.request.title).toBe('Wanderung auf die Zugspitze – ein langer Tag');
    expect(m.request.postDate).toBe('2019-07-14T07:30:00.000Z');
  });

  it('maps the featured image to coverSrc, not a content block', () => {
    const m = mapPost(byId(101), index);
    expect(m.coverSrc).toBe(
      'https://old.example.com/wp-content/uploads/2019/07/zugspitze.jpg',
    );
    // The first block is now the post's own content (its leading <h2>), and the
    // cover image no longer appears among the content blocks.
    expect(m.request.blocks[0]).toEqual({ type: 'subtitle', text: 'Der Aufstieg' });
    expect(
      m.request.blocks.some((b) => b.type === 'image' && b.src.includes('zugspitze')),
    ).toBe(false);
  });

  it('leaves coverSrc undefined when the post has no featured media', () => {
    const m = mapPost({ ...byId(101), featured_media: 0 }, index);
    expect(m.coverSrc).toBeUndefined();
  });

  it('resolves a content image variant URL to its media original via the wp-image class', () => {
    const post: WpPost = {
      ...byId(101),
      featured_media: 0,
      content: {
        rendered:
          '<p><img src="https://old.example.com/wp-content/uploads/2019/07/weg-1024x683.jpg" class="wp-image-202"/></p>',
      },
    };
    const m = mapPost(post, index);
    const img = m.request.blocks.find((b) => b.type === 'image');
    // media 202's source_url is the un-resized original.
    expect(img).toEqual({
      type: 'image',
      src: 'https://old.example.com/wp-content/uploads/2019/07/weg.jpg',
    });
  });

  it('falls back to stripping the WP size suffix when the wp-image id is unknown', () => {
    const post: WpPost = {
      ...byId(101),
      featured_media: 0,
      content: { rendered: '<p><img src="https://x/foo-1600x900.jpg"/></p>' },
    };
    const m = mapPost(post, index);
    const img = m.request.blocks.find((b) => b.type === 'image');
    expect(img).toEqual({ type: 'image', src: 'https://x/foo.jpg' });
  });

  it('records a location_missing loss and applies metadata defaults', () => {
    const m = mapPost(byId(102), index);
    expect(m.request.country).toBe('XX');
    expect(m.request.placeName).toBe('Unbekannt');
    expect(m.request.lat).toBe(0);
    expect(m.request.lng).toBe(0);
    expect(m.losses).toContainEqual({ kind: 'location_missing', detail: 'abend-in-stromboli' });
  });

  it('honours overridden metadata defaults', () => {
    const m = mapPost(byId(102), index, {
      defaultCountry: 'IT',
      defaultPlaceName: 'Stromboli',
      defaultLat: 38.79,
      defaultLng: 15.21,
    });
    expect(m.request).toMatchObject({ country: 'IT', placeName: 'Stromboli', lat: 38.79, lng: 15.21 });
  });

  it('records empty_post for a post that maps to no blocks', () => {
    const m = mapPost(byId(103), index);
    expect(m.request.blocks).toEqual([]);
    expect(m.losses).toContainEqual({ kind: 'empty_post', detail: 'leerer-entwurf' });
  });

  it('does not flag empty_post when a post has a cover but no body blocks', () => {
    const m = mapPost({ ...byId(101), content: { rendered: '<p>&nbsp;</p>' } }, index);
    expect(m.request.blocks).toEqual([]);
    expect(m.coverSrc).toBeTruthy();
    expect(m.losses.some((l) => l.kind === 'empty_post')).toBe(false);
  });

  it('reports a missing featured media reference as a loss', () => {
    const orphan: WpPost = { ...byId(102), featured_media: 9999 };
    const m = mapPost(orphan, index);
    expect(m.losses).toContainEqual({ kind: 'unresolved_image', detail: 'featured_media:9999' });
  });

  it('maps as published with publishedAt = the original WP date by default', () => {
    const m = mapPost(byId(101), index);
    expect(m.request.status).toBe('published');
    expect(m.request.publishedAt).toBe('2019-07-14T07:30:00.000Z');
    expect(m.request.publishedAt).toBe(m.request.postDate);
  });

  it('maps as a draft without publishedAt when asDraft is set', () => {
    const m = mapPost(byId(101), index, { asDraft: true });
    expect(m.request.status).toBe('draft');
    expect(m.request.publishedAt).toBeUndefined();
  });
});

describe('finalizeBlocks', () => {
  it('resolves image src → imageId via the resolver', () => {
    const pending: ImportBlock[] = [
      { type: 'image', src: 'https://x/a.jpg', caption: 'Cap' },
      { type: 'paragraph', text: 'Text' },
    ];
    const { blocks, losses } = finalizeBlocks(pending, (src) =>
      src === 'https://x/a.jpg' ? 'img_abc' : undefined,
    );
    expect(losses).toEqual([]);
    expect(blocks).toEqual<Block[]>([
      { type: 'image', imageId: 'img_abc', caption: 'Cap' },
      { type: 'paragraph', text: 'Text' },
    ]);
  });

  it('drops an unresolved image and records the loss', () => {
    const pending: ImportBlock[] = [{ type: 'image', src: 'https://x/missing.jpg' }];
    const { blocks, losses } = finalizeBlocks(pending, () => undefined);
    expect(blocks).toEqual([]);
    expect(losses).toEqual([{ kind: 'unresolved_image', detail: 'https://x/missing.jpg' }]);
  });
});

describe('planImport', () => {
  const posts = parseWpPosts(rawPosts);
  const media = parseWpMedia(rawMedia);

  const makeWpPost = (
    id: number,
    slug: string,
    status: string,
    content = '<p>Inhalt</p>',
  ): WpPost => ({
    id,
    slug,
    status,
    date_gmt: '2020-01-01T00:00:00',
    featured_media: 0,
    title: { rendered: slug },
    content: { rendered: content },
  });

  it('imports only published posts, listing the rest as skipped', () => {
    const plan = planImport(posts, media);
    // Fixture: only 101 (wanderung-zugspitze) is published; 102 + 103 are drafts.
    expect(plan.mapped).toHaveLength(1);
    expect(plan.counts.posts).toBe(1);
    expect(plan.mapped[0]?.slug).toBe('wanderung-zugspitze');
    expect(plan.mapped[0]?.request.status).toBe('published');
    // The two drafts are skipped (not mapped) but recorded for the report.
    expect(plan.counts.skipped).toBe(2);
    expect(plan.skipped).toEqual([
      { sourceId: 102, slug: 'abend-in-stromboli', status: 'draft' },
      { sourceId: 103, slug: 'leerer-entwurf', status: 'draft' },
    ]);
  });

  it('collects only the images referenced by published posts', () => {
    const plan = planImport(posts, media);
    // zugspitze (cover) + weg (inline) belong to the published post; stromboli
    // belongs to a skipped draft and is therefore never uploaded.
    expect(plan.imageSources).toEqual([
      'https://old.example.com/wp-content/uploads/2019/07/zugspitze.jpg',
      'https://old.example.com/wp-content/uploads/2019/07/weg.jpg',
    ]);
    expect(plan.counts.images).toBe(2);
  });

  it('scopes losses to the published posts only', () => {
    const plan = planImport(posts, media);
    expect(plan.losses.every((l) => l.slug === 'wanderung-zugspitze')).toBe(true);
    // The skipped draft "leerer-entwurf" no longer contributes its empty_post loss.
    expect(plan.losses.some((l) => l.slug === 'leerer-entwurf')).toBe(false);
  });

  it('--limit caps the number of imported posts and their images', () => {
    const corpus = [
      makeWpPost(1, 'a', 'publish', '<p><img src="https://x/a.jpg"/></p>'),
      makeWpPost(2, 'b', 'publish', '<p><img src="https://x/b.jpg"/></p>'),
      makeWpPost(3, 'c', 'publish', '<p><img src="https://x/c.jpg"/></p>'),
    ];
    const plan = planImport(corpus, [], {}, 2);
    expect(plan.mapped.map((m) => m.slug)).toEqual(['a', 'b']);
    expect(plan.imageSources).toEqual(['https://x/a.jpg', 'https://x/b.jpg']);
  });

  it('applies the limit to published posts only and keeps the full skipped list', () => {
    const corpus = [
      makeWpPost(1, 'pub-1', 'publish'),
      makeWpPost(2, 'draft-1', 'draft'),
      makeWpPost(3, 'pub-2', 'publish'),
    ];
    const plan = planImport(corpus, [], {}, 1);
    expect(plan.mapped.map((m) => m.slug)).toEqual(['pub-1']);
    expect(plan.skipped).toEqual([{ sourceId: 2, slug: 'draft-1', status: 'draft' }]);
  });

  it('honours asDraft, importing published posts as drafts', () => {
    const plan = planImport([makeWpPost(1, 'a', 'publish')], [], { asDraft: true });
    expect(plan.mapped[0]?.request.status).toBe('draft');
    expect(plan.mapped[0]?.request.publishedAt).toBeUndefined();
  });

  describe('large-image flagging', () => {
    const bigMedia = parseWpMedia([
      {
        id: 1,
        source_url: 'https://x/huge.jpg',
        mime_type: 'image/jpeg',
        media_details: { width: 6000, height: 4000, filesize: 25 * 1024 * 1024 },
      },
      {
        id: 2,
        source_url: 'https://x/ok.jpg',
        mime_type: 'image/jpeg',
        media_details: { width: 1600, height: 1067, filesize: 800 * 1024 },
      },
      {
        id: 3,
        source_url: 'https://x/no-size.jpg',
        mime_type: 'image/jpeg',
        media_details: { width: 8000, height: 6000 },
      },
    ]);

    it('flags referenced images whose filesize exceeds the byte warn threshold', () => {
      const post = makeWpPost(1, 'a', 'publish', '<p><img src="https://x/huge.jpg"/></p>');
      const plan = planImport([post], bigMedia, { warnImageBytes: 15 * 1024 * 1024 });
      expect(plan.largeImages).toEqual([
        { src: 'https://x/huge.jpg', width: 6000, height: 4000, filesize: 25 * 1024 * 1024 },
      ]);
    });

    it('does not flag referenced images comfortably under the threshold', () => {
      const post = makeWpPost(1, 'a', 'publish', '<p><img src="https://x/ok.jpg"/></p>');
      const plan = planImport([post], bigMedia, { warnImageBytes: 15 * 1024 * 1024 });
      expect(plan.largeImages).toEqual([]);
    });

    it('flags by pixel count when filesize is unavailable', () => {
      const post = makeWpPost(1, 'a', 'publish', '<p><img src="https://x/no-size.jpg"/></p>');
      const plan = planImport([post], bigMedia, { warnImageBytes: 15 * 1024 * 1024 });
      expect(plan.largeImages).toEqual([
        { src: 'https://x/no-size.jpg', width: 8000, height: 6000 },
      ]);
    });

    it('ignores large media that no published post references', () => {
      const post = makeWpPost(1, 'a', 'publish', '<p>kein Bild</p>');
      const plan = planImport([post], bigMedia, { warnImageBytes: 15 * 1024 * 1024 });
      expect(plan.largeImages).toEqual([]);
    });
  });
});

describe('renderReport', () => {
  it('renders a German human-readable dry-run summary', () => {
    const plan = planImport(parseWpPosts(rawPosts), parseWpMedia(rawMedia));
    const text = renderReport(plan);
    expect(text).toMatch(/Beiträge:\s+1/);
    expect(text).toMatch(/Bilder:\s+2/);
    expect(text).toMatch(/Verluste|Hinweise/);
  });

  it('reports the number of skipped non-published posts', () => {
    const plan = planImport(parseWpPosts(rawPosts), parseWpMedia(rawMedia));
    expect(renderReport(plan)).toMatch(/Übersprungen.*2/);
  });

  it('reports "keine" when there are no losses', () => {
    const plan = planImport([], []);
    expect(renderReport(plan)).toContain('Verluste/Hinweise: keine');
  });

  it('lists large referenced images with a size hint when any are flagged', () => {
    const media = parseWpMedia([
      {
        id: 1,
        source_url: 'https://x/huge.jpg',
        mime_type: 'image/jpeg',
        media_details: { width: 6000, height: 4000, filesize: 25 * 1024 * 1024 },
      },
    ]);
    const post: WpPost = {
      id: 1,
      slug: 'a',
      status: 'publish',
      date_gmt: '2020-01-01T00:00:00',
      featured_media: 0,
      title: { rendered: 'a' },
      content: { rendered: '<p><img src="https://x/huge.jpg"/></p>' },
    };
    const text = renderReport(planImport([post], media, { warnImageBytes: 15 * 1024 * 1024 }));
    expect(text).toMatch(/Große Bilder/);
    expect(text).toContain('https://x/huge.jpg');
  });
});
