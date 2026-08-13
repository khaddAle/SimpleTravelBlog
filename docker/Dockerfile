# syntax=docker/dockerfile:1
#
# Single application image (linux/arm64 only — see CLAUDE.md). Multi-stage:
# build the monorepo with full deps, then ship a slim runtime carrying only the
# built backend, the built SPA, and production node_modules. The workspace layout
# is preserved in the runtime so the `@stb/shared` symlink in node_modules
# resolves; the server is pointed at the built SPA via FRONTEND_DIST.

# --- build: install all deps, build shared -> frontend -> backend, prune ------
FROM node:24.19.0-bookworm-slim AS build
WORKDIR /app

# Toolchain for native module rebuilds (argon2's source fallback). Lives only in
# this stage and never reaches the runtime image.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Install against the lockfile from the manifests first for better layer caching.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/backend/package.json packages/backend/
COPY packages/frontend/package.json packages/frontend/
RUN npm ci --ignore-scripts

# --ignore-scripts skipped native binary setup; wire up sharp + argon2 for arm64.
RUN npm rebuild sharp argon2

# Build order (shared -> frontend -> backend) is enforced by the root script.
COPY . .
RUN npm run build

# Drop devDependencies. Production deps remain — including the native sharp/argon2
# binaries and the @stb/shared workspace link — so the runtime node_modules is
# self-contained.
RUN npm prune --omit=dev

# --- runtime: slim image carrying only the built app + prod node_modules ------
FROM node:24.19.0-bookworm-slim
ENV NODE_ENV=production \
    PORT=4000 \
    FRONTEND_DIST=/app/packages/frontend/dist

# No image libraries are apt-installed: sharp's prebuilt binary statically bundles
# its own libvips — including the HEIF/HEVC decoder (libheif + libde265) and WebP —
# under node_modules/@img, so the system libvips42 was never loaded and only dragged
# in heavy transitive deps (imagemagick, poppler, librsvg, …). Dropping it slims the
# image substantially; HEIF decode is re-verified by the container smoke test.

WORKDIR /app

# Preserve the workspace layout so node_modules/@stb/shared -> packages/shared
# resolves at runtime.
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared/package.json ./packages/shared/
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/backend/package.json ./packages/backend/
COPY --from=build /app/packages/backend/dist ./packages/backend/dist
COPY --from=build /app/packages/frontend/dist ./packages/frontend/dist

EXPOSE 4000
USER node

# Liveness probe hits the dependency-free /healthz route via Node's global fetch.
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

WORKDIR /app/packages/backend
CMD ["node", "dist/server.js"]
