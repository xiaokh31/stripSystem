#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
compose_file="$repo_root/infra/docker/compose.local.yml"
public_overlay="$repo_root/infra/docker/compose.public.yml"
rendered="$(mktemp)"
trap 'rm -f "$rendered"' EXIT

PUBLIC_BASE_URL=https://warehouse.example.invalid \
CORS_ORIGINS=https://warehouse.example.invalid \
JWT_SECRET=contract-check-only-secret-value-1234567890 \
TRUSTED_PROXY_MODE=cloudflare-tunnel \
TRUSTED_PROXY_CIDRS=172.16.0.0/12 \
PUBLIC_HTTP_PORT=18080 \
  docker compose -f "$compose_file" -f "$public_overlay" config >"$rendered"

service_block() {
  local service="$1"
  awk -v service="$service" '
    $0 == "  " service ":" { inside=1; print; next }
    inside && /^  [a-zA-Z0-9_-]+:$/ { exit }
    inside { print }
  ' "$rendered"
}

for internal_service in postgres redis api; do
  if service_block "$internal_service" | grep -Eq 'published:|host_ip:'; then
    echo "PUBLIC_NETWORK_CONTRACT_FAILED:${internal_service}_HOST_PORT" >&2
    exit 1
  fi
done

nginx_block="$(service_block nginx)"
grep -q 'host_ip: 127.0.0.1' <<<"$nginx_block" || {
  echo 'PUBLIC_NETWORK_CONTRACT_FAILED:NGINX_NOT_LOOPBACK' >&2
  exit 1
}
grep -q 'published: "18080"' <<<"$nginx_block" || {
  echo 'PUBLIC_NETWORK_CONTRACT_FAILED:NGINX_PORT_MISSING' >&2
  exit 1
}

api_block="$(service_block api)"
grep -q 'PUBLIC_DEPLOYMENT_ENABLED: "true"' <<<"$api_block" || {
  echo 'PUBLIC_CONFIG_CONTRACT_FAILED:PUBLIC_MODE_DISABLED' >&2
  exit 1
}
grep -q 'BROWSER_COOKIE_SECURE: "true"' <<<"$api_block" || {
  echo 'PUBLIC_CONFIG_CONTRACT_FAILED:SECURE_COOKIE_DISABLED' >&2
  exit 1
}
grep -q 'AUTH_RATE_LIMIT_FAIL_CLOSED: "true"' <<<"$api_block" || {
  echo 'PUBLIC_CONFIG_CONTRACT_FAILED:RATE_LIMIT_NOT_FAIL_CLOSED' >&2
  exit 1
}

echo 'Public deployment contract: PASS'
