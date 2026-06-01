# TODO

Human/AI-readable task list for SimpleTravelBlog. `[ ]` = open, `[X]` = done.
Newest open items live near the top of "Open"; the bigger picture (phases) is in
the plan and the per-phase memory note.

## Open

### Reader + editor features (found during dev testing 2026-06-01)

Decisions captured with the user 2026-06-01 (recorded inline per item). All TDD,
80% gate, German UI strings inline.

- [ ] **"Alle Beiträge" (Archive) — page beyond the first 100 via a „Mehr laden"
      button.** Bug: `Archive.svelte` calls `api.publicPosts(1, 100)` (100 = the
      backend max `pageSize`, `paginationQuerySchema` in `packages/shared/src/api.ts`),
      so with >100 posts the rest are silently dropped. **DECISION: „Mehr laden"
      button** (not numbered pages — keeps the Land→Reise→Beitrag grouping in
      `lib/archive.ts` from splitting; not auto-load-all). Show the first 100, append
      the next page on click, recompute grouping as more load; hide the button when
      the last page is reached (use the paged response's total/hasMore). Backend
      `GET /api/public/posts` already supports `page`/`pageSize` (`routes/public.ts`).
      Frontend-led; verify the public posts response exposes enough to know when to
      stop (total count or items < pageSize). NOTE: `Search.svelte` (line 32) has the
      SAME `publicPosts(1, 100)` cap when seeding its country/month filter lists — its
      dropdowns miss countries/months that only appear in posts >100; fix alongside
      (fetch all pages for the filter seed, or a dedicated lightweight facets call).
      - ✔ Stop-condition is easy: `GET /api/public/posts` already returns `total`
        (`routes/public.ts:47`), so `loaded < total` ⇒ show the button. Surface `total`
        through `api.publicPosts` if it isn't already.
      - ⚠ **Risk (MED — UX):** grouped view (Land→Reise→Beitrag, newest-first) +
        append means page 2 (older posts) scatters into *existing* groups **above**
        the button, not at the bottom — clicking „Mehr laden" makes content appear
        off-screen and a brand-new country can slot in anywhere alphabetically, which
        is disorienting. **Address:** after appending, keep scroll position stable
        (anchor on the button), and show a running „N von TOTAL Beiträgen" counter so
        the user understands more loaded even if it landed higher up; consider a flat
        „Neueste zuerst" toggle as an escape hatch if the scatter feels wrong.

- [ ] **Reisen management — dedicated admin page (create / rename / delete), open to
      all authors.** Today there is NO UI to create or edit a Reise — only the
      assign-`<select>` in `MetadataSidebar.svelte` (lines ~142). Backend
      (`routes/trips.ts`) has list (GET) + create (POST) + delete (DELETE) but **no
      rename**, and the frontend `api` has `listTrips`/`createTrip`/`deleteTrip` but no
      `updateTrip`. **DECISIONS:** (a) a **dedicated „Reisen" admin page** in the nav
      (list + create + rename + delete); the post sidebar stays **assign-only** (no
      inline create). (b) **Permissions: all logged-in authors** may manage Reisen —
      matches the current `requireAuth` on the trip routes, no gating change (do NOT
      mirror the admin-only Nutzer/Einstellungen gating here). (c) **Deletion stays
      'only when empty'** — keep the backend's existing 409-if-referenced rule; the UI
      explains why and links the referencing posts so the author can reassign first
      (the DELETE route already returns the referencing posts). NEW WORK: add a
      **rename** endpoint (`PATCH/PUT /api/trips/:shortId`, name unique 1–120,
      `requireAuth`+`requireCsrf`, 409 on duplicate name) + `api.updateTrip` +
      the page component. TDD backend + frontend.
      - ⚠ **Risk (MED — impl):** the Trip `name` has a UNIQUE index, so a rename that
        collides will throw a Mongo `E11000` duplicate-key error and surface as a 500,
        not the intended 409. **Address:** pre-check `Trip.findOne({ name })` (excluding
        the same shortId) and/or catch `E11000` and map it to `httpErrors.conflict`;
        cover the duplicate-rename case in the test. Also normalize/trim the name the
        same way create does so " Foo" vs "Foo" don't both slip in.
      - ⚠ **Risk (MED — correctness):** rename must keep `shortId` STABLE — search
        filters (`?tripId=`), archive grouping, and any shared links key on the
        shortId, not the name. **Address:** update only `name`; never regenerate
        `shortId` on rename (a test asserting the shortId is unchanged is cheap).

- [X] **Suche — switch to live substring filtering — DONE (Phase 1 #2, 2026-06-01).**
      Implemented: new pure `posts/fold.ts` (`foldSearch` = lowercase + ä→ae/ö→oe/ü→ue/
      ß→ss + NFD-strip; `escapeRegex`); Post `pre('save')` now also stores `searchFold`
      and `buildPublishedSearch` matches `{ searchFold: { $regex: escapeRegex(foldSearch(q)) } }`
      (sorted by date; the `$text` projection was dropped from the route). SECURITY
      mitigation in place (literal-substring escape → no ReDoS/injection; covered by a
      backtracking-payload test). Existing posts backfilled via idempotent
      `bootstrap/backfillSearchFold.ts` wired into `server.ts`. Perf scan accepted at
      this size (comment in `search.ts`). The `$text` index is retained (unused by
      search) to avoid prod index drift. TDD: `fold.test.ts`, `search.test.ts`,
      `Post.test.ts`, `backfillSearchFold.test.ts`, `public.int.test.ts`. The original
      analysis + risk notes are kept below for reference.

- [~] **(superseded by the DONE entry above) Suche — switch to live substring filtering
      (currently matches nothing on partial input).** Diagnosis: `Search.svelte` IS wired (live, 200 ms debounce,
      `$effect`) and the Mongo `searchText` text index exists — but `$text` matches
      **whole stemmed words**, so typing a partial term ("Ber") returns nothing until
      a complete word ("Bergen") is entered → reads as "nothing happens". **DECISION:
      live substring filtering** — case-insensitive substring across title, Ortsname,
      Land **and post body**, updating per keystroke (keep the debounce, no submit
      button). Replace the `$text` query in `packages/backend/src/posts/search.ts`
      (and its route in `routes/public.ts`) with a case-insensitive substring match
      (e.g. regex on `searchText`/title/placeName; `searchText` already denormalizes
      title+subtitle+placeName+body via the Post `pre('save')` hook). Mind regex-escape
      the user input and keep the country/trip/date filters. With a few hundred posts
      the scan is fine; revisit only if the corpus grows. TDD the search builder.
      - ⚠ **Risk (HIGH — UX regression):** the current Mongo `$text` index uses German
        stemming + folding, so it matches case- AND diacritic-insensitively (e.g.
        "munchen"/"muenchen" → "München"). A naive `/q/i` regex matches case but NOT
        diacritics — "munchen" would suddenly find nothing, a real regression for a
        German blog. **Address:** add a denormalized FOLDED field (lowercased +
        diacritics transliterated: ä→ae, ö→oe, ü→ue, ß→ss, plus NFD-strip the rest)
        computed in the Post `pre('save')` hook beside `searchText`, fold the query the
        same way, and regex against the folded field. (Backfill the field on existing
        posts via a tiny migration / re-save, or the imported corpus won't match.)
      - ⚠ **Risk (MED — SECURITY, MUST mitigate — NOT accepted):** building `$regex`
        from raw `q` lets an anonymous caller control the regex *pattern* run against
        every post body on the public `GET /api/public/search`. A crafted pattern
        (e.g. `(a+)+$`) triggers catastrophic backtracking (Mongo `$regex` → PCRE) =
        unauthenticated **ReDoS** / CPU exhaustion on the 1–2-core prod Pi; lesser
        variant = pattern injection (`.*`, anchors) skewing matches. `SEARCH_LIMIT=100`
        caps result size but NOT backtracking cost. **Address (required):** escape all
        regex metacharacters so `q` matches as a LITERAL substring —
        `q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')` — which both removes the injection
        and makes the pattern linear-time (no backtracking ⇒ no ReDoS). Keep the
        existing `z.string().max(200)` cap (`api.ts:186`) and never spread user input
        as a query object (zod already guarantees `q` is a string, blocking
        `$`-operator injection). Add a test feeding a backtracking pattern.
      - ⚠ **Risk (MED — perf, ACCEPTED at this size):** an escaped-but-unanchored `i`
        regex is still NOT index-backed → full collection scan. Fine for a few hundred
        posts; leave a comment to revisit (e.g. restore `$text` as a whole-word fast
        path, or a dedicated search index) only if the corpus grows into the thousands.

- [ ] **Karte — viewport-filtered list, „X weitere…" hint, and bidirectional
      hover-highlight.** Today `MapPage.svelte` loads ALL points (`api.publicMap()`),
      drops every marker, and lists every post in the side panel — no viewport
      awareness, clustering, or map↔list link. **DECISIONS (no new dependency):**
      (a) **viewport-filtered side list** — the list shows only posts whose marker is
      within the current map bounds; recompute on `moveend`/`zoomend`. (b) when many
      remain off-screen, show the visible subset **+ a „X weitere… (heranzoomen)"
      hint** (NOT clustering, NOT a paginated list). (c) **bidirectional
      hover-highlight** — hovering a side-list item highlights its map marker and vice
      versa (only when the marker is in the visible list). (d) nudge/offset overlapping
      pins slightly so co-located markers are distinguishable. Pure frontend on the
      reader Karte; `MapPage` and the editor `MapPicker` share no map util (independent
      Leaflet setups) so this doesn't touch the editor. TDD the viewport-filter +
      highlight-link logic (extract the bounds-filter into a testable helper).
      - [X] **Risk (HIGH — data) — DONE (Phase 1 #1, 2026-06-01):** the WP cutover
        imported geo-less posts with PLACEHOLDER coords `lat:0, lng:0` / `country:'XX'` /
        `placeName:'Unbekannt'`, and `GET /api/public/map` did NOT filter them, piling
        every imported post at Null Island and stretching `fitBounds`. **Fixed:**
        `/api/public/map` now partitions the published set with `LOCATED_MATCH`
        (`country≠'XX'` AND not `lat:0,lng:0`) vs `UNLOCATED_MATCH`, returns
        `{ points, unlocatedCount }`; `MapPage` shows „N Beiträge ohne Ort" (singular
        „1 Beitrag ohne Ort") instead of fake markers, so only real points reach
        `fitBounds`. TDD: backend `public.int.test.ts` + frontend `MapPage.test.ts`.
        This unblocks the viewport feature above. (Still a nudge to fill real geo via
        the per-post map picker / the big-map-modal item below.)
      - ⚠ **Risk (MED — perf):** recreating hundreds of Leaflet markers on every
        `moveend`/`zoomend` will jank on weaker devices. **Address:** build the marker
        layer ONCE, keep marker instances in a `Map<id, marker>`, and on map-move only
        recompute the visible-id set + toggle a highlight CSS class — never tear down
        and rebuild markers. Drive hover-highlight off enter/leave events, not
        mousemove.

- [ ] **Editor — „Auf großer Karte wählen" modal (deferred-confirm location picker).**
      The inline `MapPicker.svelte` (240 px) sets the location **immediately** on
      click; fine for most cases but cramped for precise picks. **DECISION: keep the
      small inline picker AND add a button „Auf großer Karte wählen"** that opens a
      **large map + search modal** where clicks set only a **provisional** marker;
      the location is applied to the post only on **„Standort übernehmen"** and
      discarded on **„Abbrechen"** (modal closes without changing anything). Reuse the
      Nominatim `geocode`/`reverseGeocode` (`lib/nominatim.ts`) + `fillMissingPlace`
      auto-fill on confirm (only-when-empty, same as the inline picker). Mind the
      `z-index: 2000` modal convention (above Leaflet's 1000) already used in
      `PostEditor.svelte`. Wording is provisional — adjust if you prefer. Pure
      frontend; factor the shared map/search/geocode bits so the modal and the inline
      picker don't duplicate logic. TDD.
      - ⚠ **Risk (HIGH — impl):** the classic Leaflet-in-modal bug — a map initialised
        while its container is `display:none`/zero-size (i.e. before the modal opens)
        renders grey/half-drawn tiles and a wrong center until `invalidateSize()` runs.
        **Address:** create the map only AFTER the modal is in the DOM with real
        dimensions, and call `map.invalidateSize()` on open (after `await tick()` / once
        the container is measured); re-`fitBounds`/recenter on the provisional marker
        right after.
      - ⚠ **Risk (MED — regression):** refactoring the map/search/geocode out of the
        working inline `MapPicker` to share it risks breaking the inline picker (which
        is on the critical post-save path). **Address:** prefer a small shared module
        (`lib/nominatim` already exists; add a thin map-init helper) consumed by BOTH,
        rather than rewriting `MapPicker`; keep the inline picker's existing tests green
        and add modal tests. Mind Nominatim's ~1 req/s usage policy — debounce the
        modal search like the inline one.

### Editor UX + permissions (found during dev testing 2026-05-30)

- [X] **Confirm before deleting a block/element — DONE (Phase 1 #3, 2026-06-01).**
      `BlockEditor.remove()` now calls `globalThis.confirm(`${label} entfernen?`)`
      (naming the block type, e.g. „Galerie entfernen?") before splicing — matching the
      existing `PostList` delete-confirm convention. TDD in `BlockEditor.test.ts`
      (confirm → removes; decline → unchanged). German strings inline.
- [X] **Free a deleted element's images for re-selection — DONE (Phase 3 #5,
      2026-06-01).** Root cause: the picker's `orphansOnly` view comes from the SERVER
      (`imageIdsInUse`, GLOBAL across all posts/covers/Settings backgrounds), which
      still counts the post being edited — so a block's images stayed hidden until
      re-save, and inverting the client `excludeIds` couldn't surface them (the server
      simply didn't return them). **Fix (global-safe, not a blind invert):** added an
      optional `excludePostId` to `GET /api/images` (`imageListQuerySchema`); when the
      orphan filter is on, `imageIdsInUse(excludePostId?)` discounts ONLY that post's
      own persisted refs (`Post.find({ shortId: { $ne } })`), so images dropped from
      the edited post surface as orphans while ones still pinned by any OTHER post,
      cover or settings background stay hidden. `ImagePicker` forwards the prop;
      `PostEditor` passes `excludePostId={editId}`. The existing client `excludeIds`
      (live session refs) still hides images currently placed, so still-used ones never
      reappear. TDD: shared `api.test.ts`, backend `images.int.test.ts` (frees own /
      keeps used-elsewhere), frontend `ImagePicker.test.ts`. The delete-guard
      (`postsReferencingImage`+settings) is untouched, so nothing in-use can be deleted.
- [X] **Make blog-level "Einstellungen" admin-only — but KEEP "Passwort ändern" for
      everyone — DONE (Phase 3 #6, 2026-06-01).** Frontend: `Settings.svelte` wraps only
      the blog-branding `<form>` (Seitentitel/Akzentfarbe/Hintergrundbilder + Speichern)
      in `{#if auth.isAdmin}`; the „Passwort ändern" section stays always rendered, and
      the nav link/route stays visible to everyone. Backend (defense in depth):
      `PUT /api/settings` gained `hooks.requireRole('admin')` (now
      `[requireAuth, requireCsrf, requireRole('admin')]`, the same gate as the Nutzer
      routes) → a non-admin PUT is 403. **The GET stays `requireAuth`-only** (not
      admin-gated) so authors still reach their password form, and reader branding is
      unaffected (separate unauthenticated `GET /api/public/settings`). TDD: backend
      `admin.int.test.ts` (admin persists / editor 403 / GET open) — and the
      `images.int.test.ts` settings-background test flipped to an admin agent for its
      PUT; frontend `Settings.test.ts` (form hidden for editor, shown for admin,
      password form present for both).

- [X] **"loki-query" skill — DONE as a generic `cluster-debug` user-level skill.**
  Created `C:\Users\Dev\.claude\skills\cluster-debug\SKILL.md` (user level, NOT in
  this repo — works across every workload on the home-lan k3s cluster). Covers Loki
  (`http://192.168.178.210/loki/api/v1/`) + Prometheus
  (`http://192.168.178.210/prometheus/api/v1/`) over the gateway, no-jq/no-kubectl
  curl+grep parsing, Git-Bash ns-timestamp helpers, runtime namespace/label
  discovery, LogQL + PromQL patterns, the shared `platform-*` namespace cheat-sheet,
  and a hypothesis-driven workflow. Kept generic at the user's request; adapted from
  the Optrix `debug-optrix` skill (Optrix-specific debug endpoints/topology dropped).

- [ ] **Improve user-create error message (UX polish, low priority — ok to leave as is for now).**
  The "Nutzer" form shows a generic *"Anlegen fehlgeschlagen."* on any failure.
  Make it distinguish the real cause — e.g. "Passwort muss mindestens 8 Zeichen
  lang sein." (password `min(8)`, `packages/shared/src/api.ts`) vs.
  "Benutzername bereits vergeben." (409 conflict). TDD; German strings, inline.
  Not part of the cutover — treat as a separate post-cutover polish task.

- [X] **Cover the SPA back-button in the unsaved-changes guard — WON'T DO.** The v0.5.0
      guard (`lib/navGuard.ts`) protects in-app nav + full reload/close (`beforeunload`)
      but not the SPA back button (documented gap, `navGuard.ts:11-12`). Decided
      2026-06-01 to leave it: a `hashchange`/`popstate` re-push hack is fiddly and
      error-prone for a rare edge case, and the existing coverage handles the common
      ways edits are lost. Accepted as a known limitation.

### CI / release maintenance

- [X] **Bump the `docker/*` actions off Node 20 — DONE in THIS repo (Phase 2 #4,
      2026-06-01).** `release.yml` bumped to the Node-24 majors:
      `docker/login-action@v4`, `docker/metadata-action@v6`,
      `docker/setup-buildx-action@v4`, `docker/build-push-action@v7` (each action's
      v4/v6/v7.0.0 introduced `runs.using: node24`, requiring Actions Runner ≥2.327.1 —
      GitHub-hosted `ubuntu-24.04-arm` is fine). Also bumped `e2e.yml`
      `actions/upload-artifact@v4 → @v6` (v6 = Node 24; v4 was Node 20, v5 only
      preliminary). `actions/checkout@v5` + `actions/setup-node@v5` were already Node 24.
      Kept floating major tags to match repo style (SHA-pinning = optional future
      hardening). GitHub forces Node 24 on 2026-06-16, removes Node 20 on 2026-09-16.
      - [X] **Deploy repo `kube-at-home-travelblog` `image-bump.yml` — VERIFIED CLEAN
        2026-06-01.** Its only `uses:` is `actions/checkout@v5` (already Node 24); every
        other step is a shell `run:` (curl/jq/gh/git/sed), unaffected by the Node-20
        JS-action deprecation. Nothing to bump there.

### Cutover (#21) — DONE 2026-06-01

- [X] Dev trial import: `npm run import-wp -- --dry-run` → review `migration-report.json`
      → bounded live trial `--limit N` → review in reader + admin on dev.
      **DONE & VERIFIED 2026-05-31.** Dry-run against `https://reisen.caroundalex.de`
      (237 posts → 8422 blocks, 5456 used images, 0 skipped, `largeImages:[]`);
      bounded `--limit=5` live trial against `https://dev-reisen.caro-alex.de` —
      5/5 posts published on original dates, all images over the Cloudflare tunnel,
      covers + content + galleries serve as WebP. Importer hardened along the way
      (SSE chunk-split fix, retry/backoff, gallery coalescing, resumable dedup
      manifest, live progress). Details in memory `wp-import-plan`.
- [X] Prod full WP import (published posts on original dates). **DONE 2026-06-01.**
- [X] **Raise the prod CPU limit to 2 cores** (deploy repo `kube-at-home-travelblog`,
      `environments/prod/app/`, NOT this repo). Rationale: dev-import profiling
      (2026-05-31) showed import speed is bound by the single-core sharp→WebP
      transcode (~0.65–0.77 s/image, the awaited SSE `done`); CPU peaked ~0.57 of the
      1-core limit, memory flat ~29%, network trivial. The Pi nodes have 4 cores, so
      lifting the per-pod limit to 2 lets sharp use more threads per transcode and
      cuts per-image time — the cheapest speedup for the ~5,456-image prod run
      (~75 min of transcoding at 1 core) without touching the (sequential) importer.
      Do BEFORE the prod full import. App-repo change = none.
- [X] Enable deploy-repo GitHub setting: Settings → Actions → General → Workflow
      permissions → "Allow GitHub Actions to create and approve pull requests".
      **DECIDED 2026-05-31: leave OFF, keep the manual-PR path.** The auto-bump
      workflow still pushes branch `automated/bump-dev-image-X.Y.Z` with the
      correct one-line change; open + merge that PR yourself (Actions can't). The
      `travelblog-release` skill documents the recovery.

### S3 image upload — RESOLVED

- [X] **"Access Denied" on upload — MinIO policy not bound to the user.** DIAGNOSED
  via `mc`: bucket + policy + user all existed, but `mc admin user info` showed
  `PolicyName:` EMPTY / `MemberOf: []` — the `users[].policy` binding (declared in
  git) never took. Known chart bug — minio/minio
  [#17492](https://github.com/minio/minio/issues/17492) (race: user created without
  policy attached) + `set +e` in `_helper_create_user.txt`
  ([#16897](https://github.com/minio/minio/issues/16897)) swallowing the attach
  failure; `mc admin policy attach` non-idempotent
  ([minio/mc #4863](https://github.com/minio/mc/issues/4863)). FIX: re-ran the
  platform-minio Argo PostSync (plain Sync + Server-Side Apply, FORCE OFF — `--force`
  is incompatible with `--server-side`), which re-ran `make-user` and attached the
  policy. Verified `PolicyName: travel-blog-dev`; image upload works on dev. Durable
  via git (intent already correct); no platform-repo change needed.

## Improvements

Post-cutover polish ideas from dev testing (2026-05-30). All TDD, 80% gate,
German UI strings inline. Grouped by effort. None block the cutover.

**First batch A–G: ALL DONE 2026-05-30** (per-post cover + blog backgrounds landed
this session as `7ae5d2c`, released `v0.2.0`, rolled to dev; the rest committed
earlier `3973b83`…`cbad267`). User confirmed F+G working on dev.

### Round 2 — DONE 2026-05-30 (H + I, built together TDD)

- [X] **H — Edit / replace the image selection in image & gallery blocks.**
      `BlockEditor.svelte` now has a **"Bild ändern"** button (image branch →
      re-opens `pickImage`, replaces `block.imageId`, keeps existing on cancel) and a
      **"Galerie bearbeiten"** button (gallery branch → re-opens `pickGallery`
      pre-selecting `block.imageIds`, replaces them, keeps existing on cancel/empty).
      Pure frontend. (`BlockEditor.test.ts` +6.)
- [X] **I — Context-aware "Nur unbenutzte" (orphansOnly) default — option (b).**
      `ImagePicker.svelte` gained `initialOrphansOnly?` + `initialSelected?` props
      (seeded via `untrack`). `PostEditor.svelte` bridge `openPicker(mode, opts?)`
      forwards `{orphansOnly, selected}` → picker. Defaults: **fresh insert →
      `orphansOnly:true`** (BlockEditor `+ Bild`/`+ Galerie`, fresh cover, Settings
      backgrounds); **edit/replace → `orphansOnly:false`** ("Bild ändern", "Galerie
      bearbeiten" + `selected`, changing an existing cover) so the current image
      stays visible. Pure frontend, no schema change. (+ImagePicker/Settings/
      MetadataSidebar/PostEditor tests.) Plan in memory `project_round2-hi-plan.md`.
      Full suite 453 pass (+12), typecheck + eslint clean. NOT yet committed.

### Small — pure frontend, isolated

- [X] **Show selected-image count in the image picker.** `ImagePicker.svelte`
      renders `{selected.length} ausgewählt` in the footer. (`3973b83`/`6abee57`)
- [X] **Gallery thumbnails in the editor.** `BlockEditor.svelte` gallery branch
      renders the `imageIds` as a thumb grid via `imageUrl(id, 'thumb')`. (`a97df87`)

### Small–Medium — one self-contained component

- [X] **Gallery lightbox / overlay viewer.** Overlay with index state, ◀/▶, Esc/✕,
      focus trap + body-scroll lock + neighbor preload. (`29cb8a6`)

### Medium — shared schema + renderer + editor + search

- [X] **Gallery caption/subtitle.** Optional `caption` on `galleryBlockSchema`,
      `<figcaption>` in `GalleryBlock.svelte`, editor input, and indexed into
      `blocksToSearchText`. (`4127be9` + `9acc71f`)

### Medium — full-stack, several layers each

- [X] **Upload multiple images at once.** `multiple` input, one POST per file with
      its own SSE, a list of `UploadProgress` rows, client concurrency cap. (`cbad267`)
- [X] **Optional per-post cover image (thumbnail for list/archive/landing views).**
  - [X] `coverImageId` on the `Post` model + shared create/update DTOs + post DTO.
  - [X] Cover picker in the editor metadata sidebar (built from scratch — the prior
        plan's claim that it already existed was wrong).
  - [X] `PostCard` prefers it; fallback: first `image` block → else first id of the
        first `gallery` block → else none.
  - [X] `imageIdsInUse` / `postsReferencingImage` also count `coverImageId`; a
        cover-only image is a non-orphan and returns 409 on delete (tested).
- [X] **Blog-level images (1–n) selectable by the admin** (store + admin UI now;
      background rendering deferred).
  - [X] `backgroundImageIds: string[]` on the `Settings` singleton + settings DTO.
  - [X] Multi-select (ImagePicker modal) in the Settings admin page.
  - [X] Refcount counts `Settings.backgroundImageIds`; a background-only image is a
        non-orphan and returns 409 on delete (tested).

## Done

### Editor bugs / readiness found during dev testing (2026-05-30)

- [X] **S3 image upload "The Access Key Id you provided does not exist"**
  (MinIO `InvalidAccessKeyId`). Cause: the `S3_ACCESS_KEY` in the deploy-repo
  `travel-blog-secrets` didn't match the MinIO user. USER fixed + pushed
  (`05b8905`); Argo re-synced. Environment-side, no app change.
- [X] Image-picker modal rendered BEHIND the Leaflet location-picker map —
  `.modal` had no z-index; Leaflet controls sit at 1000. Added `z-index: 2000`
  to `PostEditor.svelte` (commit `c86a902`). Shipped in v0.1.3.
- [X] **Multi-pod readiness:** image-upload progress hub was in-process
  (Map + EventEmitter) → with `replicas: 2` the upload pipeline and the SSE
  progress stream could land on different pods → false "Fehler" (image still
  stored). Replaced with a Redis-backed hub (per-upload list history replayed to
  late subscribers + pub/sub live fan-out, TTL'd; same interface, now async; TDD
  with a cross-pod test; commit `6e2d742`). Sessions/CSRF/login-rate-limit were
  already Redis-backed (multi-pod safe); Mongo/S3 external. Shipped in v0.1.3.
- [X] Title/Untertitel editable in both the post body AND the metadata sidebar —
  NOT a bug. Metadata title/subtitle = canonical post heading (H1, used in
  lists/archive); Title/Subtitle BLOCKS = optional in-body headings (H2/H3).
  Matches target-picture §data-model. (Possible later UX: clearer labels/help text.)

### Cutover (#21) — completed

- [X] Promote BOTH envs to image `0.1.3`: dev (`91bdaac`) + prod (`a61b841`,
      was on `0.1.0` = Redis bug — clears prod's Argo red; prod empty / no traffic).
- [X] Disable Cloudflare managed robots.txt / content-signals on `caro-alex.de`
      (per user — robots.txt now serves only `User-agent: * / Disallow: /`).
- [X] noindex / robots.txt (target-picture §11): `X-Robots-Tag: noindex, nofollow`
      on every response + disallow-all `/robots.txt` (`src/robots.ts`, TDD) → v0.1.2.
      Header + robots.txt verified live on dev.
- [X] Redis Sentinel auth fix (`sentinelPassword`) → v0.1.1.
- [X] Pod securityContext numeric `runAsUser`/`runAsGroup` (fixes CreateContainerConfigError).
- [X] Dev deploy healthy (full Mongo + Redis + S3 stack; login as tb-admin works).
- [X] Release pipeline + GHCR image public; Dockerfile (linux/arm64, slimmed).
- [X] Deploy repo scaffold + SOPS secrets; platform Mongo/MinIO provisioning; Argo registration.
- [X] App phases 0–9 (harness, types, persistence, auth, APIs, frontend, E2E, WP importer,
      SPA serving + first-admin bootstrap) — all green, ≥80% coverage.
