# WordPress migration (importer)

The importer pulls posts + media from an existing WordPress site (via the public
WP REST API) and recreates them as **draft** posts in this blog, re-uploading
every referenced image through the normal image pipeline (so EXIF GPS is
stripped and WebP variants are generated like any other upload).

It lives in `packages/backend/src/importer/`:

- `wp.ts` — pure mapping logic (WP REST JSON → our block model). Unit-tested in
  `wp.test.ts` against the fixture corpus `packages/backend/tests/fixtures/wp-{posts,media}.json`.
- `cli.ts` — the entrypoint: fetch/load the corpus, plan, and (unless `--dry-run`)
  log in, upload media, and create posts. It is I/O glue, excluded from coverage.

## Running it

Always preview first. A dry run performs **no writes** — it maps the corpus and
writes a `migration-report.json` you can inspect.

```bash
# Dry run against a live WordPress site
npm run import-wp -- --wp-url=https://old.example.com --dry-run

# Dry run against a local corpus (no network at all)
npm run import-wp -- --source-dir=./corpus --dry-run

# Real import: re-upload media and create drafts in a running blog
npm run import-wp -- \
  --wp-url=https://old.example.com \
  --api-url=https://blog-dev.example.com \
  --username=admin --password='…' \
  --default-country=DE --default-place=Berlin
```

### Flags

| Flag | Default | Purpose |
|---|---|---|
| `--wp-url=<url>` | — | Source WordPress site (uses `/wp-json/wp/v2/{posts,media}`). |
| `--source-dir=<dir>` | — | Read `wp-posts.json` + `wp-media.json` locally instead of fetching. |
| `--wp-token=<token>` | — | Bearer token for the WP REST API (only needed for private/draft content). |
| `--api-url=<url>` | `http://localhost:4000` | Target blog instance. |
| `--username` / `--password` | — | Blog admin credentials (required unless `--dry-run`). |
| `--dry-run` | off | Map + report only; no login, no uploads, no post creation. |
| `--default-country=<XX>` | `XX` | ISO 3166-1 alpha-2 country for imported posts (WP has no geo). |
| `--default-place=<name>` | `Unbekannt` | Place name for imported posts. |
| `--default-lat` / `--default-lng` | `0` / `0` | Map coordinates for imported posts. |
| `--out=<path>` | `migration-report.json` | Where the report is written. |

Authentication is the same cookie + CSRF flow the SPA uses (the CLI logs in via
`POST /api/auth/login` and echoes the `csrf` cookie as `x-csrf-token`); there is
no separate API token.

## HTML → block mapping

The post body HTML is mapped element-by-element at the top level:

| WordPress element | Becomes | Notes |
|---|---|---|
| `<p>` with text | `paragraph` | Inline formatting (bold/italic/links) is flattened to plain text. |
| `<p>` wrapping only an `<img>` | `image` | Common classic-editor pattern. |
| `<h1>`–`<h4>` | `subtitle` | The post **title** comes from `title.rendered`, not a heading. |
| `<figure><img><figcaption>` | `image` | `figcaption` wins over `alt` for the caption. |
| bare `<img>` | `image` | `alt` becomes the caption. |
| `<blockquote>` | `quote` | Source attribution is not carried over. |
| `<hr>` | `divider` | |
| anything else (`<ul>`, `<table>`, `<div>`, …) | — | Dropped, recorded as `unsupported_element`. |

The post's `featured_media` (if present in the media corpus) is prepended as a
cover `image` block. `date_gmt` becomes `postDate` (UTC ISO). Imported posts are
always created as **drafts** regardless of their WordPress status — an editor
reviews and publishes them. Text exceeding a block's max length is truncated.

## Known limitations (recorded in the report as losses)

Every loss carries the originating post `slug`:

- **`location_missing`** — WordPress has no country/place/coordinates, so every
  imported post gets the `--default-*` values and is flagged. Set the real
  location in the editor (map click / Nominatim search) before publishing.
- **`unsupported_element`** — a top-level element with no block equivalent (lists,
  tables, embeds, shortcodes) was dropped.
- **`unresolved_image`** — an image (inline `src` or `featured_media`) could not be
  matched/uploaded; the block is omitted.
- **`empty_post`** — the post mapped to zero blocks (e.g. an empty draft).

Galleries, embeds, shortcodes, and inline rich-text formatting are intentionally
out of scope; review flagged posts manually after import.
