#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
compose_file="$repo_root/infra/docker/compose.local.yml"
run_id="$(date -u +%Y%m%dT%H%M%SZ)-$$"
task_db="file_upload_01_$(printf '%s' "$run_id" | tr -cd 'A-Za-z0-9_' | cut -c1-36)"
task_storage_container="/workspace/storage/.file-upload-01/$run_id"
task_storage_host="$repo_root/storage/.file-upload-01/$run_id"
backup_container="/workspace/storage/.file-upload-01-backup/$run_id"
backup_host="$repo_root/storage/.file-upload-01-backup/$run_id"
runtime_dir="$(mktemp -d "${TMPDIR:-/tmp}/file-upload-01-repair.XXXXXX")"
summary_file="$repo_root/test-results/file-upload-01/repair-verification.txt"
source_file="$repo_root/samples/attendance_test/1_(7æ)åå·¥å·å¡è®°å½è¡¨.xls"
source_sha="63927d94a027f77b41ce4345e38fb9f7b9df8b8d44b989e710fe7f50f4172597"
legacy_name='1_(7æ)åå·¥å·å¡è®°å½è¡¨.xls'
canonical_name='1_(7月)员工刷卡记录表.xls'
stored_path="$task_storage_container/attendance_original_files/$source_sha/$legacy_name"

case "$task_db:$task_storage_host:$backup_host" in
  file_upload_01_*:"$repo_root"/storage/.file-upload-01/*:"$repo_root"/storage/.file-upload-01-backup/*) ;;
  *) echo "FILE-UPLOAD-01 repair verifier target validation failed." >&2; exit 1 ;;
esac

cleanup() {
  original_status=$?
  trap - EXIT
  set +e
  docker compose -f "$compose_file" exec -T postgres sh -c \
    'dropdb --if-exists --force -U "$POSTGRES_USER" "$1"' sh "$task_db" \
    >/dev/null 2>&1
  if [[ -d "$task_storage_host" ]]; then
    find "$task_storage_host" -depth -type f -delete
    find "$task_storage_host" -depth -type d -empty -delete
  fi
  if [[ -d "$backup_host" ]]; then
    find "$backup_host" -depth -type f -delete
    find "$backup_host" -depth -type d -empty -delete
  fi
  rmdir "$repo_root/storage/.file-upload-01" 2>/dev/null || true
  rmdir "$repo_root/storage/.file-upload-01-backup" 2>/dev/null || true
  find "$runtime_dir" -depth -type f -delete
  find "$runtime_dir" -depth -type d -empty -delete
  exit "$original_status"
}
trap cleanup EXIT

api_in_task_database() {
  docker compose -f "$compose_file" exec -T api sh -lc '
    task_db="$1"
    shift
    database_base="${DATABASE_URL%%\?*}"
    database_query="${DATABASE_URL#*\?}"
    database_prefix="${database_base%/*}"
    DATABASE_URL="$database_prefix/$task_db?$database_query" "$@"
  ' sh "$task_db" "$@"
}

psql_task() {
  docker compose -f "$compose_file" exec -T postgres \
    psql -X -q -v ON_ERROR_STOP=1 -U bestar -d "$task_db" "$@"
}

mkdir -p "$(dirname "$summary_file")" \
  "$task_storage_host/attendance_original_files/$source_sha" "$backup_host"
cp "$source_file" "$task_storage_host/attendance_original_files/$source_sha/$legacy_name"
test "$(shasum -a 256 "$task_storage_host/attendance_original_files/$source_sha/$legacy_name" | awk '{print $1}')" = "$source_sha"

docker compose -f "$compose_file" exec -T postgres sh -c \
  'createdb -U "$POSTGRES_USER" "$1"' sh "$task_db"
api_in_task_database pnpm --filter api prisma migrate deploy \
  >"$runtime_dir/migrate.txt"

psql_task \
  -v legacy_name="$legacy_name" \
  -v stored_path="$stored_path" \
  -v source_sha="$source_sha" <<'SQL'
INSERT INTO attendance_imports (
  id, original_filename, transport_filename, filename_codec_version,
  filename_review_code, storage_basename, stored_path, file_sha256,
  mime_type, file_size_bytes, import_status, parse_status, warning_count,
  error_count, data_revision, employee_count, day_count, created_at, updated_at
) VALUES (
  'file-upload-01-repair-attendance', :'legacy_name', NULL,
  'legacy-unclassified-v0', NULL, :'legacy_name', :'stored_path', :'source_sha',
  'application/vnd.ms-excel', 1, 'UPLOADED', 'NOT_PARSED', 0, 0, 0, 0, 0,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);
SQL

api_in_task_database env STORAGE_ROOT="$task_storage_container" \
  node /workspace/apps/api/dist/src/upload-filenames/repair-upload-filenames.js \
  >"$runtime_dir/dry-run.json"
jq -e '.mode == "dry-run" and .dryRunCandidateCount == 1 and .eligibleCount == 1 and .applyCount == 0 and .afterCandidateCount == 1' \
  "$runtime_dir/dry-run.json" >/dev/null
test "$(psql_task -At -v legacy_name="$legacy_name" <<'SQL'
SELECT COUNT(*) FROM attendance_imports
WHERE id = 'file-upload-01-repair-attendance'
  AND original_filename = :'legacy_name'
  AND transport_filename IS NULL;
SQL
)" = "1"

set +e
api_in_task_database env STORAGE_ROOT="$task_storage_container" \
  node /workspace/apps/api/dist/src/upload-filenames/repair-upload-filenames.js \
  --apply >"$runtime_dir/no-backup.stdout" 2>"$runtime_dir/no-backup.stderr"
missing_backup_status=$?
set -e
test "$missing_backup_status" -ne 0
jq -e '.code == "MATCHED_BACKUP_MANIFEST_REQUIRED"' \
  "$runtime_dir/no-backup.stderr" >/dev/null

docker compose -f "$compose_file" exec -T postgres sh -c \
  'pg_dump -U "$POSTGRES_USER" "$1"' sh "$task_db" \
  >"$backup_host/postgres.sql"
tar -czf "$backup_host/storage.tar.gz" -C "$task_storage_host" .
postgres_sha="$(shasum -a 256 "$backup_host/postgres.sql" | awk '{print $1}')"
storage_sha="$(shasum -a 256 "$backup_host/storage.tar.gz" | awk '{print $1}')"
jq -n \
  --arg snapshot "$run_id" \
  --arg postgres_path "$backup_container/postgres.sql" \
  --arg postgres_sha "$postgres_sha" \
  --arg storage_path "$backup_container/storage.tar.gz" \
  --arg storage_sha "$storage_sha" \
  '{contractVersion:"bestar-matched-backup-v1",snapshotId:$snapshot,postgres:{path:$postgres_path,sha256:$postgres_sha},storage:{path:$storage_path,sha256:$storage_sha}}' \
  >"$backup_host/manifest.json"

api_in_task_database env STORAGE_ROOT="$task_storage_container" \
  node /workspace/apps/api/dist/src/upload-filenames/repair-upload-filenames.js \
  --apply --backup-manifest "$backup_container/manifest.json" \
  >"$runtime_dir/apply.json"
jq -e '.mode == "apply" and .eligibleCount == 1 and .applyCount == 1 and .afterCandidateCount == 0' \
  "$runtime_dir/apply.json" >/dev/null
test "$(psql_task -At -v legacy_name="$legacy_name" -v canonical_name="$canonical_name" <<'SQL'
SELECT COUNT(*) FROM attendance_imports
WHERE id = 'file-upload-01-repair-attendance'
  AND original_filename = :'canonical_name'
  AND transport_filename = :'legacy_name'
  AND filename_codec_version = 'upload-filename-v1-repair'
  AND filename_review_code IS NULL
  AND file_sha256 = '63927d94a027f77b41ce4345e38fb9f7b9df8b8d44b989e710fe7f50f4172597';
SQL
)" = "1"
test "$(shasum -a 256 "$task_storage_host/attendance_original_files/$source_sha/$legacy_name" | awk '{print $1}')" = "$source_sha"

api_in_task_database env STORAGE_ROOT="$task_storage_container" \
  node /workspace/apps/api/dist/src/upload-filenames/repair-upload-filenames.js \
  --apply --backup-manifest "$backup_container/manifest.json" \
  >"$runtime_dir/second-apply.json"
jq -e '.mode == "apply" and .eligibleCount == 0 and .applyCount == 0 and .afterCandidateCount == 0' \
  "$runtime_dir/second-apply.json" >/dev/null

{
  echo "task=FILE-UPLOAD-01"
  echo "repair_dry_run_candidates=1"
  echo "repair_apply_count=1"
  echo "repair_second_apply_count=0"
  echo "missing_backup_gate=passed"
  echo "source_sha_unchanged=true"
  echo "isolated_database_cleanup=trap"
} >"$summary_file"

echo "FILE-UPLOAD-01 isolated repair gate passed."
