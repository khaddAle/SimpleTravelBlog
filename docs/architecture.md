# Architecture

Skeleton created in Phase 0; data model and sequence diagrams are filled in as
the corresponding phases land.

## Runtime topology

```mermaid
flowchart LR
  R[Reader Browser] -->|HTTPS| CF[Cloudflare]
  E[Editor Browser] -->|HTTPS| CF
  CF -->|Tunnel| CFD[cloudflared Deployment]
  CFD -->|HTTP :4000| SVC[travel-blog Service]
  SVC --> P1[Pod replica 1]
  SVC --> P2[Pod replica 2]
  P1 & P2 --> MGO[(MongoDB<br/>platform-database)]
  P1 & P2 --> RDS[(Redis Sentinel<br/>platform-cache)]
  P1 & P2 --> S3[(MinIO bucket<br/>platform-storage)]
  P1 & P2 -->|stdout JSON| PT[Promtail → Loki]
  CR[Backup CronJob] -->|mc mirror| S3
  CR -->|restic| NAS[(NAS)]
```

## Repo / delivery topology

```mermaid
flowchart TB
  subgraph SRC[SimpleTravelBlog source repo - public]
    CODE[packages/backend + frontend + shared]
    GHA[.github/workflows]
  end
  subgraph DEP[the private deployment repo - private]
    KUST[base/ + environments/dev,prod/]
    APPSET[argocd/appsets/]
  end
  subgraph BOOT[the cluster bootstrap repo - already exists]
    ROOT[argocd/apps/travelblog-root.yaml]
  end
  GHA -->|build+push| GHCR[(ghcr.io/khaddAle/simple-travel-blog)]
  GHA -->|gh pr| DEP
  ROOT -->|tracks| DEP
  DEP -->|tag bump| ARGO[Argo CD]
  ARGO -->|sync| CLUSTER[k3s cluster]
```

## Request flow

### Auth (login → CSRF-protected mutation → logout)

Sessions live in Redis (`sess:<sid>` → `{userId, csrfSecret}`); the session id is
delivered as a signed, HttpOnly, SameSite=Lax cookie. CSRF uses a double-submit
token: the per-session `csrfSecret` is mirrored into a readable `csrf` cookie and
must be echoed in `X-CSRF-Token` on mutations (verified constant-time against the
session). Login is rate-limited per `<username>:<ip>` (6 failures / 15 min → 429).

```mermaid
sequenceDiagram
  participant B as Browser
  participant F as Fastify
  participant M as Mongo
  participant R as Redis
  B->>F: POST /api/auth/login { username, password }
  F->>R: isLoginLimited(user:ip)?
  F->>M: User.findOne({ username })
  F->>F: argon2.verify(hash, password)
  alt success
    F->>R: clearLoginFailures · SET sess:<sid> {userId, csrfSecret} EX ttl
    F-->>B: 200 + Set-Cookie sid (HttpOnly) + csrf (readable)
  else fail
    F->>R: INCR loginfails:<user>:<ip> (EX 900 on first)
    F-->>B: 401 (or 429 once ≥6)
  end
  Note over B,F: later mutation
  B->>F: POST /api/... (sid cookie + X-CSRF-Token header)
  F->>R: GET sess:<sid>
  F->>M: User.findById (reject if missing/deactivated)
  F->>F: timingSafeEqual(session.csrfSecret, header)
  F-->>B: 200 / 401 (no session) / 403 (bad CSRF)
```

> The image-pipeline sequence diagram is added in Phase 5.

## Data model

Mongoose models (`packages/backend/src/db/models/`). Posts carry an ordered
`Block[]` (the discriminated union from `@stb/shared`, validated on save) and a
denormalized German-language `searchText` rebuilt from title/subtitle/placeName +
block text on every save (german `$text` index).

```mermaid
erDiagram
  USER ||--o{ POST  : authors
  USER ||--o{ IMAGE : uploads
  TRIP ||--o{ POST  : groups
  POST }o--o{ IMAGE : references

  USER {
    string username "unique, lowercased"
    string passwordHash "argon2id"
    enum   role "admin | editor"
    date   deactivatedAt "nullable"
  }
  POST {
    string shortId "unique 6-char"
    string title
    string subtitle "optional"
    mixed  blocks "Block[] (shared union)"
    date   postDate
    string country "ISO alpha-2"
    string placeName
    number lat
    number lng
    objectId tripId "optional, indexed"
    enum   status "draft | published"
    objectId authorId
    date   publishedAt "set on first publish"
    string searchText "denormalized, german text index"
  }
  TRIP {
    string shortId "unique"
    string name "unique"
  }
  IMAGE {
    string shortId "unique"
    string originalFilename
    string mime
    string displayKey "webp <=1600px"
    string thumbKey "webp <=400px"
    number width
    number height
    objectId uploaderId
  }
  SETTINGS {
    string _id "singleton 'site'"
    string siteTitle
    string accentColor "#rrggbb"
    string logoKey "optional"
  }
```

Indexes: `User.username` unique · `Post.shortId` unique, `postDate -1`,
`country`, `tripId`, `searchText` text (german) · `Trip.shortId`+`name` unique ·
`Image.shortId` unique.

### Infrastructure adapters
- **Redis** (`src/redis/`): Sentinel-aware client factory; session store
  (`sess:<sid>` → `{userId, csrfSecret}`, sliding TTL) and login rate limiter
  (`loginfails:<user>:<ip>`, windowed counter).
- **Object storage** (`src/storage/s3.ts`): MinIO/S3 wrapper (put/get/delete),
  client injectable for tests.
- **Config** (`src/config.ts`): zod env schema, fail-fast at boot.
