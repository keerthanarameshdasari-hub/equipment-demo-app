# equipDemo api image. Build context: the repository root.
#   docker build -f infra/docker/api.Dockerfile -t equipdemo-api .
# Run migrations as a separate step, never on every replica:
#   docker run --rm -e DATABASE_URL=... equipdemo-api node dist/migrate.js
# Secrets (DATABASE_URL) are injected at runtime only; none are baked into the image.
# Production: pin NODE_IMAGE to an approved digest (node:22-bookworm-slim@sha256:...).
ARG NODE_IMAGE=node:22-bookworm-slim

# 1. Install build dependencies for this workspace only (exact lockfile).
FROM ${NODE_IMAGE} AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/config/package.json packages/config/
COPY apps/api/package.json apps/api/
RUN npm ci --workspace=@equipdemo/api --no-audit --no-fund

# 2. Bundle (workspace packages are inlined into dist/).
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY packages/config packages/config
COPY apps/api apps/api
RUN npm run build --workspace=@equipdemo/api

# 3. Production npm dependencies only (fastify, knex, pg, ...).
FROM ${NODE_IMAGE} AS prod-deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/config/package.json packages/config/
COPY apps/api/package.json apps/api/
RUN npm ci --omit=dev --workspace=@equipdemo/api --no-audit --no-fund \
  && rm -rf node_modules/@equipdemo \
  && npm cache clean --force

# 4. Runtime: non-root, no source, no build tools.
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=prod-deps /repo/node_modules ./node_modules
COPY --from=build /repo/apps/api/package.json ./package.json
COPY --from=build /repo/apps/api/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
