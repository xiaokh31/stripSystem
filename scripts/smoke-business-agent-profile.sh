#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(cd -- "${script_dir}/.." && pwd)"
launcher="${project_root}/scripts/run-business-agent.sh"
rules="${project_root}/.codex/execpolicy.rules"
inner_smoke="${project_root}/scripts/business-agent-capability-smoke-inner.sh"

if [[ $# -gt 1 || ( $# -eq 1 && "${1}" != '--policy-only' ) ]]; then
  printf 'Usage: %s [--policy-only]\n' "$0" >&2
  exit 2
fi

if [[ "${1:-}" != '--policy-only' ]]; then
  "${launcher}" --version >/dev/null

  if "${launcher}" --sandbox danger-full-access --version >/dev/null 2>&1; then
    printf 'Business-agent launcher accepted a sandbox override.\n' >&2
    exit 1
  fi

  if "${launcher}" -C/private/tmp --version >/dev/null 2>&1; then
    printf 'Business-agent launcher accepted a workspace override.\n' >&2
    exit 1
  fi

  codex sandbox \
    --permission-profile business-agent \
    --profile business-agent \
    --cd "${project_root}" \
    "${inner_smoke}" "${project_root}"
fi

assert_forbidden() {
  local output
  output="$(codex execpolicy check --rules "${rules}" "$@")"
  if [[ "${output}" != *'"decision":"forbidden"'* ]]; then
    printf 'Expected execpolicy to forbid: %s\n%s\n' "$*" "${output}" >&2
    exit 1
  fi
}

assert_forbidden git reset --hard
assert_forbidden git push origin main
assert_forbidden pnpm publish
assert_forbidden docker push registry.example/bestar:latest
assert_forbidden rm -rf storage
assert_forbidden pnpm install
assert_forbidden pnpm --filter api test
assert_forbidden npm install
assert_forbidden npx jest --version
assert_forbidden yarn test
assert_forbidden jest --version
assert_forbidden next build
assert_forbidden prisma generate
assert_forbidden uv run pytest

assert_allowed() {
  local output
  output="$(codex execpolicy check --rules "${rules}" "$@")"
  if [[ "${output}" == *'"decision":"forbidden"'* ]]; then
    printf 'Expected execpolicy to allow: %s\n%s\n' "$*" "${output}" >&2
    exit 1
  fi
}

assert_allowed docker compose -f infra/docker/compose.local.yml exec -T api \
  pnpm --filter api exec jest --version

printf 'Business-agent profile capability smoke passed.\n'
