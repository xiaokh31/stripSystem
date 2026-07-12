#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(cd -- "${script_dir}/.." && pwd)"
codex_home="${CODEX_HOME:-${HOME}/.codex}"
profile_path="${codex_home}/business-agent.config.toml"
canonical_profile_path="${project_root}/.codex/business-agent.config.toml"

if [[ ! -f "${profile_path}" ]]; then
  printf 'Business-agent profile is not installed. Run scripts/install-business-agent-profile.sh first.\n' >&2
  exit 1
fi

if ! cmp -s "${canonical_profile_path}" "${profile_path}"; then
  printf 'Business-agent profile is stale. Run scripts/install-business-agent-profile.sh --replace before starting a new session.\n' >&2
  exit 1
fi

for argument in "$@"; do
  case "${argument}" in
    -C|-C?*|--cd|--cd=*|--add-dir|--add-dir=*|-s|-s?*|--sandbox|--sandbox=*|-a|-a?*|--ask-for-approval|--ask-for-approval=*|-p|-p?*|--profile|--profile=*|-c|-c?*|--config|--config=*|--ignore-user-config|--ignore-rules|--dangerously-bypass-approvals-and-sandbox|--dangerously-bypass-hook-trust|--remote|--remote=*|--remote-auth-token-env|--remote-auth-token-env=*)
      printf 'The business-agent launcher fixes profile, workspace, sandbox, approval, and rules settings; remove %s.\n' "${argument}" >&2
      exit 2
      ;;
  esac
done

exec codex \
  --strict-config \
  --profile business-agent \
  --sandbox danger-full-access \
  --ask-for-approval never \
  --cd "${project_root}" \
  "$@"
