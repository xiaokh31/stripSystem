#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
compose_file="$repo_root/infra/docker/compose.local.yml"
run_id="$(date -u +%Y%m%dT%H%M%SZ)-$$"
artifact_dir="$repo_root/test-results/unload-report-04/$run_id"
admin_email="unload-report-04-$run_id@example.invalid"
admin_password="Bestar-UNLOAD-REPORT-04-$run_id"
task_db="report04_$(printf '%s' "$run_id" | tr -cd 'A-Za-z0-9_' | cut -c1-40)"
repair_storage_container="/workspace/storage/.unload-report-04/$run_id"
repair_storage_host="$repo_root/storage/.unload-report-04/$run_id"

mkdir -p "$artifact_dir"
test ! -e "$artifact_dir/verification-complete.txt"

psql_task() {
  docker compose -f "$compose_file" exec -T postgres sh -c \
    'psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"' \
    sh "$@"
}

cleanup() {
  local original_status=$?
  local import_id=""
  trap - EXIT
  set +e
  docker compose -f "$compose_file" exec -T postgres sh -c \
    'dropdb --if-exists -U "$POSTGRES_USER" "$1"' sh "$task_db"
  if [ -d "$repair_storage_host" ]; then
    find "$repair_storage_host" -mindepth 1 -maxdepth 1 -type f -delete
    rmdir "$repair_storage_host" 2>/dev/null || true
    rmdir "$(dirname "$repair_storage_host")" 2>/dev/null || true
  fi
  if [ -f "$artifact_dir/import-id.txt" ]; then
    import_id="$(tr -d '\r\n' <"$artifact_dir/import-id.txt")"
  fi
  case "$import_id" in
    ""|*[!A-Za-z0-9_:-]*) ;;
    *)
      psql_task -v import_id="$import_id" <<'SQL'
DELETE FROM import_files WHERE id = :'import_id';
SQL
      ;;
  esac
  psql_task -v email="$admin_email" <<'SQL'
BEGIN;
CREATE TEMP TABLE report04_target_users (id text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO report04_target_users (id)
SELECT id FROM users WHERE email = :'email';
DELETE FROM parser_profile_audit_events
WHERE actor_id IN (SELECT id FROM report04_target_users);
DELETE FROM auth_audit_events
WHERE user_id IN (SELECT id FROM report04_target_users)
   OR actor_user_id IN (SELECT id FROM report04_target_users);
DELETE FROM native_auth_sessions
WHERE user_id IN (SELECT id FROM report04_target_users)
   OR revoked_by_user_id IN (SELECT id FROM report04_target_users);
DELETE FROM user_roles
WHERE user_id IN (SELECT id FROM report04_target_users)
   OR assigned_by_id IN (SELECT id FROM report04_target_users);
DELETE FROM users WHERE id IN (SELECT id FROM report04_target_users);
COMMIT;
SQL
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

psql_repair() {
  docker compose -f "$compose_file" exec -T postgres \
    psql -X -q -v ON_ERROR_STOP=1 -U bestar -d "$task_db" "$@"
}

docker compose -f "$compose_file" up -d --build
docker compose -f "$compose_file" --profile e2e build e2e-web
docker compose -f "$compose_file" exec -T \
  -e "SEED_ADMIN_EMAIL=$admin_email" \
  -e "SEED_ADMIN_PASSWORD=$admin_password" \
  -e "SEED_ADMIN_NAME=UNLOAD-REPORT-04 E2E" \
  api pnpm --filter api prisma db seed

docker compose -f "$compose_file" exec -T postgres sh -c \
  'createdb -U "$POSTGRES_USER" "$1"' sh "$task_db"
api_in_task_database pnpm --filter api prisma migrate deploy \
  >"$artifact_dir/empty-database-migrate.txt"
docker compose -f "$compose_file" exec -T api sh -lc '
  target="$1"
  mkdir -p "$target"
  printf "verified report version one\n" >"$target/report-one.xlsx"
  printf "verified report version two\n" >"$target/report-two.xlsx"
' sh "$repair_storage_container"
repair_sha_one="$(
  docker compose -f "$compose_file" exec -T api \
    sha256sum "$repair_storage_container/report-one.xlsx" | awk '{print $1}'
)"
repair_sha_two="$(
  docker compose -f "$compose_file" exec -T api \
    sha256sum "$repair_storage_container/report-two.xlsx" | awk '{print $1}'
)"
psql_repair \
  -v path_one="$repair_storage_container/report-one.xlsx" \
  -v path_two="$repair_storage_container/report-two.xlsx" \
  -v sha_one="$repair_sha_one" \
  -v sha_two="$repair_sha_two" <<'SQL'
DROP INDEX "generated_files_one_current_business_artifact_key";
INSERT INTO containers (
  id, container_no, source_format, parser_source_kind, status, created_at, updated_at
) VALUES (
  'report04-repair-container',
  'REPORT04REPAIR',
  'UNKNOWN',
  'BUILT_IN',
  'IMPORTED',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);
INSERT INTO generated_files (
  id, container_id, file_type, storage_path, file_sha256, mime_type,
  file_size_bytes, status, created_at, updated_at
) VALUES
(
  'report04-repair-old',
  'report04-repair-container',
  'EXCEL_REPORT',
  :'path_one',
  :'sha_one',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  28,
  'GENERATED',
  CURRENT_TIMESTAMP - INTERVAL '1 minute',
  CURRENT_TIMESTAMP - INTERVAL '1 minute'
),
(
  'report04-repair-winner',
  'report04-repair-container',
  'EXCEL_REPORT',
  :'path_two',
  :'sha_two',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  28,
  'GENERATED',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);
SQL
api_in_task_database pnpm --filter api repair:current-generated-files \
  >"$artifact_dir/repair-duplicate-dry-run.json"
api_in_task_database pnpm --filter api repair:current-generated-files -- --apply \
  >"$artifact_dir/repair-duplicate-apply.json"
psql_repair -At <<'SQL' >"$artifact_dir/repair-database-proof.txt"
CREATE UNIQUE INDEX "generated_files_one_current_business_artifact_key"
ON generated_files(container_id, file_type)
WHERE container_id IS NOT NULL
  AND status = 'GENERATED'
  AND file_type IN ('EXCEL_REPORT', 'PALLET_LABEL_PDF');
SELECT id,status,error_message
FROM generated_files
WHERE container_id = 'report04-repair-container'
ORDER BY id;
SELECT old_generated_file_id,new_generated_file_id,reason_code
FROM generated_file_replacements
WHERE container_id = 'report04-repair-container'
ORDER BY old_generated_file_id;
SQL
grep -Fq 'report04-repair-old|SUPERSEDED|' \
  "$artifact_dir/repair-database-proof.txt"
grep -Fq \
  'report04-repair-old|report04-repair-winner|VERIFIED_STORAGE_REPAIR' \
  "$artifact_dir/repair-database-proof.txt"

docker compose -f "$compose_file" exec -T api \
  pnpm --filter api repair:current-generated-files \
  >"$artifact_dir/repair-dry-run.json"

docker compose -f "$compose_file" --profile e2e run --rm -T \
  -v "$artifact_dir/playwright:/workspace/apps/web/test-results" \
  -v "$artifact_dir:/artifacts" \
  -e "E2E_ADMIN_EMAIL=$admin_email" \
  -e "E2E_ADMIN_PASSWORD=$admin_password" \
  -e "UNLOAD_REPORT_04_ARTIFACT_DIR=/artifacts" \
  e2e-web e2e/current-artifact-replacement.spec.ts \
  --project=chromium
test "$(find "$artifact_dir" -maxdepth 1 -type f -name '*.png' | wc -l | tr -d '[:space:]')" = "12"
grep -Fq '"concurrentGenerationIds"' "$artifact_dir/verification.json"
grep -Fq '"slotCount": 2' "$artifact_dir/verification.json"

docker compose -f "$compose_file" exec -T postgres \
  psql -U bestar -d bestar_unloading -v ON_ERROR_STOP=1 -Atc \
  "SELECT count(*) FROM (
     SELECT container_id,file_type
     FROM generated_files
     WHERE status='GENERATED'
       AND file_type IN ('EXCEL_REPORT','PALLET_LABEL_PDF')
     GROUP BY container_id,file_type
     HAVING count(*) > 1
   ) duplicate_current;" \
  >"$artifact_dir/duplicate-current-count.txt"
test "$(tr -d '[:space:]' <"$artifact_dir/duplicate-current-count.txt")" = "0"

docker compose -f "$compose_file" exec -T api \
  pnpm --filter api prisma migrate status \
  >"$artifact_dir/migrate-status.txt"
docker compose -f "$compose_file" exec -T api \
  pnpm --filter api test --runInBand --runTestsByPath \
  src/reports/reports.service.spec.ts src/labels/labels.service.spec.ts \
  >"$artifact_dir/api-focused-tests.txt"
docker compose -f "$compose_file" exec -T web \
  pnpm --filter web test \
  >"$artifact_dir/web-tests.txt"

{
  echo "task=UNLOAD-REPORT-04"
  echo "run_id=$run_id"
  echo "duplicate_current_groups=0"
  echo "repair_mode=dry-run"
  echo "playwright=current-artifact-replacement chromium concurrency locale-switch desktop mobile real-zoom-200"
  echo "visual_screenshot_count=12"
  echo "artifact_dir=$artifact_dir"
} >"$artifact_dir/verification-complete.txt"

echo "$artifact_dir"
