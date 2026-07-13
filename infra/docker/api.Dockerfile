# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim

ENV UV_PYTHON_DOWNLOADS=never

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    fontconfig \
    fonts-dejavu-core \
    fonts-noto-cjk \
    libcairo2 \
    libgdk-pixbuf-2.0-0 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    openssl \
    python3 \
    python3-venv \
    shared-mime-info \
  && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:python3.12-bookworm-slim /usr/local/bin/uv /usr/local/bin/uvx /usr/local/bin/
COPY --from=ghcr.io/astral-sh/uv:python3.12-bookworm-slim /usr/local/bin/python3.12 /usr/local/bin/python3.12
COPY --from=ghcr.io/astral-sh/uv:python3.12-bookworm-slim /usr/local/lib/libpython3.12.so.1.0 /usr/local/lib/libpython3.12.so.1.0
COPY --from=ghcr.io/astral-sh/uv:python3.12-bookworm-slim /usr/local/lib/python3.12 /usr/local/lib/python3.12

RUN ln -sf /usr/local/bin/python3.12 /usr/local/bin/python

RUN corepack enable \
  && corepack prepare pnpm@11.9.0 --activate

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json

RUN --mount=type=cache,id=bestar-pnpm-api-store-v1,target=/root/.local/share/pnpm/store,sharing=locked \
  pnpm install --filter api... --frozen-lockfile --ignore-scripts

COPY apps/worker-python/pyproject.toml apps/worker-python/uv.lock apps/worker-python/README.md apps/worker-python/

RUN --mount=type=cache,id=bestar-uv-api-cache-v1,target=/root/.cache/uv,sharing=locked \
  uv sync --directory apps/worker-python --frozen --no-install-project

COPY apps/api apps/api
COPY apps/worker-python apps/worker-python
COPY samples samples

RUN --mount=type=cache,id=bestar-uv-api-cache-v1,target=/root/.cache/uv,sharing=locked \
  uv sync --directory apps/worker-python --frozen \
  && pnpm --filter api prisma generate \
  && pnpm --filter api build

ENV PATH="/workspace/apps/worker-python/.venv/bin:${PATH}" \
  UV_NO_SYNC=1
