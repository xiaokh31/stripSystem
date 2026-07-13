# syntax=docker/dockerfile:1.7

FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

# WeasyPrint renders pallet labels and reports in the worker process. Keep its
# native Cairo, Pango, GObject, font, and MIME dependencies in the worker image.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    fontconfig \
    fonts-dejavu-core \
    fonts-noto-cjk \
    libcairo2 \
    libgdk-pixbuf-2.0-0 \
    libglib2.0-0 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    shared-mime-info \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

COPY apps/worker-python/pyproject.toml apps/worker-python/uv.lock apps/worker-python/README.md apps/worker-python/

WORKDIR /workspace/apps/worker-python

RUN --mount=type=cache,id=bestar-uv-worker-cache-v1,target=/root/.cache/uv,sharing=locked \
  uv sync --frozen --no-install-project

COPY apps/worker-python ./
COPY samples /workspace/samples
COPY docs/fixtures.md /workspace/docs/fixtures.md

RUN --mount=type=cache,id=bestar-uv-worker-cache-v1,target=/root/.cache/uv,sharing=locked \
  uv sync --frozen

ENV PATH="/workspace/apps/worker-python/.venv/bin:${PATH}" \
  UV_NO_SYNC=1
