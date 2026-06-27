#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

STORAGE_ROOT="${STORAGE_ROOT:-$REPO_ROOT/storage}"
BACKUP_DIR="${BACKUP_DIR:-$REPO_ROOT/backups}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
OUTPUT_PATH="$BACKUP_DIR/storage-$TIMESTAMP.tar.gz"

if [[ ! -d "$STORAGE_ROOT" ]]; then
  echo "Storage directory does not exist: $STORAGE_ROOT" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

echo "Writing storage backup to $OUTPUT_PATH"
tar -czf "$OUTPUT_PATH" -C "$(dirname "$STORAGE_ROOT")" "$(basename "$STORAGE_ROOT")"

echo "Storage backup complete: $OUTPUT_PATH"
