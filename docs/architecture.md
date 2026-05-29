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

> Auth + image-pipeline sequence diagrams are added in Phase 4 / Phase 5.

## Data model

> Mongoose model ERD is added in Phase 3. Models: User, Post, Trip, Image,
> Settings (singleton). Posts carry an ordered `Block[]` (discriminated union
> defined in `@stb/shared`) and a denormalized German-language `searchText`.
