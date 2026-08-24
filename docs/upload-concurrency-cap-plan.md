# Cap image-pipeline concurrency + bound the upload backlog

Status: **implemented** in the app repo (backend + frontend). The deploy-repo
memory bump and the dev→prod rollout are tracked separately (see Rollout).

## Background — the incident (prod, 2026-08-23)

A batch photo upload to prod partially failed with client-side connection
errors. Cluster-log investigation established:

- Uploads ran 12:08–12:33; `POST /api/images/upload` requests arrived in dense
  bursts of **17–32 within a single 10-second window** (the client parallelises
  a multi-photo selection — this happens even uploading one phone at a time).
  The burst totalled **113 uploads**.
- **Both replicas were OOMKilled** (`kube_pod_container_status_last_terminated_reason=OOMKilled`,
  one restart each) against the **768 MiB** container limit. In-flight requests
  on a pod at the moment it was killed had their TCP connections reset → the
  connection errors the user saw.
- No app-level error logs (`level>=50`) — consistent with a kernel `SIGKILL`.
- **Not a permanent memory leak.** Within a burst memory is a staircase (climbs,
  reclaimed only slowly), but it returns to an ~85 MiB idle baseline between
  sessions. The OOM is explained by burst concurrency of memory-heavy work
  against a small limit — latent margin this burst finally crossed (larger phone
  images + a recent per-image EXIF parse + a bigger/faster burst).

## Root cause in the code

`packages/backend/src/routes/images.ts`: the HTTP handler returned `202` in
milliseconds and ran the memory-heavy pipeline (`processImage` → sharp decode +
two resizes) **detached** (`void runPipeline(...)`). Concurrency was therefore
*not* bounded by request duration — N simultaneous uploads spawned N concurrent
sharp decodes (~40 MB raw bitmap each for a 12 MP phone photo), and nothing
bounded how many accepted-but-unprocessed uploads piled up holding their
original buffers. That is what exhausted the 768 MiB limit.

Goal: make backend memory a function of a fixed cap, **independent of client
burst rate**, so a burst queues gracefully instead of OOM-killing the pod.

## What changed (two ceilings + honest UX)

1. **Concurrency ceiling** — a process-wide async semaphore
   (`packages/backend/src/lib/semaphore.ts`) bounds how many `runPipeline`
   executions run at once. Env `IMAGE_PIPELINE_CONCURRENCY`, default **3**.
2. **Backlog ceiling** — a closure-scoped counter in `registerImageRoutes`
   caps accepted-but-unprocessed uploads; when saturated the route replies
   **429 + `Retry-After: 2`** so the client backs off, bounding the memory held
   by queued original buffers. Env `IMAGE_UPLOAD_MAX_BACKLOG`, default **32**.
   The counter is checked-and-incremented **synchronously** (no `await` between
   the check and `++`), so it is a firm ceiling, not a racy one, and decrements
   in the pipeline's `.finally` (run) and the handler's `catch` (pre-run error).
3. **Queued UX** — a `{ type:'progress', pct:0 }` event is published *before*
   slot acquisition. It keeps the Redis progress key's TTL warm and drives a
   visible **"In Warteschlange…"** state. Modeled as a plain progress event so
   it flows through the existing SSE handler with no progress-schema or
   route-guard change (a new `type:'queued'` would trip the SSE termination
   guard and the read-back zod parse).
4. **Client backoff** — `ImagePicker.svelte`'s upload worker retries a 429 with
   capped exponential backoff + jitter (base 500 ms × 2^attempt, capped ~5 s,
   ~5 attempts) instead of marking the file failed. This closes the feedback
   loop: the 3 client workers self-throttle to the server's drain rate.
5. **`sharp.concurrency(1)`** — pinned once in `buildApp`. Otherwise each of the
   N pipelines spawns `cores` libvips threads, multiplying CPU/memory. Tune to 2
   only if single-image latency regresses.
6. **Headroom** — bump the pod memory limit to 1.25 GiB in the deploy repo (below).

Worst-case backend memory after this change (using the 20 MB `MAX_UPLOAD_BYTES`
ceiling): `32 buffers × 20 MB (≈640 MB) + 3 pipelines (≈200 MB) + ~150 MB
baseline ≈ 990 MB` — under the 1.25 GiB limit with ~26% headroom, and the 429
gate makes it a hard bound rather than a hope.

## Tests

- **Unit** `packages/backend/src/lib/semaphore.test.ts`: never exceeds `max`
  concurrent; drains the full queue; releases the slot on `fn` throw; FIFO
  waiter order.
- **Backend integration** `packages/backend/tests/integration/upload-concurrency.int.test.ts`:
  mocks `processImage` with a barrier that records peak concurrency. Fires
  M > N uploads → peak concurrent pipelines ≤ N and every upload reaches `done`;
  fires > backlog uploads with stalled pipelines → excess get **429 +
  Retry-After** and the counter returns to 0 after drain (a later burst is
  accepted again).
- **Config** `config.test.ts`: defaults (3 / 32) + override parsing.
- **Frontend** `ImagePicker.test.ts` (429 → retried, ends non-errored) and
  `UploadProgress.test.ts` ("In Warteschlange…" at `pct:0`).

## Memory limit bump (deploy repo)

Separate change in the **private deploy repo `kube-at-home-travelblog`** (local
clone under `C:\dev\`, edit locally — do not use the GitHub API; Argo CD
reconciles). In `base/app/deployment.yaml`: travel-blog container memory
**limit 768 Mi → 1.25 Gi**; request stays **256 Mi**. The limit sits ~26% above
the ~990 MB hard bound (headroom for GC lag and HEIC decode spikes) and, not
being a scheduler reservation, costs the cluster nothing; the request tracks
steady-state so it does not over-reserve. Cluster check (2026-08-24): 3× Pi 5
nodes, ~15.8 GiB allocatable each, ~39% of memory currently reserved — ample
room for 2 replicas per env. Both dev and prod inherit this from base.

## Rollout / de-risking

1. ✅ Implement behind the two env vars via TDD (this change).
2. ✅ Ship to **`travelblog-dev`** first and replay a burst — see *Dev
   validation* below.
3. ✅ Apply the memory bump in the deploy repo (both envs, via `base`); verify on
   dev; then promote the image tag to **prod** via the `travelblog-release` flow.

## Dev validation (2026-08-24)

Released as `v0.14.0`; two identical 60-image bursts against `travelblog-dev`
(high-megapixel iPhone JPEGs), watching
`container_memory_working_set_bytes{namespace="travelblog-dev",container="travel-blog"}`.

| | Burst 1 — **768 Mi** limit | Burst 2 — **1.25 Gi** limit |
|---|---|---|
| Peak / pod | ~649 (survivor) / **>768 → OOMKilled** | **686 / 677 MiB** |
| Restarts | 1 (OOM) | 0 |
| UI errors | 10+ "Verbindung unterbrochen" | none |
| 429 gate | never fired | never fired |
| Limit utilisation | crossed 100% → kill | ~54% |

Findings:

- **The true peak for a 60-image burst is ~650–800 MiB**, varying with how the
  heaviest decodes align on a pod. That band straddles 768 Mi, so burst 1 was a
  coin-flip: one pod landed at 649 and lived, the other crossed 768 and was
  OOMKilled — its connection resets surfaced as non-recovering
  "Verbindung unterbrochen" SSE errors (same class as the prod incident). At
  1.25 Gi both pods peaked ~685 and drained cleanly (slow reclaim 633→617 over
  ~3 min — the expected staircase release, not a leak).
- **Both fixes were load-bearing, neither alone sufficed at 768 Mi.** The
  concurrency cap *bounds* the peak to ~685 MiB (without it, 60 parallel decodes
  blow past any limit — the original incident); the memory bump provides the
  headroom over that bounded peak. 768 Mi was simply below the bounded worst case.
- **The 429 backlog gate never engaged** in either burst — one browser's 3 upload
  workers never pile up 32 accepted uploads. It is defence-in-depth (and what
  makes worst-case memory a *hard* bound for adversarial/multi-client bursts),
  but the concurrency cap + headroom are what carried this workload.

Available levers if a heavier burst ever crowds the limit (not currently needed;
~595 MiB margin at 1.25 Gi): drop `IMAGE_PIPELINE_CONCURRENCY` to 2 (cuts per-pod
decode peak ~⅓, env-only), or raise the limit toward 1.5 Gi (not reserved).

Known follow-up (not blocking): the client (`packages/frontend/src/lib/uploads.ts`)
treats any SSE `onerror` as terminal, so a transient stream drop (rollout, network
blip) permanently red-marks an upload that may have succeeded server-side. Make it
tolerate/reconnect on SSE error.

## Risk summary

Low-to-moderate; worst realistic outcome is *queued/slow uploads or transient
429s*, not data loss. Reversible (backend image tag + a values change).

1. **Slot/counter leak → stall or spurious 429.** Mitigated: semaphore releases
   in `finally`; backlog counter decrements in `.finally` (run) and `catch`
   (pre-run). Covered by release-on-throw tests.
2. **Backlog too low → 429 churn.** 32 is tunable via env; the memory math
   leaves headroom to raise it. Client backoff absorbs churn.
3. **`sharp.concurrency(1)` slows single-image latency.** Global; tune to 2.
4. **Per-pod, not global.** Effective concurrency = N × replicas; correct for
   bounding per-pod memory, not a global rate limit.
