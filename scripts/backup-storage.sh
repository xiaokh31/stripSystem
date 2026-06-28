#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

STORAGE_ROOT="${STORAGE_ROOT:-$REPO_ROOT/storage}"
STORAGE_ROOT="${STORAGE_ROOT%/}"
BACKUP_DIR="${BACKUP_DIR:-$REPO_ROOT/backups}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
OUTPUT_PATH="$BACKUP_DIR/storage-$TIMESTAMP.tar.gz"
TMP_PATH="$OUTPUT_PATH.tmp"

cleanup() {
  rm -f "$TMP_PATH"
}
trap cleanup EXIT

if [[ ! -d "$STORAGE_ROOT" ]]; then
  echo "Storage directory does not exist: $STORAGE_ROOT" >&2
  exit 1
fi

umask 077
mkdir -p "$BACKUP_DIR"

echo "Writing storage backup to $OUTPUT_PATH"
tar -czf "$TMP_PATH" -C "$(dirname "$STORAGE_ROOT")" "$(basename "$STORAGE_ROOT")"

if [[ ! -s "$TMP_PATH" ]]; then
  echo "Storage backup is empty: $TMP_PATH" >&2
  exit 1
fi

mv "$TMP_PATH" "$OUTPUT_PATH"
trap - EXIT

echo "Storage backup complete: $OUTPUT_PATH"
