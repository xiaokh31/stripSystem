#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(cd -- "${script_dir}/.." && pwd)"
wrapper="${script_dir}/run-business-agent.cmd"
attributes="${project_root}/.gitattributes"
normalized_wrapper="$(mktemp "${TMPDIR:-/tmp}/bestar-windows-wrapper.XXXXXX")"

cleanup() {
  rm -f "${normalized_wrapper}"
}
trap cleanup EXIT

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

[[ -f "${wrapper}" ]] || fail 'Windows business-agent CMD wrapper is missing.'
tr -d '\r' <"${wrapper}" >"${normalized_wrapper}"

required_lines=(
  'setlocal EnableExtensions DisableDelayedExpansion'
  'if not "%~3"=="" goto too_many_tasks'
  '"%GIT_BASH%" "%INSTALL_SCRIPT%" --replace'
  '"%GIT_BASH%" "%SMOKE_SCRIPT%"'
  'set "BUSINESS_AGENT_EXECUTION_MODE=implementation-only"'
  '"%GIT_BASH%" "%RUN_SCRIPT%" task "%~2"'
  'echo ERROR: Execute exactly one Task per supervised process. 1>&2'
)

for line in "${required_lines[@]}"; do
  grep -Fqx "${line}" "${normalized_wrapper}" || fail "Missing CMD contract line: ${line}"
done

if grep -Fq '%*' "${normalized_wrapper}"; then
  fail 'CMD wrapper must not forward an unbounded argument list.'
fi

if grep -Fq 'docker --version' "${normalized_wrapper}" || grep -Fq 'docker compose version' "${normalized_wrapper}"; then
  fail 'Windows implementation-only doctor must not require or invoke Docker.'
fi

duplicate_labels="$(
  sed -nE 's/^:([A-Za-z0-9_]+).*/\1/p' "${normalized_wrapper}" |
    sort |
    uniq -d
)"
[[ -z "${duplicate_labels}" ]] || fail "Duplicate CMD labels: ${duplicate_labels}"

while IFS= read -r target; do
  [[ -z "${target}" ]] && continue
  grep -Fqx ":${target}" "${normalized_wrapper}" || fail "Missing CMD goto target: ${target}"
done < <(sed -nE 's/.*[[:space:]]goto[[:space:]]+([A-Za-z0-9_]+).*/\1/p' "${normalized_wrapper}" | sort -u)

grep -Fq '*.cmd text eol=crlf' "${attributes}" ||
  fail 'CMD files must check out with CRLF line endings on Windows.'

printf 'Windows business-agent CMD wrapper contract passed.\n'
