#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(cd -- "${script_dir}/.." && pwd)"
source_profile="${project_root}/.codex/business-agent.config.toml"
codex_home="${CODEX_HOME:-${HOME}/.codex}"
target_profile="${codex_home}/business-agent.config.toml"
managed_marker='# Bestar business-agent profile managed by this repository.'

if [[ "${1:-}" == "--replace" ]]; then
  replace_profile=true
  shift
elif [[ $# -eq 0 ]]; then
  replace_profile=false
else
  printf 'Usage: %s [--replace]\n' "$0" >&2
  exit 2
fi

if [[ ! -f "${source_profile}" ]]; then
  printf 'Missing canonical business-agent profile: %s\n' "${source_profile}" >&2
  exit 1
fi

if ! grep -Fqx 'approval_policy = "never"' "${source_profile}" || \
   ! grep -Fqx 'sandbox_mode = "danger-full-access"' "${source_profile}"; then
  printf 'Canonical business-agent profile must use approval_policy=never and sandbox_mode=danger-full-access.\n' >&2
  exit 1
fi

mkdir -p "${codex_home}"

if [[ -e "${target_profile}" ]] && ! cmp -s "${source_profile}" "${target_profile}"; then
  if ! grep -Fqx "${managed_marker}" "${target_profile}" && [[ "${replace_profile}" != true ]]; then
    printf 'Refusing to overwrite a different Codex profile: %s\n' "${target_profile}" >&2
    exit 1
  fi
fi

install -m 600 "${source_profile}" "${target_profile}"
codex --strict-config \
  --profile business-agent \
  --sandbox danger-full-access \
  --ask-for-approval never \
  --version >/dev/null

printf 'Installed and validated Codex business-agent profile at %s\n' "${target_profile}"
