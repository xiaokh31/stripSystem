#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

COMPOSE_FILE="${COMPOSE_FILE:-$REPO_ROOT/infra/docker/compose.local.yml}"
POSTGRES_SERVICE="${POSTGRES_SERVICE:-postgres}"
POSTGRES_USER="${POSTGRES_USER:-bestar}"
POSTGRES_DB="${POSTGRES_DB:-bestar_unloading}"
API_HEALTH_URL="${API_HEALTH_URL:-http://localhost/api/health}"
WEB_URL="${WEB_URL:-http://localhost/}"
STORAGE_ROOT="${STORAGE_ROOT:-$REPO_ROOT/storage}"

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "Compose file does not exist: $COMPOSE_FILE" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required for healthcheck." >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required for healthcheck." >&2
  exit 1
fi

echo "Checking Docker services with $COMPOSE_FILE"
docker compose -f "$COMPOSE_FILE" ps

echo "Checking PostgreSQL readiness"
docker compose -f "$COMPOSE_FILE" exec -T "$POSTGRES_SERVICE" \
  pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"

echo "Checking API health: $API_HEALTH_URL"
curl --fail --show-error --silent "$API_HEALTH_URL" >/dev/null

echo "Checking Web: $WEB_URL"
curl --fail --show-error --silent "$WEB_URL" >/dev/null

echo "Checking storage writability: $STORAGE_ROOT"
mkdir -p "$STORAGE_ROOT"
test -w "$STORAGE_ROOT"

echo "Healthcheck passed."
