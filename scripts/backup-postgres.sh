#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

COMPOSE_FILE="${COMPOSE_FILE:-$REPO_ROOT/infra/docker/compose.local.yml}"
POSTGRES_SERVICE="${POSTGRES_SERVICE:-postgres}"
POSTGRES_USER="${POSTGRES_USER:-bestar}"
POSTGRES_DB="${POSTGRES_DB:-bestar_unloading}"
BACKUP_DIR="${BACKUP_DIR:-$REPO_ROOT/backups}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
OUTPUT_PATH="$BACKUP_DIR/postgres-$TIMESTAMP.sql"

mkdir -p "$BACKUP_DIR"

echo "Writing PostgreSQL backup to $OUTPUT_PATH"
docker compose -f "$COMPOSE_FILE" exec -T "$POSTGRES_SERVICE" \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > "$OUTPUT_PATH"

echo "PostgreSQL backup complete: $OUTPUT_PATH"
