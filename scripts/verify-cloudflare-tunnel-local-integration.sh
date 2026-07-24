#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
local_compose="$repo_root/infra/docker/compose.local.yml"
public_compose="$repo_root/infra/docker/compose.public.yml"
tunnel_compose="$repo_root/infra/docker/compose.cloudflare-tunnel.yml"
contract_token="$(mktemp)"
oversize_body="$(mktemp)"
trap 'unlink "$contract_token" "$oversize_body" 2>/dev/null || true' EXIT
chmod 0600 "$contract_token"
printf '%s\n' 'static-local-drill-fixture-not-a-cloud-token' >"$contract_token"

public_env=(
  PUBLIC_BASE_URL=https://warehouse.example.test
  CORS_ORIGINS=https://warehouse.example.test
  JWT_SECRET=contract-check-only-secret-value-1234567890
  TRUSTED_PROXY_MODE=cloudflare-tunnel
  TRUSTED_PROXY_CIDRS=172.16.0.0/12
  CLOUDFLARE_TUNNEL_TOKEN_FILE="$contract_token"
)
compose_args=(
  -f "$local_compose"
  -f "$public_compose"
  -f "$tunnel_compose"
  --profile public-tunnel-test
)

fail() {
  echo "CLOUDFLARE_TUNNEL_LOCAL_INTEGRATION_FAILED:$1" >&2
  exit 1
}

wait_for_lan_health() {
  local attempt
  for attempt in {1..30}; do
    if curl -fsS http://127.0.0.1/api/health >/dev/null 2>&1; then
      return
    fi
    sleep 1
  done
  return 1
}

service_id() {
  docker compose -f "$local_compose" ps -q "$1"
}

postgres_id_before="$(service_id postgres)"
api_id_before="$(service_id api)"
worker_id_before="$(service_id worker-python)"
[[ -n "$postgres_id_before" && -n "$api_id_before" && -n "$worker_id_before" ]] ||
  fail "LOCAL_STACK_NOT_RUNNING"
compose_project="$(
  docker inspect "$postgres_id_before" \
    --format '{{index .Config.Labels "com.docker.compose.project"}}'
)"
public_tunnel_network="${compose_project}_bestar_public_tunnel"

postgres_volume_before="$(
  docker inspect "$postgres_id_before" \
    --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Name}}{{end}}{{end}}'
)"
storage_source_before="$(
  docker inspect "$api_id_before" \
    --format '{{range .Mounts}}{{if eq .Destination "/workspace/storage"}}{{.Source}}{{end}}{{end}}'
)"
db_counts_before="$(
  docker compose -f "$local_compose" exec -T postgres \
    psql -U "${POSTGRES_USER:-bestar}" -d "${POSTGRES_DB:-bestar_unloading}" \
    -Atc 'select concat_ws(chr(124), (select count(*) from import_files), (select count(*) from containers), (select count(*) from pallet_events));'
)"

restore_local_nginx() {
  env "${public_env[@]}" \
    docker compose "${compose_args[@]}" stop tunnel-drill-sentinel >/dev/null 2>&1 || true
  env "${public_env[@]}" \
    docker compose "${compose_args[@]}" rm -f tunnel-drill-sentinel >/dev/null 2>&1 || true
  docker compose -f "$local_compose" up -d --no-deps --force-recreate nginx >/dev/null
}
trap 'restore_local_nginx; unlink "$contract_token" "$oversize_body" 2>/dev/null || true' EXIT

env "${public_env[@]}" \
  docker compose "${compose_args[@]}" up -d --no-deps --force-recreate \
    nginx tunnel-drill-sentinel

env "${public_env[@]}" \
  docker compose "${compose_args[@]}" run --rm --no-deps tunnel-origin-probe
wait_for_lan_health || fail "LAN_HEALTH_BEFORE_DRILLS"
curl -fsSI http://127.0.0.1/api/health |
  tr -d '\r' |
  grep -Eiq '^Cache-Control: no-store$' ||
  fail "PRIVATE_CACHE_CONTROL"
oversize_status="$(
  curl -sS -o "$oversize_body" -w '%{http_code}' \
    -X POST \
    -H 'Content-Type: application/octet-stream' \
    -H 'Content-Length: 104857601' \
    --data-binary '' \
    http://127.0.0.1/api/imports
)"
[[ "$oversize_status" == "413" ]] || fail "OVERSIZE_STATUS"
jq -e '
  .code == "PAYLOAD_TOO_LARGE"
  and .message == "PAYLOAD_TOO_LARGE"
  and .details == {}
' "$oversize_body" >/dev/null || fail "OVERSIZE_STABLE_BODY"

# Drill 1: the connector process is stopped. The public path is absent while
# nginx, API, PostgreSQL and storage remain available on LAN.
env "${public_env[@]}" \
  docker compose "${compose_args[@]}" stop tunnel-drill-sentinel
wait_for_lan_health || fail "LAN_HEALTH_TUNNEL_STOPPED"

# Drill 2: model company Internet loss by isolating the connector from its only
# egress network. Do not disconnect nginx or any canonical data service.
env "${public_env[@]}" \
  docker compose "${compose_args[@]}" up -d --no-deps tunnel-drill-sentinel
sentinel_id="$(
  env "${public_env[@]}" \
    docker compose "${compose_args[@]}" ps -q tunnel-drill-sentinel
)"
docker network disconnect "$public_tunnel_network" "$sentinel_id"
wait_for_lan_health || fail "LAN_HEALTH_CONNECTOR_ISOLATED"
docker network connect "$public_tunnel_network" "$sentinel_id"

# Drill 3: recreate nginx while the controlled connector remains present; the
# service name route must recover without a host/LAN IP dependency.
env "${public_env[@]}" \
  docker compose "${compose_args[@]}" up -d --no-deps --force-recreate nginx
env "${public_env[@]}" \
  docker compose "${compose_args[@]}" run --rm --no-deps tunnel-origin-probe
wait_for_lan_health || fail "LAN_HEALTH_AFTER_RECREATE"

postgres_id_after="$(service_id postgres)"
api_id_after="$(service_id api)"
worker_id_after="$(service_id worker-python)"
postgres_volume_after="$(
  docker inspect "$postgres_id_after" \
    --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Name}}{{end}}{{end}}'
)"
storage_source_after="$(
  docker inspect "$api_id_after" \
    --format '{{range .Mounts}}{{if eq .Destination "/workspace/storage"}}{{.Source}}{{end}}{{end}}'
)"
db_counts_after="$(
  docker compose -f "$local_compose" exec -T postgres \
    psql -U "${POSTGRES_USER:-bestar}" -d "${POSTGRES_DB:-bestar_unloading}" \
    -Atc 'select concat_ws(chr(124), (select count(*) from import_files), (select count(*) from containers), (select count(*) from pallet_events));'
)"

[[ "$postgres_id_after" == "$postgres_id_before" ]] || fail "POSTGRES_RECREATED"
[[ "$api_id_after" == "$api_id_before" ]] || fail "API_RECREATED"
[[ "$worker_id_after" == "$worker_id_before" ]] || fail "WORKER_RECREATED"
[[ "$postgres_volume_after" == "$postgres_volume_before" ]] || fail "POSTGRES_VOLUME_CHANGED"
[[ "$storage_source_after" == "$storage_source_before" ]] || fail "STORAGE_SOURCE_CHANGED"
[[ "$db_counts_after" == "$db_counts_before" ]] || fail "BUSINESS_MUTATION_DETECTED"

restore_local_nginx
trap 'unlink "$contract_token" "$oversize_body" 2>/dev/null || true' EXIT
wait_for_lan_health || fail "LOCAL_NGINX_RESTORE"

echo "Cloudflare tunnel local integration and failure drills: PASS"
