#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
local_compose="$repo_root/infra/docker/compose.local.yml"
public_compose="$repo_root/infra/docker/compose.public.yml"
tunnel_compose="${CLOUDFLARE_TUNNEL_COMPOSE_FILE:-$repo_root/infra/docker/compose.cloudflare-tunnel.yml}"
rendered="$(mktemp)"
contract_token="$(mktemp)"
trap 'unlink "$rendered" "$contract_token" 2>/dev/null || true' EXIT

command -v jq >/dev/null 2>&1 || {
  echo "CLOUDFLARE_TUNNEL_CONTRACT_FAILED:JQ_REQUIRED" >&2
  exit 1
}

# This is a local static-render fixture, not a Cloudflare credential. Compose
# receives only its path and never renders file contents into the config.
chmod 0600 "$contract_token"
printf '%s\n' 'static-contract-fixture-not-a-cloud-token' >"$contract_token"

public_origin="${PUBLIC_BASE_URL:-https://warehouse.example.test}"
cors_origins="${CORS_ORIGINS:-$public_origin}"
trusted_proxy_mode="${TRUSTED_PROXY_MODE:-cloudflare-tunnel}"
trusted_proxy_cidrs="${TRUSTED_PROXY_CIDRS:-172.16.0.0/12}"

PUBLIC_BASE_URL="$public_origin" \
CORS_ORIGINS="$cors_origins" \
JWT_SECRET="${JWT_SECRET:-contract-check-only-secret-value-1234567890}" \
TRUSTED_PROXY_MODE="$trusted_proxy_mode" \
TRUSTED_PROXY_CIDRS="$trusted_proxy_cidrs" \
CLOUDFLARE_TUNNEL_TOKEN_FILE="$contract_token" \
  docker compose \
    -f "$local_compose" \
    -f "$public_compose" \
    -f "$tunnel_compose" \
    --profile public-tunnel \
    --profile public-tunnel-test \
    config --format json >"$rendered"

fail() {
  echo "CLOUDFLARE_TUNNEL_CONTRACT_FAILED:$1" >&2
  exit 1
}

jq -e . "$rendered" >/dev/null || fail "INVALID_COMPOSE_JSON"

expected_image='cloudflare/cloudflared:2026.7.2@sha256:4f6655284ab3d252b7f28fedb19fe6c8fc82ee5b1295c20ac74d475e5398a52d'
actual_image="$(jq -r '.services.cloudflared.image // ""' "$rendered")"
[[ "$actual_image" == "$expected_image" ]] || fail "IMAGE_NOT_PINNED"
[[ "$actual_image" != *":latest"* ]] || fail "LATEST_IMAGE_FORBIDDEN"

jq -e '
  .services.cloudflared as $c
  | ($c.profiles | index("public-tunnel")) != null
  and $c.restart == "unless-stopped"
  and $c.read_only == true
  and $c.user == "65532:65532"
  and ($c.cap_drop | index("ALL")) != null
  and ($c.security_opt | index("no-new-privileges:true")) != null
  and ($c.privileged // false) == false
  and ($c.network_mode // "") != "host"
  and ($c.networks | keys) == ["public_tunnel"]
  and (($c.ports // []) | length) == 0
  and (($c.expose // []) | length) == 0
  and (($c.volumes // []) | length) == 0
  and $c.healthcheck.test[0] == "CMD"
  and $c.mem_limit == "268435456"
  and $c.pids_limit == 100
  and $c.cpus == 0.5
  and $c.logging.options["max-size"] == "10m"
  and $c.logging.options["max-file"] == "3"
' "$rendered" >/dev/null || fail "CONNECTOR_HARDENING"

jq -e '
  .services.cloudflared as $c
  | $c.entrypoint == ["cloudflared", "--no-autoupdate"]
  and ($c.command | index("tunnel")) != null
  and ($c.command | index("run")) != null
  and ($c.command | index("--token-file")) != null
  and ($c.command | index("/run/secrets/cloudflare_tunnel_token")) != null
  and ($c.command | index("--url")) != null
  and ($c.command | index("http://nginx:80")) != null
  and ($c.command | index("--token")) == null
  and (($c.command | join(" ")) | test("trycloudflare\\.com|quick tunnel"; "i") | not)
  and (($c.environment // {}) | has("TUNNEL_TOKEN") | not)
  and (($c.environment // {}) | has("CLOUDFLARE_TUNNEL_TOKEN") | not)
' "$rendered" >/dev/null || fail "NAMED_TUNNEL_COMMAND"

jq -e '
  .services.cloudflared.secrets == [{
    source: "cloudflare_tunnel_token",
    target: "cloudflare_tunnel_token",
    mode: "0400"
  }]
  and (.secrets.cloudflare_tunnel_token.file | type == "string")
' "$rendered" >/dev/null || fail "SECRET_FILE_INJECTION"

if jq -r '.. | strings' "$rendered" | grep -Fq 'static-contract-fixture-not-a-cloud-token'; then
  fail "SECRET_RENDERED"
fi

jq -e '
  (.services.nginx.networks | keys | sort) == ["default", "public_tunnel"]
  and (.services["tunnel-origin-probe"].networks | keys) == ["public_tunnel"]
  and (.services.api.networks | keys) == ["default"]
  and (.services.postgres.networks | keys) == ["default"]
  and (.services.redis.networks | keys) == ["default"]
  and (.networks.public_tunnel.internal // false) == false
' "$rendered" >/dev/null || fail "NETWORK_ISOLATION"

for service in postgres redis api cloudflared; do
  published_count="$(jq --arg service "$service" '(.services[$service].ports // []) | length' "$rendered")"
  [[ "$published_count" == "0" ]] || fail "${service}_HOST_PORT"
done

jq -e '
  .services.nginx.ports | length == 1
  and .[0].target == 80
  and (.[0].host_ip // "") != "127.0.0.1"
' "$rendered" >/dev/null || fail "LAN_NGINX_BINDING"

jq -e --arg origin "$public_origin" --arg cors "$cors_origins" '
  .services.api.environment as $e
  | $e.PUBLIC_DEPLOYMENT_ENABLED == "true"
  and $e.PUBLIC_BASE_URL == $origin
  and $e.CORS_ORIGINS == $cors
  and $e.BROWSER_COOKIE_SECURE == "true"
  and $e.AUTH_RATE_LIMIT_FAIL_CLOSED == "true"
  and $e.TRUSTED_PROXY_MODE == "cloudflare-tunnel"
  and .services.web.environment.NEXT_PUBLIC_API_BASE_URL == "/api"
' "$rendered" >/dev/null || fail "PUBLIC_ORIGIN_CONTRACT"

[[ "$public_origin" == https://* ]] || fail "PUBLIC_ORIGIN_NOT_HTTPS"
[[ "$public_origin" != *"*"* && "$cors_origins" != *"*"* ]] || fail "WILDCARD_ORIGIN"
[[ "$public_origin" != *".invalid"* ]] || fail "PLACEHOLDER_PUBLIC_ORIGIN"
[[ "$cors_origins" == "$public_origin" ]] || fail "CORS_ORIGIN_MISMATCH"
[[ "$trusted_proxy_mode" == "cloudflare-tunnel" ]] || fail "TRUSTED_PROXY_MODE"
[[ -n "$trusted_proxy_cidrs" ]] || fail "TRUSTED_PROXY_CIDRS"

jq -e '
  .services.nginx.volumes
  | any(
      .target == "/etc/nginx/nginx.conf"
      and .read_only == true
      and (.source | endswith("/infra/nginx/nginx.public.conf"))
    )
' "$rendered" >/dev/null || fail "PUBLIC_NGINX_CONFIG"

echo "Cloudflare named-tunnel contract: PASS"
