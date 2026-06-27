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

if [[ "${DRY_RUN:-}" == "1" ]]; then
  echo "Dry run: would restore $BACKUP_PATH into $POSTGRES_DB using $COMPOSE_FILE"
  exit 0
fi

if [[ "${CONFIRM_RESTORE:-}" != "yes" ]]; then
  echo "Refusing to restore without confirmation." >&2
  echo "Set CONFIRM_RESTORE=yes after taking a fresh backup." >&2
  exit 3
fi

echo "Restoring PostgreSQL backup $BACKUP_PATH into $POSTGRES_DB"
docker compose -f "$COMPOSE_FILE" exec -T "$POSTGRES_SERVICE" \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < "$BACKUP_PATH"

echo "PostgreSQL restore complete."
