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

  it('prepends the featured image as a cover block', () => {
    const m = mapPost(byId(101), index);
    expect(m.request.blocks[0]).toEqual({
      type: 'image',
      src: 'https://old.example.com/wp-content/uploads/2019/07/zugspitze.jpg',
      caption: 'Gipfelkreuz im Morgenlicht',
    });
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

  it('reports a missing featured media reference as a loss', () => {
    const orphan: WpPost = { ...byId(102), featured_media: 9999 };
    const m = mapPost(orphan, index);
    expect(m.losses).toContainEqual({ kind: 'unresolved_image', detail: 'featured_media:9999' });
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

  it('aggregates mapped posts, unique image sources, and slug-scoped losses', () => {
    const plan = planImport(posts, media);
    expect(plan.mapped).toHaveLength(3);
    expect(plan.counts.posts).toBe(3);
    // zugspitze (cover) + weg (inline) + stromboli (inline) = 3 unique sources.
    expect(plan.imageSources).toEqual([
      'https://old.example.com/wp-content/uploads/2019/07/zugspitze.jpg',
      'https://old.example.com/wp-content/uploads/2019/07/weg.jpg',
      'https://old.example.com/wp-content/uploads/2020/09/stromboli.png',
    ]);
    expect(plan.counts.images).toBe(3);
    // Every loss carries the originating slug.
    expect(plan.losses.every((l) => typeof l.slug === 'string' && l.slug.length > 0)).toBe(true);
    expect(plan.losses).toContainEqual({
      slug: 'wanderung-zugspitze',
      kind: 'unsupported_element',
      detail: 'ul',
    });
    expect(plan.losses).toContainEqual({
      slug: 'leerer-entwurf',
      kind: 'empty_post',
      detail: 'leerer-entwurf',
    });
  });
});

describe('renderReport', () => {
  it('renders a German human-readable dry-run summary', () => {
    const plan = planImport(parseWpPosts(rawPosts), parseWpMedia(rawMedia));
    const text = renderReport(plan);
    expect(text).toMatch(/Beiträge:\s+3/);
    expect(text).toMatch(/Bilder:\s+3/);
    expect(text).toMatch(/Verluste|Hinweise/);
  });

  it('reports "keine" when there are no losses', () => {
    const plan = planImport([], []);
    expect(renderReport(plan)).toContain('Verluste/Hinweise: keine');
  });
});
