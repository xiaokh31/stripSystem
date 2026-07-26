#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
compose_file="$repo_root/infra/docker/compose.local.yml"
run_id="${REPORT_VISUAL_RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)}"
artifact_rel="unload-report-02/$run_id"
artifact_dir="$repo_root/test-results/$artifact_rel"
failure_dir="$repo_root/test-results/unload-report-02-failure/$run_id"
source_dir="$artifact_dir/source"
failure_source_dir="$failure_dir/source"
template="$repo_root/samples/templates/卸柜报告-En.xlsx"
admin_email="unload-report-02-$run_id@local.invalid"
admin_password="$(openssl rand -base64 30 | tr -d '\n')Aa1!"
runtime_backup_dir="$(mktemp -d "${TMPDIR:-/tmp}/unload-report-02.XXXXXX")"
manifest_path="$repo_root/storage/reports/report_manifest.json"
manifest_backup="$runtime_backup_dir/report_manifest.json"
manifest_existed=0
cleanup_failed=0

mkdir -p "$source_dir" "$artifact_dir/playwright" "$failure_source_dir" \
  "$failure_dir/playwright"
if [ -f "$manifest_path" ]; then
  cp "$manifest_path" "$manifest_backup"
  manifest_existed=1
fi
template_sha_before="$(sha256sum "$template" | awk '{print $1}')"

psql_task() {
  docker compose -f "$compose_file" exec -T postgres sh -c \
    'psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"' \
    sh "$@"
}

artifact_value() {
  local path="$1"
  if [ -f "$path" ]; then
    tr -d '\r\n' < "$path"
  fi
}

validate_identifier() {
  local value="$1"
  case "$value" in
    ""|*[!A-Za-z0-9_:-]*)
      return 1
      ;;
  esac
}

unlink_runtime_artifact() {
  local container_path="$1"
  local host_path
  case "$container_path" in
    /workspace/storage/original_files/*|/workspace/storage/reports/*)
      host_path="$repo_root/${container_path#/workspace/}"
      ;;
    "")
      return 0
      ;;
    *)
      echo "Unsafe UNLOAD-REPORT-02 storage cleanup path: $container_path" >&2
      return 1
      ;;
  esac
  case "$host_path" in
    "$repo_root/storage/original_files/"*|"$repo_root/storage/reports/"*) ;;
    *)
      echo "Resolved cleanup path escaped storage: $host_path" >&2
      return 1
      ;;
  esac
  if [ -f "$host_path" ]; then
    unlink "$host_path"
  fi
}

cleanup_fixture() {
  local root="$1"
  local fixture_source="$root/source"
  local import_id container_id generated_file_id original_path generated_path
  import_id="$(artifact_value "$fixture_source/import-file-id.txt")"
  container_id="$(artifact_value "$fixture_source/container-id.txt")"
  generated_file_id="$(artifact_value "$fixture_source/generated-file-id.txt")"
  original_path="$(artifact_value "$fixture_source/original-storage-path.txt")"
  generated_path="$(artifact_value "$fixture_source/generated-storage-path.txt")"

  for value in "$import_id" "$container_id" "$generated_file_id"; do
    if [ -n "$value" ] && ! validate_identifier "$value"; then
      echo "Unsafe cleanup identifier in $fixture_source" >&2
      return 1
    fi
  done

  psql_task \
    -v import_id="$import_id" \
    -v container_id="$container_id" \
    -v generated_file_id="$generated_file_id" <<'SQL'
BEGIN;
CREATE TEMP TABLE report02_target_containers (id text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO report02_target_containers (id)
SELECT id FROM containers
WHERE id = NULLIF(:'container_id', '')
   OR import_file_id = NULLIF(:'import_id', '')
ON CONFLICT DO NOTHING;
DELETE FROM parser_profile_audit_events
WHERE import_file_id = NULLIF(:'import_id', '')
   OR container_id IN (SELECT id FROM report02_target_containers);
DELETE FROM generated_files
WHERE id = NULLIF(:'generated_file_id', '')
   OR import_file_id = NULLIF(:'import_id', '')
   OR container_id IN (SELECT id FROM report02_target_containers);
DELETE FROM container_lines
WHERE container_id IN (SELECT id FROM report02_target_containers);
DELETE FROM container_destinations
WHERE container_id IN (SELECT id FROM report02_target_containers);
DELETE FROM containers
WHERE id IN (SELECT id FROM report02_target_containers);
DELETE FROM import_files
WHERE id = NULLIF(:'import_id', '');
COMMIT;
SQL

  unlink_runtime_artifact "$original_path"
  unlink_runtime_artifact "$generated_path"
}

cleanup_admin() {
  psql_task -v email="$admin_email" <<'SQL'
BEGIN;
CREATE TEMP TABLE report02_target_users (id text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO report02_target_users (id)
SELECT id FROM users WHERE email = :'email';
DELETE FROM parser_profile_audit_events
WHERE actor_id IN (SELECT id FROM report02_target_users);
DELETE FROM auth_audit_events
WHERE user_id IN (SELECT id FROM report02_target_users)
   OR actor_user_id IN (SELECT id FROM report02_target_users);
DELETE FROM native_auth_sessions
WHERE user_id IN (SELECT id FROM report02_target_users)
   OR revoked_by_user_id IN (SELECT id FROM report02_target_users);
DELETE FROM user_roles
WHERE user_id IN (SELECT id FROM report02_target_users)
   OR assigned_by_id IN (SELECT id FROM report02_target_users);
DELETE FROM users WHERE id IN (SELECT id FROM report02_target_users);
COMMIT;
SQL
}

restore_manifest() {
  if [ "$manifest_existed" -eq 1 ]; then
    cp "$manifest_backup" "$manifest_path"
  elif [ -f "$manifest_path" ]; then
    unlink "$manifest_path"
  fi
}

cleanup_on_exit() {
  local original_status=$?
  trap - EXIT
  set +e
  cleanup_fixture "$failure_dir"
  failure_cleanup_status=$?
  cleanup_fixture "$artifact_dir"
  success_cleanup_status=$?
  cleanup_admin
  admin_cleanup_status=$?
  restore_manifest
  manifest_cleanup_status=$?
  rm -rf "$runtime_backup_dir"
  if [ "$failure_cleanup_status" -ne 0 ] ||
    [ "$success_cleanup_status" -ne 0 ] ||
    [ "$admin_cleanup_status" -ne 0 ] ||
    [ "$manifest_cleanup_status" -ne 0 ]; then
    cleanup_failed=1
  fi
  if [ "$cleanup_failed" -ne 0 ]; then
    exit 1
  fi
  exit "$original_status"
}
trap cleanup_on_exit EXIT

storage_digest() {
  {
    find "$repo_root/storage/original_files" -type f -exec sha256sum {} \;
    find "$repo_root/storage/reports" -type f -exec sha256sum {} \;
  } 2>/dev/null | sort | sha256sum | awk '{print $1}'
}

generated_files_digest() {
  psql_task -At <<'SQL' | sha256sum | awk '{print $1}'
SELECT id, updated_at, file_sha256, file_size_bytes, storage_path
FROM generated_files
ORDER BY id;
SQL
}

residual_count() {
  local root="$1"
  local fixture_source="$root/source"
  local import_id container_id generated_file_id
  import_id="$(artifact_value "$fixture_source/import-file-id.txt")"
  container_id="$(artifact_value "$fixture_source/container-id.txt")"
  generated_file_id="$(artifact_value "$fixture_source/generated-file-id.txt")"
  psql_task -At \
    -v import_id="$import_id" \
    -v container_id="$container_id" \
    -v generated_file_id="$generated_file_id" <<'SQL'
SELECT
  (SELECT COUNT(*) FROM import_files WHERE id = NULLIF(:'import_id', '')) +
  (SELECT COUNT(*) FROM containers WHERE id = NULLIF(:'container_id', '')) +
  (SELECT COUNT(*) FROM generated_files WHERE id = NULLIF(:'generated_file_id', ''));
SQL
}

docker compose -f "$compose_file" up -d --build
docker compose -f "$compose_file" --profile e2e --profile report-visual build \
  e2e-web unload-report-02-visual-test

storage_before="$(storage_digest)"
generated_before="$(generated_files_digest)"

docker compose -f "$compose_file" exec -T \
  -e "SEED_ADMIN_EMAIL=$admin_email" \
  -e "SEED_ADMIN_PASSWORD=$admin_password" \
  -e "SEED_ADMIN_NAME=UNLOAD-REPORT-02 E2E" \
  api pnpm --filter api prisma db seed

set +e
docker compose -f "$compose_file" --profile e2e run --rm -T \
  -v "$failure_dir/playwright:/workspace/apps/web/test-results" \
  -v "$failure_dir:/artifacts" \
  -e "E2E_ADMIN_EMAIL=$admin_email" \
  -e "E2E_ADMIN_PASSWORD=$admin_password" \
  -e "UNLOAD_REPORT_ARTIFACT_DIR=/artifacts/source" \
  -e "E2E_FORCE_FAILURE=1" \
  e2e-web e2e/unload-report-rich-text.spec.ts --project=chromium
failure_status=$?
set -e
if [ "$failure_status" -eq 0 ]; then
  echo "Intentional UNLOAD-REPORT-02 cleanup failure probe unexpectedly passed." >&2
  exit 1
fi
if [ "$(artifact_value "$failure_source_dir/intentional-failure-reached.txt")" != "yes" ]; then
  echo "Failure probe stopped before the intentional cleanup checkpoint." >&2
  exit 1
fi
cleanup_fixture "$failure_dir"
if [ "$(residual_count "$failure_dir")" != "0" ]; then
  echo "Failure-probe database cleanup left residual rows." >&2
  exit 1
fi

docker compose -f "$compose_file" --profile e2e run --rm -T \
  -v "$artifact_dir/playwright:/workspace/apps/web/test-results" \
  -v "$artifact_dir:/artifacts" \
  -e "E2E_ADMIN_EMAIL=$admin_email" \
  -e "E2E_ADMIN_PASSWORD=$admin_password" \
  -e "UNLOAD_REPORT_ARTIFACT_DIR=/artifacts/source" \
  e2e-web e2e/unload-report-rich-text.spec.ts --project=chromium

generated_file_id="$(artifact_value "$source_dir/generated-file-id.txt")"
actor_user_id="$(artifact_value "$source_dir/actor-user-id.txt")"
import_file_id="$(artifact_value "$source_dir/import-file-id.txt")"
uploaded_file_sha="$(artifact_value "$source_dir/uploaded-file-sha256.txt")"
for value in \
  "$generated_file_id" "$actor_user_id" "$import_file_id" "$uploaded_file_sha"; do
  validate_identifier "$value"
done

recorded_actor="$(
  psql_task -At -v generated_file_id="$generated_file_id" <<'SQL'
SELECT generated_by_id FROM generated_files WHERE id = :'generated_file_id';
SQL
)"
if [ "$recorded_actor" != "$actor_user_id" ]; then
  echo "Generated-file audit actor mismatch." >&2
  exit 1
fi
printf 'actor_matches=true\n' > "$artifact_dir/database-audit-verification.txt"

stored_original_path="$(artifact_value "$source_dir/original-storage-path.txt")"
case "$stored_original_path" in
  /workspace/storage/original_files/*) ;;
  *)
    echo "Uploaded fixture escaped original_files storage." >&2
    exit 1
    ;;
esac
stored_original_sha="$(
  docker compose -f "$compose_file" exec -T \
    -e "REPORT_ORIGINAL_PATH=$stored_original_path" api sh -lc \
    'sha256sum "$REPORT_ORIGINAL_PATH" | awk '\''{print $1}'\'''
)"
if [ "$stored_original_sha" != "$uploaded_file_sha" ]; then
  echo "Preserved upload SHA mismatch." >&2
  exit 1
fi
printf 'stored_original_sha_matches=true\n' \
  > "$artifact_dir/original-upload-verification.txt"

docker compose -f "$compose_file" run --rm -T --no-deps \
  -v "$repo_root/test-results:/workspace/test-results" \
  worker-python sh -lc "
    set -eu
    run_dir='/workspace/test-results/$artifact_rel'
    mkdir -p \"\$run_dir/input\" \"\$run_dir/source\" \"\$run_dir/worker-pipeline\"
    cp '/workspace/samples/unloading-plans/CAAU8011090 UNLOADING PLAN.xlsx' \
      \"\$run_dir/input/CAAU8011090 UNLOADING PLAN.xlsx\"
    cp '/workspace/samples/templates/卸柜报告-En.xlsx' \
      \"\$run_dir/source/template.xlsx\"
    uv run unloading-worker batch \
      --input-dir \"\$run_dir/input\" \
      --template '/workspace/samples/templates/卸柜报告-En.xlsx' \
      --output-dir \"\$run_dir/worker-pipeline\"
    cp \"\$run_dir\"/worker-pipeline/reports/*.xlsx \
      \"\$run_dir/source/worker-generated-report.xlsx\"
    uv run python tests/fixtures/generate_report_02_visual_workbooks.py \
      --output-dir \"\$run_dir/source\"
  "

docker compose -f "$compose_file" --profile report-visual run --rm -T --no-deps \
  unload-report-02-visual-test "/workspace/test-results/$artifact_rel"

template_sha_after="$(sha256sum "$template" | awk '{print $1}')"
if [ "$template_sha_after" != "$template_sha_before" ]; then
  echo "Report template SHA-256 changed during verification." >&2
  exit 1
fi
printf 'before=%s\nafter=%s\n' "$template_sha_before" "$template_sha_after" \
  > "$artifact_dir/template-sha256.txt"

cleanup_fixture "$artifact_dir"
cleanup_admin
restore_manifest

if [ "$(residual_count "$artifact_dir")" != "0" ]; then
  echo "Success-path database cleanup left residual rows." >&2
  exit 1
fi
admin_residual="$(
  psql_task -At -v email="$admin_email" <<'SQL'
SELECT COUNT(*) FROM users WHERE email = :'email';
SQL
)"
if [ "$admin_residual" != "0" ]; then
  echo "Temporary UNLOAD-REPORT-02 administrator was not removed." >&2
  exit 1
fi
storage_after="$(storage_digest)"
generated_after="$(generated_files_digest)"
if [ "$storage_after" != "$storage_before" ]; then
  echo "Storage digest changed after exact UNLOAD-REPORT-02 cleanup." >&2
  exit 1
fi
if [ "$generated_after" != "$generated_before" ]; then
  echo "Generated-file digest changed after exact UNLOAD-REPORT-02 cleanup." >&2
  exit 1
fi
printf 'failure_probe_residual=0\nsuccess_residual=0\nadmin_residual=0\nstorage_restored=true\ngenerated_files_restored=true\n' \
  > "$artifact_dir/cleanup-verification.txt"

trap - EXIT
rm -rf "$runtime_backup_dir"
echo "UNLOAD-REPORT-02 artifacts: $artifact_dir"
