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
RESTORE_PARENT="$(dirname "$STORAGE_ROOT")"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
PRE_RESTORE_PATH="$STORAGE_ROOT.pre-restore-$TIMESTAMP"

if [[ "${DRY_RUN:-}" == "1" ]]; then
  echo "Dry run: would move $STORAGE_ROOT to $PRE_RESTORE_PATH"
  echo "Dry run: would extract $BACKUP_PATH into $RESTORE_PARENT"
  exit 0
fi

if [[ "${CONFIRM_RESTORE:-}" != "yes" ]]; then
  echo "Refusing to restore storage without confirmation." >&2
  echo "Set CONFIRM_RESTORE=yes after taking a fresh backup." >&2
  exit 3
fi

if [[ -e "$STORAGE_ROOT" ]]; then
  echo "Moving current storage to $PRE_RESTORE_PATH"
  mv "$STORAGE_ROOT" "$PRE_RESTORE_PATH"
fi

echo "Extracting $BACKUP_PATH into $RESTORE_PARENT"
tar -xzf "$BACKUP_PATH" -C "$RESTORE_PARENT"

echo "Storage restore complete."
