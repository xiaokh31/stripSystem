#!/usr/bin/env bash
set -euo pipefail

usage() {
  printf 'Usage: %s [--dry-run|--apply]\n' "$0" >&2
}

case "$#:${1:-}" in
  0:)
    mode='--dry-run'
    ;;
  1:--dry-run|1:--apply)
    mode="$1"
    ;;
  *)
    usage
    exit 2
    ;;
esac

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
repo_root="$(cd -- "${script_dir}/.." && pwd -P)"

if [[ ! -e "${repo_root}/.git" ]]; then
  printf 'Refusing to run outside a Git worktree: %s\n' "${repo_root}" >&2
  exit 1
fi

# This allowlist is intentionally fixed. The script accepts no path arguments.
targets=(
  "${repo_root}/node_modules"
  "${repo_root}/apps/api/node_modules"
  "${repo_root}/apps/web/node_modules"
)
target_types=()
target_realpaths=()
target_sizes=()
target_mtimes=()

within_repo() {
  case "$1" in
    "${repo_root}"/*) return 0 ;;
    *) return 1 ;;
  esac
}

mtime_for() {
  local path="$1"

  if date -r "${path}" '+%Y-%m-%dT%H:%M:%S%z' >/dev/null 2>&1; then
    date -r "${path}" '+%Y-%m-%dT%H:%M:%S%z'
    return
  fi

  stat -c '%y' "${path}"
}

size_for() {
  local kibibytes
  kibibytes="$(du -sk "${1}" | awk '{print $1}')"
  printf '%s' "$((kibibytes * 1024))"
}

inspect_target() {
  local index="$1"
  local path="${targets[index]}"
  local type
  local resolved

  if [[ -L "${path}" ]]; then
    type='symlink'
  elif [[ -d "${path}" ]]; then
    type='directory'
  elif [[ -e "${path}" ]]; then
    printf 'Refusing unexpected non-directory dependency path: %s\n' "${path}" >&2
    exit 1
  else
    target_types[index]='absent'
    target_realpaths[index]='absent'
    target_sizes[index]='0'
    target_mtimes[index]='absent'
    return
  fi

  if ! resolved="$(realpath "${path}")"; then
    printf 'Refusing unresolved dependency path: %s\n' "${path}" >&2
    exit 1
  fi

  if ! within_repo "${resolved}"; then
    printf 'Refusing dependency path outside repository: %s -> %s\n' "${path}" "${resolved}" >&2
    exit 1
  fi

  target_types[index]="${type}"
  target_realpaths[index]="${resolved}"
  target_sizes[index]="$(size_for "${path}")"
  target_mtimes[index]="$(mtime_for "${path}")"
}

for index in "${!targets[@]}"; do
  inspect_target "${index}"
done

printf 'Host dependency cleanup %s\n' "${mode}"
for index in "${!targets[@]}"; do
  printf 'path: %s\n' "${targets[index]}"
  printf 'realpath: %s\n' "${target_realpaths[index]}"
  printf 'type: %s\n' "${target_types[index]}"
  printf 'size_bytes: %s\n' "${target_sizes[index]}"
  printf 'mtime: %s\n' "${target_mtimes[index]}"
done

if [[ "${mode}" == '--dry-run' ]]; then
  printf 'Dry run only. No paths were deleted.\n'
  exit 0
fi

for index in "${!targets[@]}"; do
  path="${targets[index]}"
  case "${target_types[index]}" in
    absent)
      printf 'already absent: %s\n' "${path}"
      ;;
    directory)
      if ! rm -rf -- "${path}"; then
        # A managed sandbox can allow child cleanup but deny `rm` removing the
        # final directory. rmdir is non-recursive and succeeds only when empty.
        if ! rmdir -- "${path}"; then
          printf 'Could not remove dependency directory: %s\n' "${path}" >&2
          exit 1
        fi
      fi
      ;;
    symlink)
      # Remove the link itself; never recursively traverse a pnpm symlink.
      rm -f -- "${path}"
      ;;
  esac

  if [[ -e "${path}" || -L "${path}" ]]; then
    printf 'Cleanup verification failed; path still exists: %s\n' "${path}" >&2
    exit 1
  fi

  printf 'removed: %s\n' "${path}"
done

printf 'Host dependency cleanup completed. Docker named volumes were not touched.\n'
