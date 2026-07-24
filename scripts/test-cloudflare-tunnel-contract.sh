#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmp_dir="$(mktemp -d)"
trap 'find "$tmp_dir" -type f -exec unlink {} + 2>/dev/null || true; rmdir "$tmp_dir" 2>/dev/null || true' EXIT

expect_failure() {
  local expected_code="$1"
  shift
  local output_file="$tmp_dir/failure-output"
  if "$@" >"$output_file" 2>&1; then
    echo "EXPECTED_FAILURE_MISSING:$expected_code" >&2
    exit 1
  fi
  grep -Fq "$expected_code" "$output_file" || {
    echo "EXPECTED_FAILURE_CODE_MISSING:$expected_code" >&2
    exit 1
  }
}

"$repo_root/scripts/verify-cloudflare-tunnel-contract.sh"

expect_failure "PUBLIC_ORIGIN_NOT_HTTPS" \
  env PUBLIC_BASE_URL=http://warehouse.example.test \
    CORS_ORIGINS=http://warehouse.example.test \
    "$repo_root/scripts/verify-cloudflare-tunnel-contract.sh"

expect_failure "CORS_ORIGIN_MISMATCH" \
  env PUBLIC_BASE_URL=https://warehouse.example.test \
    CORS_ORIGINS=https://other.example.test \
    "$repo_root/scripts/verify-cloudflare-tunnel-contract.sh"

quick_tunnel_compose="$tmp_dir/compose.quick-tunnel.yml"
sed 's#http://nginx:80#https://trycloudflare.com#' \
  "$repo_root/infra/docker/compose.cloudflare-tunnel.yml" >"$quick_tunnel_compose"
expect_failure "NAMED_TUNNEL_COMMAND" \
  env CLOUDFLARE_TUNNEL_COMPOSE_FILE="$quick_tunnel_compose" \
    "$repo_root/scripts/verify-cloudflare-tunnel-contract.sh"

latest_image_compose="$tmp_dir/compose.latest-image.yml"
sed \
  's#cloudflare/cloudflared:2026.7.2@sha256:4f6655284ab3d252b7f28fedb19fe6c8fc82ee5b1295c20ac74d475e5398a52d#cloudflare/cloudflared:latest#' \
  "$repo_root/infra/docker/compose.cloudflare-tunnel.yml" >"$latest_image_compose"
expect_failure "IMAGE_NOT_PINNED" \
  env CLOUDFLARE_TUNNEL_COMPOSE_FILE="$latest_image_compose" \
    "$repo_root/scripts/verify-cloudflare-tunnel-contract.sh"

redis_test_overlay="$tmp_dir/compose.redis-test.yml"
awk '
  /^secrets:$/ {
    print "  redis:"
    print "    ports: !override [\"0.0.0.0:16379:6379\"]"
  }
  { print }
' "$repo_root/infra/docker/compose.cloudflare-tunnel.yml" >"$redis_test_overlay"
expect_failure "redis_HOST_PORT" \
  env CLOUDFLARE_TUNNEL_COMPOSE_FILE="$redis_test_overlay" \
    "$repo_root/scripts/verify-cloudflare-tunnel-contract.sh"

test_env="$tmp_dir/public.env"
printf '%s\n' \
  'PUBLIC_BASE_URL=https://warehouse.example.test' \
  'CORS_ORIGINS=https://warehouse.example.test' \
  'TRUSTED_PROXY_MODE=cloudflare-tunnel' \
  'TRUSTED_PROXY_CIDRS=172.16.0.0/12' >"$test_env"

expect_failure "TOKEN_FILE_MISSING" \
  env BESTAR_ENV_FILE="$test_env" \
    CLOUDFLARE_TUNNEL_TOKEN_FILE="$tmp_dir/missing-token" \
    "$repo_root/scripts/cloudflare-tunnel-local.sh" preflight

placeholder_token="$tmp_dir/placeholder-token"
printf '%s\n' 'replace-with-cloudflare-token' >"$placeholder_token"
chmod 0600 "$placeholder_token"
expect_failure "TOKEN_FILE_PLACEHOLDER" \
  env BESTAR_ENV_FILE="$test_env" \
    CLOUDFLARE_TUNNEL_TOKEN_FILE="$placeholder_token" \
    "$repo_root/scripts/cloudflare-tunnel-local.sh" preflight

valid_shape_token="$tmp_dir/valid-shape-token"
{
printf 'eyJ'
printf 'A%.0s' {1..120}
printf '\n'
} >"$valid_shape_token"
chmod 0600 "$valid_shape_token"
preflight_output="$tmp_dir/preflight-output"
BESTAR_ENV_FILE="$test_env" \
CLOUDFLARE_TUNNEL_TOKEN_FILE="$valid_shape_token" \
  "$repo_root/scripts/cloudflare-tunnel-local.sh" preflight >"$preflight_output"
grep -Fq 'startup preflight: PASS' "$preflight_output"
if grep -Fq 'eyJAAAA' "$preflight_output"; then
  echo "TOKEN_LEAKED_BY_PREFLIGHT" >&2
  exit 1
fi

echo "Cloudflare named-tunnel contract regression: PASS"
