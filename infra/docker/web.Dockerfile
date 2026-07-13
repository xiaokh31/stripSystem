# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim

RUN corepack enable \
  && corepack prepare pnpm@11.9.0 --activate

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json

RUN --mount=type=cache,id=bestar-pnpm-web-store-v1,target=/root/.local/share/pnpm/store,sharing=locked \
  pnpm install --filter web... --frozen-lockfile --ignore-scripts

COPY apps/web apps/web

RUN pnpm --filter web build

# The locale contract test compares dashboard response keys with the API source.
# Copy only that contract source after the production build so API changes do not
# invalidate the Web dependency or build layers.
COPY apps/api/src/dashboard/dashboard.service.ts apps/api/src/dashboard/dashboard.service.ts
