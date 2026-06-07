# Simple Travel Blog — Target Picture (v1)

## Context

The user already runs a WordPress-based travel blog but is unhappy with it: externally hosted (cost), bloated for the small set of features actually used, awkward editor, and unwieldy image handling (auto-generated sizes that aren't needed, no easy cleanup).

This project replaces it with a small, self-hosted, family-scale travel blog on the user's k3s home cluster. The goal of this document is to lock in *what* we're building before deciding *how*. It captures the agreed-upon scope so the next phase can produce an implementation plan against a stable target.

---

## Goals

- A simple, browser-based travel blog hosted on the home k3s HA cluster, reachable from the public internet via Cloudflare Tunnel.
- Trivially small editing surface — title/subtitle/paragraph/image blocks plus a few extras — that suits how the user actually writes.
- Image handling that doesn't generate junk and is easy to clean up.
- Cheap to run (no SaaS costs) and aligned with infra already in place.

## Non-goals (v1)

- Mobile apps (iOS/Android) — optional later.
- Public comments, reactions, social features.
- Multi-language content — German only.
- SEO / discoverability — site is intentionally search-engine hidden.
- Scheduled publishing, post versioning/history.
- Pretty social-share previews (Open Graph).

---

## Audience & access

- **Readers**: public on the internet but `noindex`/`robots.txt` keeps it off search engines. No reader login.
- **Editors**: 2–5 trusted contributors (family scale).
- **Roles**:
  - **Admin**: user management, all posts, site settings.
  - **Editor**: create/edit own + others' posts.
- **Login**: local username + password (argon2id), with login rate limiting. No 2FA in v1.

## Content model

- **Post**: title, subtitle, ordered list of blocks, post date, country, place name, lat/lng, optional trip reference, draft/published state.
- **Block types**: Title, Subtitle, Paragraph, Image (with optional caption), Image Gallery, Quote, Divider.
- **Trip**: just a name. Country/date range derived from member posts.
- **Image asset**: original is not kept; stored as two WebP variants — display (≤1600 px long edge) and thumbnail (≤400 px). Tracks filename, upload date, uploader, references from posts, and the EXIF capture date (`takenAt`, read before metadata is stripped) for the "Aufnahmedatum" sort. The capture date is the only metadata retained, and only in the database — GPS and all other EXIF are still dropped from the stored objects.
- **URLs**: opaque short IDs, e.g. `/p/a3kf2`. Stable across renames.

## Reader experience

- **Landing**: a single centered editorial hero of the latest post (eyebrow, title, lede, "Weiterlesen" button, wide print) + grid of older posts + one centered "Alle Reisen im Archiv" button.
- **Map page**: Leaflet + OSM tiles, one pin per post; click pin → post (text-only popup, no image preview); a Reise filter narrows the map to a single trip.
- **Archive**: multi-open accordion grouped by Reise / Land / Jahr (toggle), newest first — closed by default, open-state + grouping persisted across visits, bulk expand/collapse, and a `?reise=` deep-link from a post's Reise link.
- **Search**: filterable — text + country + trip + date range.
- **Post page**: blocks rendered in order, minimal chrome, image-first — portrait images shown narrow/centered and uncropped, galleries as a no-crop masonry, with bidirectional prev/next neighbours and a link back to the post's Reise.
- **Language**: German UI and content.

## Editor experience

- **Block editor**: each block is discrete with explicit `+ Insert block here +` affordances. Reorder via per-block ▲/▼ arrows.
- **Metadata sidebar**: post date; country picker; place name; lat/lng (map picker — click to set, also accepts paste); trip (pick existing or create new by name).
- **Draft / Published**: posts start as draft; explicit Publish action; can be unpublished. Edits autosave to a draft snapshot (a published post keeps serving its live version until "Veröffentlichen" promotes the draft; "Änderungen verwerfen" discards it).
- **Image upload pipeline**: JPEG / PNG / HEIC / WebP, max ~20 MB. Server transcodes to WebP display + thumb. Original discarded.
- **Image picker**: library or upload-new; filename search, date sort/filter, used-in-post filter; bulk delete refuses referenced images; orphan view; per-image "where used".
- **Branding settings**: site title, logo upload, single accent color.

## Migration from existing WordPress

One-shot importer using `/wp-json/wp/v2/posts` and `/wp-json/wp/v2/media`. Body HTML parsed best-effort into block model; media re-uploaded through the standard pipeline.

## Infrastructure constraints

- **Exposure**: Cloudflare Tunnel.
- **Object storage**: existing MinIO, dedicated bucket.
- **Database**: existing MongoDB cluster, separate database for this app.
- **Persistent storage**: local-path PV (app-level replication).
- **Backups**: Restic → NAS pipeline already covers Mongo. MinIO bucket gets its own hook.
- **Observability**: Loki via Promtail; emit structured logs.

## Verification — how we'll know v1 works

1. App reachable through Cloudflare Tunnel; `noindex`; reachable from a non-LAN device.
2. Admin login, editor creation, login rate limiting, no admin route reachable when logged out.
3. Authoring: draft → all block types → reorder → metadata (date/country/place/lat-lng/trip) → save → publish. Reader sees published, not draft.
4. Image pipeline: JPEG / PNG / HEIC → display + thumb WebP in MinIO; original gone.
5. Library hygiene: orphan filter; delete refused if referenced; "where used" accurate.
6. Reader UX: landing/map/archive/search/post pages render.
7. Migration: WP importer produces N draft posts with media re-uploaded.
8. Branding: title + color + logo applied site-wide.
9. Ops: pod restart loses no data; Mongo backup restorable; logs in Loki.
