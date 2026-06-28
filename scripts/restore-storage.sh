#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <storage-backup.tar.gz>" >&2
  exit 2
fi

BACKUP_PATH="$1"
if [[ ! -f "$BACKUP_PATH" ]]; then
  echo "Backup file does not exist: $BACKUP_PATH" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

STORAGE_ROOT="${STORAGE_ROOT:-$REPO_ROOT/storage}"
STORAGE_ROOT="${STORAGE_ROOT%/}"
RESTORE_PARENT="$(dirname "$STORAGE_ROOT")"
STORAGE_BASENAME="$(basename "$STORAGE_ROOT")"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
PRE_RESTORE_PATH="$STORAGE_ROOT.pre-restore-$TIMESTAMP"
TAR_LIST_PATH="${TMPDIR:-/tmp}/bestar-storage-restore-$TIMESTAMP.list"

cleanup() {
  rm -f "$TAR_LIST_PATH"
}
trap cleanup EXIT

validate_archive() {
  tar -tzf "$BACKUP_PATH" > "$TAR_LIST_PATH"

  if grep -Eq '(^/|(^|/)\.\.(/|$))' "$TAR_LIST_PATH"; then
    echo "Refusing to restore archive with unsafe paths: $BACKUP_PATH" >&2
    exit 1
  fi

  if ! awk -F/ -v root="$STORAGE_BASENAME" '$1 == root { found = 1 } END { exit found ? 0 : 1 }' "$TAR_LIST_PATH"; then
    echo "Archive does not contain expected top-level directory: $STORAGE_BASENAME" >&2
    exit 1
  fi
}

validate_archive

if [[ "${DRY_RUN:-}" == "1" ]]; then
  echo "Dry run: would move $STORAGE_ROOT to $PRE_RESTORE_PATH"
  echo "Dry run: would extract $BACKUP_PATH into $RESTORE_PARENT"
  exit 0
fi

if [[ "${CONFIRM_RESTORE:-}" != "yes" ]]; then
  echo "Refusing to restore storage without confirmation." >&2
  echo "WARNING: storage restore replaces '$STORAGE_ROOT' with archive contents." >&2
  echo "Current storage will be moved aside, not deleted." >&2
  echo "Set CONFIRM_RESTORE=yes after taking a fresh backup." >&2
  exit 3
fi

if [[ -e "$STORAGE_ROOT" ]]; then
  echo "Moving current storage to $PRE_RESTORE_PATH"
  mv "$STORAGE_ROOT" "$PRE_RESTORE_PATH"
fi

echo "Extracting $BACKUP_PATH into $RESTORE_PARENT"
if ! tar -xzf "$BACKUP_PATH" -C "$RESTORE_PARENT"; then
  echo "Storage extraction failed." >&2
  if [[ -e "$PRE_RESTORE_PATH" && ! -e "$STORAGE_ROOT" ]]; then
    echo "Restoring previous storage from $PRE_RESTORE_PATH" >&2
    mv "$PRE_RESTORE_PATH" "$STORAGE_ROOT"
  fi
  exit 1
fi

if [[ ! -d "$STORAGE_ROOT" ]]; then
  echo "Storage archive did not restore expected directory: $STORAGE_ROOT" >&2
  if [[ -e "$PRE_RESTORE_PATH" && ! -e "$STORAGE_ROOT" ]]; then
    echo "Restoring previous storage from $PRE_RESTORE_PATH" >&2
    mv "$PRE_RESTORE_PATH" "$STORAGE_ROOT"
  fi
  exit 1
fi

echo "Storage restore complete."
if [[ -e "$PRE_RESTORE_PATH" ]]; then
  echo "Previous storage preserved at: $PRE_RESTORE_PATH"
fi
