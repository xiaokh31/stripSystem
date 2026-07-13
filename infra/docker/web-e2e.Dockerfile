# syntax=docker/dockerfile:1.7

FROM mcr.microsoft.com/playwright:v1.61.1-noble

RUN corepack enable \
  && corepack prepare pnpm@11.9.0 --activate
WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json

RUN --mount=type=cache,id=bestar-pnpm-e2e-store-v1,target=/root/.local/share/pnpm/store,sharing=locked \
  pnpm install --filter web... --frozen-lockfile --ignore-scripts

COPY apps/web apps/web
COPY samples /workspace/samples

WORKDIR /workspace/apps/web

ENTRYPOINT ["./node_modules/.bin/playwright", "test"]
