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
OUTPUT_PATH="$BACKUP_DIR/postgres-$POSTGRES_DB-$TIMESTAMP.sql"
TMP_PATH="$OUTPUT_PATH.tmp"

cleanup() {
  rm -f "$TMP_PATH"
}
trap cleanup EXIT

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "Compose file does not exist: $COMPOSE_FILE" >&2
  exit 1
fi

umask 077
mkdir -p "$BACKUP_DIR"

echo "Writing PostgreSQL backup to $OUTPUT_PATH"
docker compose -f "$COMPOSE_FILE" exec -T "$POSTGRES_SERVICE" \
  pg_dump --no-owner --no-privileges -U "$POSTGRES_USER" "$POSTGRES_DB" > "$TMP_PATH"

if [[ ! -s "$TMP_PATH" ]]; then
  echo "PostgreSQL backup is empty: $TMP_PATH" >&2
  exit 1
fi

mv "$TMP_PATH" "$OUTPUT_PATH"
trap - EXIT

echo "PostgreSQL backup complete: $OUTPUT_PATH"
