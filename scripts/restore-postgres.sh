#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <postgres-backup.sql>" >&2
  exit 2
fi

BACKUP_PATH="$1"
if [[ ! -f "$BACKUP_PATH" ]]; then
  echo "Backup file does not exist: $BACKUP_PATH" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

COMPOSE_FILE="${COMPOSE_FILE:-$REPO_ROOT/infra/docker/compose.local.yml}"
POSTGRES_SERVICE="${POSTGRES_SERVICE:-postgres}"
POSTGRES_USER="${POSTGRES_USER:-bestar}"
POSTGRES_DB="${POSTGRES_DB:-bestar_unloading}"
BACKUP_DIR="${BACKUP_DIR:-$REPO_ROOT/backups}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
PRE_RESTORE_PATH="$BACKUP_DIR/pre-restore-postgres-$POSTGRES_DB-$TIMESTAMP.sql"
PRE_RESTORE_TMP="$PRE_RESTORE_PATH.tmp"

cleanup() {
  rm -f "$PRE_RESTORE_TMP"
}
trap cleanup EXIT

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "Compose file does not exist: $COMPOSE_FILE" >&2
  exit 1
fi

if [[ "${DRY_RUN:-}" == "1" ]]; then
  echo "Dry run: would create pre-restore backup at $PRE_RESTORE_PATH"
  echo "Dry run: would restore $BACKUP_PATH into $POSTGRES_DB using $COMPOSE_FILE"
  exit 0
fi

if [[ "${CONFIRM_RESTORE:-}" != "yes" ]]; then
  echo "Refusing to restore without confirmation." >&2
  echo "WARNING: PostgreSQL restore applies SQL to database '$POSTGRES_DB'." >&2
  echo "Stop app traffic and verify the backup path before continuing." >&2
  echo "Set CONFIRM_RESTORE=yes after taking a fresh backup." >&2
  exit 3
fi

umask 077
mkdir -p "$BACKUP_DIR"

echo "Writing pre-restore PostgreSQL backup to $PRE_RESTORE_PATH"
docker compose -f "$COMPOSE_FILE" exec -T "$POSTGRES_SERVICE" \
  pg_dump --no-owner --no-privileges -U "$POSTGRES_USER" "$POSTGRES_DB" > "$PRE_RESTORE_TMP"

if [[ ! -s "$PRE_RESTORE_TMP" ]]; then
  echo "Pre-restore PostgreSQL backup is empty: $PRE_RESTORE_TMP" >&2
  exit 1
fi

mv "$PRE_RESTORE_TMP" "$PRE_RESTORE_PATH"

echo "Restoring PostgreSQL backup $BACKUP_PATH into $POSTGRES_DB"
docker compose -f "$COMPOSE_FILE" exec -T "$POSTGRES_SERVICE" \
  psql --single-transaction -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" < "$BACKUP_PATH"

echo "PostgreSQL restore complete."
echo "Pre-restore backup preserved at: $PRE_RESTORE_PATH"
