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

RUN corepack enable

WORKDIR /workspace
