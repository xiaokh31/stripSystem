#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="${BESTAR_ENV_FILE:-$repo_root/.env}"
token_file="${CLOUDFLARE_TUNNEL_TOKEN_FILE:-$repo_root/.secrets/cloudflare-tunnel-token}"
local_compose="$repo_root/infra/docker/compose.local.yml"
public_compose="$repo_root/infra/docker/compose.public.yml"
tunnel_compose="$repo_root/infra/docker/compose.cloudflare-tunnel.yml"

compose_args=(
  -f "$local_compose"
  -f "$public_compose"
  -f "$tunnel_compose"
)
if [[ -f "$env_file" ]]; then
  compose_args=(--env-file "$env_file" "${compose_args[@]}")
fi

fail() {
  echo "CLOUDFLARE_TUNNEL_START_FAILED:$1" >&2
  exit 1
}

read_env_value() {
  local key="$1"
  local fallback="${2:-}"
  local current="${!key:-}"
  if [[ -n "$current" ]]; then
    printf '%s' "$current"
    return
  fi
  if [[ -f "$env_file" ]]; then
    local from_file
    from_file="$(
      awk -F= -v key="$key" '
        $0 !~ /^[[:space:]]*#/ && $1 == key {
          sub(/^[^=]*=/, "")
          sub(/\r$/, "")
          print
          exit
        }
      ' "$env_file"
    )"
    from_file="${from_file#\"}"
    from_file="${from_file%\"}"
    from_file="${from_file#\'}"
    from_file="${from_file%\'}"
    if [[ -n "$from_file" ]]; then
      printf '%s' "$from_file"
      return
    fi
  fi
  printf '%s' "$fallback"
}

preflight_token() {
  [[ -f "$token_file" && ! -L "$token_file" ]] || fail "TOKEN_FILE_MISSING"
  [[ -r "$token_file" ]] || fail "TOKEN_FILE_NOT_READABLE"

  local mode
  mode="$(stat -f '%Lp' "$token_file" 2>/dev/null || stat -c '%a' "$token_file" 2>/dev/null || true)"
  [[ "$mode" == "400" || "$mode" == "600" ]] || fail "TOKEN_FILE_PERMISSIONS"

  local byte_count
  byte_count="$(wc -c <"$token_file" | tr -d '[:space:]')"
  [[ "$byte_count" =~ ^[0-9]+$ ]] || fail "TOKEN_FILE_INVALID"
  (( byte_count >= 80 && byte_count <= 4096 )) || fail "TOKEN_FILE_PLACEHOLDER"

  LC_ALL=C grep -Eq '^eyJ[A-Za-z0-9._=-]+$' "$token_file" ||
    fail "TOKEN_FILE_PLACEHOLDER"
}

verify_contract() {
  local public_base_url cors_origins trusted_proxy_mode trusted_proxy_cidrs
  public_base_url="$(read_env_value PUBLIC_BASE_URL)"
  cors_origins="$(read_env_value CORS_ORIGINS "$public_base_url")"
  trusted_proxy_mode="$(read_env_value TRUSTED_PROXY_MODE)"
  trusted_proxy_cidrs="$(read_env_value TRUSTED_PROXY_CIDRS)"
  [[ -n "$public_base_url" ]] || fail "PUBLIC_BASE_URL_MISSING"
  [[ -n "$cors_origins" ]] || fail "CORS_ORIGINS_MISSING"

  PUBLIC_BASE_URL="$public_base_url" \
  CORS_ORIGINS="$cors_origins" \
  TRUSTED_PROXY_MODE="$trusted_proxy_mode" \
  TRUSTED_PROXY_CIDRS="$trusted_proxy_cidrs" \
    "$repo_root/scripts/verify-cloudflare-tunnel-contract.sh"
}

usage() {
  echo "Usage: scripts/cloudflare-tunnel-local.sh {config|preflight|start|stop|restart|status|logs|probe}"
}

command_name="${1:-}"
case "$command_name" in
  config)
    verify_contract
    CLOUDFLARE_TUNNEL_TOKEN_FILE="$token_file" \
      docker compose "${compose_args[@]}" --profile public-tunnel config
    ;;
  preflight)
    preflight_token
    verify_contract
    echo "Cloudflare named-tunnel startup preflight: PASS"
    ;;
  start)
    preflight_token
    verify_contract
    CLOUDFLARE_TUNNEL_TOKEN_FILE="$token_file" \
      docker compose "${compose_args[@]}" --profile public-tunnel up -d
    ;;
  stop)
    CLOUDFLARE_TUNNEL_TOKEN_FILE="$token_file" \
      docker compose "${compose_args[@]}" --profile public-tunnel stop cloudflared
    ;;
  restart)
    preflight_token
    verify_contract
    CLOUDFLARE_TUNNEL_TOKEN_FILE="$token_file" \
      docker compose "${compose_args[@]}" --profile public-tunnel \
      up -d --force-recreate nginx cloudflared
    ;;
  status)
    CLOUDFLARE_TUNNEL_TOKEN_FILE="$token_file" \
      docker compose "${compose_args[@]}" --profile public-tunnel ps
    ;;
  logs)
    CLOUDFLARE_TUNNEL_TOKEN_FILE="$token_file" \
      docker compose "${compose_args[@]}" --profile public-tunnel \
      logs --tail 200 cloudflared
    ;;
  probe)
    verify_contract
    CLOUDFLARE_TUNNEL_TOKEN_FILE="$token_file" \
      docker compose "${compose_args[@]}" --profile public-tunnel-test \
      run --rm --no-deps tunnel-origin-probe
    ;;
  *)
    usage >&2
    exit 64
    ;;
esac
