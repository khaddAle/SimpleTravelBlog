# TODO

Human/AI-readable task list for SimpleTravelBlog. `[ ]` = open, `[X]` = done.
Newest open items live near the top of "Open"; the bigger picture (phases) is in
the plan and the per-phase memory note.

## Open

- [ ] **Create a "loki-query" skill** so Claude can read cluster logs directly
  (app + MinIO + platform pods) when diagnosing deploy/runtime issues, instead of
  round-tripping `kubectl logs` through the user. Constraints on this box: NO
  `kubectl`/`jq` — must use Loki's HTTP API via `curl` + `grep`/`sed` (LogQL
  `query_range` endpoint). Skill should cover: the Loki base URL/how it's reached
  from this workstation (port-forward? ingress? tunnel? — TBD with user), auth if
  any, a couple of canned LogQL queries (e.g. `{namespace="travelblog-dev",
  app="travel-blog"}`, `{namespace="platform-storage"}`), and time-range handling.
  Decide endpoint exposure with the user before writing it. Would have made the
  S3 `Access Denied` diagnosis a direct log read.

- [ ] **Improve user-create error message (UX polish, low priority — ok to leave as is for now).**
  The "Nutzer" form shows a generic *"Anlegen fehlgeschlagen."* on any failure.
  Make it distinguish the real cause — e.g. "Passwort muss mindestens 8 Zeichen
  lang sein." (password `min(8)`, `packages/shared/src/api.ts`) vs.
  "Benutzername bereits vergeben." (409 conflict). TDD; German strings, inline.
  Not part of the cutover — treat as a separate post-cutover polish task.

### Cutover (#21) — remaining

- [ ] Dev trial import: `npm run import-wp -- --dry-run` → review `migration-report.json`
      → bounded live trial `--limit N` → review in reader + admin on dev.
- [ ] Prod full WP import (published posts on original dates).
- [ ] Enable deploy-repo GitHub setting: Settings → Actions → General → Workflow
      permissions → "Allow GitHub Actions to create and approve pull requests"
      (so future auto-bump PRs open cleanly; dev bumps pushed directly for now).

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
