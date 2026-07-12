#!/usr/bin/env bash
set -euo pipefail

project_root="${1:?project root is required}"
cd "${project_root}"

test -r AGENTS.md

temp_file="/private/tmp/bestar-business-agent-capability-smoke-${PPID}.tmp"
trap 'rm -f "${temp_file}"' EXIT

printf 'business-agent capability smoke\n' >"${temp_file}"
test "$(cat "${temp_file}")" = 'business-agent capability smoke'
rm -f "${temp_file}"
test ! -e "${temp_file}"
trap - EXIT

docker compose -f infra/docker/compose.local.yml exec -T web \
  pnpm --filter web exec eslint --help >/dev/null
docker compose -f infra/docker/compose.local.yml ps >/dev/null
