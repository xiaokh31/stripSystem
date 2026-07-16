#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(cd -- "${script_dir}/.." && pwd)"
launcher="${project_root}/scripts/run-business-agent.sh"
rules="${project_root}/.codex/execpolicy.rules"
inner_smoke="${project_root}/scripts/business-agent-capability-smoke-inner.sh"
canonical_profile="${project_root}/.codex/business-agent.config.toml"
task_runner="${project_root}/scripts/run-business-task.sh"
terminal_schema="${project_root}/.codex/business-task-terminal.schema.json"
supervisor_test="${project_root}/scripts/test-business-task-supervisor.sh"
windows_wrapper_test="${project_root}/scripts/test-windows-business-agent-wrapper.sh"

if [[ $# -gt 1 || ( $# -eq 1 && "${1}" != '--policy-only' ) ]]; then
  printf 'Usage: %s [--policy-only]\n' "$0" >&2
  exit 2
fi

if [[ "${1:-}" != '--policy-only' ]]; then
  if ! grep -Fqx 'approval_policy = "never"' "${canonical_profile}" || \
     ! grep -Fqx 'sandbox_mode = "danger-full-access"' "${canonical_profile}"; then
    printf 'Business-agent profile is not configured for non-interactive full access.\n' >&2
    exit 1
  fi

  if grep -Fq 'extends = ":workspace"' "${canonical_profile}"; then
    printf 'Business-agent profile still inherits the workspace-only sandbox.\n' >&2
    exit 1
  fi

  if ! grep -Fqx '  --sandbox danger-full-access \' "${launcher}" || \
     ! grep -Fqx '  --ask-for-approval never \' "${launcher}"; then
    printf 'Business-agent launcher does not fix full-access/non-interactive flags.\n' >&2
    exit 1
  fi

  if [[ ! -x "${task_runner}" || ! -x "${supervisor_test}" || ! -x "${windows_wrapper_test}" ]]; then
    printf 'Business-task supervisor scripts are not executable.\n' >&2
    exit 1
  fi

  if ! jq empty "${terminal_schema}" >/dev/null 2>&1; then
    printf 'Business-task terminal schema is missing or invalid.\n' >&2
    exit 1
  fi

  "${launcher}" --version >/dev/null

  if "${launcher}" --sandbox read-only --version >/dev/null 2>&1; then
    printf 'Business-agent launcher accepted a sandbox override.\n' >&2
    exit 1
  fi

  if "${launcher}" -C/private/tmp --version >/dev/null 2>&1; then
    printf 'Business-agent launcher accepted a workspace override.\n' >&2
    exit 1
  fi

  if "${launcher}" exec --help >/dev/null 2>&1; then
    printf 'Business-agent launcher accepted an unsupervised exec invocation.\n' >&2
    exit 1
  fi

  stale_home="$(mktemp -d "${TMPDIR:-/private/tmp}/bestar-business-agent-stale-profile.XXXXXX")"
  stale_profile="${stale_home}/business-agent.config.toml"
  cleanup_stale_profile() {
    rm -f "${stale_profile}"
    rmdir "${stale_home}"
  }
  trap cleanup_stale_profile EXIT
  printf '# intentionally stale profile for launcher smoke\napproval_policy = "never"\n' >"${stale_profile}"

  if CODEX_HOME="${stale_home}" "${launcher}" --version >/dev/null 2>&1; then
    printf 'Business-agent launcher accepted a stale installed profile.\n' >&2
    exit 1
  fi

  cleanup_stale_profile
  trap - EXIT

  "${inner_smoke}" "${project_root}"
  "${supervisor_test}"
  "${windows_wrapper_test}"
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
