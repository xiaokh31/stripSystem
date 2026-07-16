# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim

RUN corepack enable \
  && corepack prepare pnpm@11.9.0 --activate

WORKDIR /workspace

COPY .gitignore package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/mobile-scan-app/package.json apps/mobile-scan-app/package.json

RUN --mount=type=cache,id=bestar-pnpm-mobile-store-v1,target=/root/.local/share/pnpm/store,sharing=locked \
  pnpm install --filter mobile-scan-app... --frozen-lockfile --ignore-scripts

COPY apps/mobile-scan-app apps/mobile-scan-app

CMD ["tail", "-f", "/dev/null"]
