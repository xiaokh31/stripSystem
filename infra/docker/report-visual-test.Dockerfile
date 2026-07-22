# syntax=docker/dockerfile:1.7

FROM debian:bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    fontconfig \
    fonts-liberation \
    fonts-noto-cjk \
    libreoffice-calc \
    poppler-utils \
    python3 \
    python3-xlrd \
    python3-pil \
  && rm -rf /var/lib/apt/lists/*

COPY scripts/render-unload-report-visual.sh /usr/local/bin/render-unload-report-visual
COPY scripts/render-wage-workbook-visual.sh /usr/local/bin/render-wage-workbook-visual
COPY scripts/audit-wage-workbooks.py /usr/local/bin/audit-wage-workbooks

ENTRYPOINT ["/usr/local/bin/render-unload-report-visual"]
