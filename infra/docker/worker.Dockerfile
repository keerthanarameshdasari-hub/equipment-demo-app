# equipDemo worker image. Build context: the repository root.
#   docker build -f infra/docker/worker.Dockerfile -t equipdemo-worker .
# Secrets (DATABASE_URL) are injected at runtime only; none are baked into the image.
# Production: pin NODE_IMAGE to an approved digest (node:22-bookworm-slim@sha256:...).
ARG NODE_IMAGE=node:22-bookworm-slim

FROM ${NODE_IMAGE} AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/config/package.json packages/config/
COPY apps/worker/package.json apps/worker/
RUN npm ci --workspace=@equipdemo/worker --no-audit --no-fund

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY packages/config packages/config
COPY apps/worker apps/worker
RUN npm run build --workspace=@equipdemo/worker

FROM ${NODE_IMAGE} AS prod-deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/config/package.json packages/config/
COPY apps/worker/package.json apps/worker/
RUN npm ci --omit=dev --workspace=@equipdemo/worker --no-audit --no-fund \
  && rm -rf node_modules/@equipdemo \
  && npm cache clean --force

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps /repo/node_modules ./node_modules
COPY --from=build /repo/apps/worker/package.json ./package.json
COPY --from=build /repo/apps/worker/dist ./dist
USER node
CMD ["node", "dist/main.js"]
