#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
compose_file="$repo_root/infra/docker/compose.local.yml"
mode="${1:-verify}"
run_suffix="$(date +%s)-$$"
test_user_id="file-upload-01-e2e-$run_suffix"
test_email="file-upload-01-$run_suffix@example.invalid"
test_password="$(openssl rand -base64 30 | tr -d '\n')Aa1!"

cd "$repo_root"

psql_task() {
  docker compose -f "$compose_file" exec -T postgres sh -c \
    'psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"' \
    sh "$@"
}

cleanup_storage() {
  while IFS= read -r stored_path; do
    [[ -z "$stored_path" ]] && continue
    case "$stored_path" in
      /workspace/storage/original_files/*|/workspace/storage/attendance_original_files/*)
        relative_path="${stored_path#/workspace/storage/}"
        target_path="$repo_root/storage/$relative_path"
        if [[ -f "$target_path" ]]; then
          rm -f -- "$target_path"
        fi
        ;;
      *)
        echo "FILE-UPLOAD-01 cleanup rejected a path outside original_files." >&2
        return 1
        ;;
    esac
  done < <(
    psql_task -At -v user_id="$test_user_id" <<'SQL'
SELECT stored_path FROM import_files WHERE imported_by_id = :'user_id'
UNION ALL
SELECT stored_path FROM attendance_imports WHERE imported_by_id = :'user_id';
SQL
  )
}

verify_filename_evidence() {
  evidence_count="$(psql_task -At -v user_id="$test_user_id" <<'SQL'
SELECT
  (SELECT COUNT(*) FROM import_files
   WHERE imported_by_id = :'user_id'
     AND original_filename = '卸柜清单_(中文).xlsx'
     AND transport_filename = original_filename
     AND filename_codec_version = 'upload-filename-v1'
     AND filename_review_code IS NULL
     AND storage_basename = original_filename
     AND file_sha256 = 'a30b0373c0dbcd46ab55fe98016058e6479aea7c6bb12a4bc4e5766f1f89450e') +
  (SELECT COUNT(*) FROM attendance_imports
   WHERE imported_by_id = :'user_id'
     AND original_filename = '1_(7月)员工刷卡记录表.xls'
     AND transport_filename = original_filename
     AND filename_codec_version = 'upload-filename-v1'
     AND filename_review_code IS NULL
     AND storage_basename = original_filename
     AND file_sha256 = '63927d94a027f77b41ce4345e38fb9f7b9df8b8d44b989e710fe7f50f4172597');
SQL
)"
  if [[ "$evidence_count" != "2" ]]; then
    echo "FILE-UPLOAD-01 canonical/raw/storage evidence mismatch." >&2
    return 1
  fi

  while IFS='|' read -r stored_path expected_sha; do
    [[ -z "$stored_path" ]] && continue
    case "$stored_path" in
      /workspace/storage/original_files/*|/workspace/storage/attendance_original_files/*)
        relative_path="${stored_path#/workspace/storage/}"
        actual_sha="$(shasum -a 256 "$repo_root/storage/$relative_path" | awk '{print $1}')"
        [[ "$actual_sha" == "$expected_sha" ]] || return 1
        ;;
      *)
        return 1
        ;;
    esac
  done < <(
    psql_task -At -F '|' -v user_id="$test_user_id" <<'SQL'
SELECT stored_path, file_sha256 FROM import_files WHERE imported_by_id = :'user_id'
UNION ALL
SELECT stored_path, file_sha256 FROM attendance_imports WHERE imported_by_id = :'user_id';
SQL
  )
}

cleanup_database() {
  psql_task -v user_id="$test_user_id" <<'SQL'
BEGIN;
DELETE FROM import_files WHERE imported_by_id = :'user_id';
DELETE FROM attendance_import_audit_events
WHERE attendance_import_id IN (
  SELECT id FROM attendance_imports WHERE imported_by_id = :'user_id'
);
DELETE FROM attendance_imports WHERE imported_by_id = :'user_id';
DELETE FROM auth_audit_events
WHERE user_id = :'user_id' OR actor_user_id = :'user_id';
DELETE FROM native_auth_sessions
WHERE user_id = :'user_id' OR revoked_by_user_id = :'user_id';
DELETE FROM user_roles
WHERE user_id = :'user_id' OR assigned_by_id = :'user_id';
DELETE FROM users WHERE id = :'user_id';
COMMIT;
SQL
}

cleanup_fixtures() {
  cleanup_storage
  cleanup_database
}

residual_count() {
  psql_task -At -v user_id="$test_user_id" <<'SQL'
SELECT
  (SELECT COUNT(*) FROM import_files WHERE imported_by_id = :'user_id') +
  (SELECT COUNT(*) FROM attendance_import_audit_events
   WHERE attendance_import_id IN (
     SELECT id FROM attendance_imports WHERE imported_by_id = :'user_id'
   )) +
  (SELECT COUNT(*) FROM attendance_imports WHERE imported_by_id = :'user_id') +
  (SELECT COUNT(*) FROM auth_audit_events
   WHERE user_id = :'user_id' OR actor_user_id = :'user_id') +
  (SELECT COUNT(*) FROM native_auth_sessions
   WHERE user_id = :'user_id' OR revoked_by_user_id = :'user_id') +
  (SELECT COUNT(*) FROM user_roles
   WHERE user_id = :'user_id' OR assigned_by_id = :'user_id') +
  (SELECT COUNT(*) FROM users WHERE id = :'user_id');
SQL
}

cleanup_on_exit() {
  original_status=$?
  trap - EXIT
  set +e
  cleanup_fixtures
  cleanup_status=$?
  set -e
  if [[ "$cleanup_status" -ne 0 ]]; then
    exit 1
  fi
  exit "$original_status"
}
trap cleanup_on_exit EXIT

cleanup_fixtures
password_hash="$({
  docker compose -f "$compose_file" exec -T \
    -e TASK_PASSWORD="$test_password" \
    api node -e \
    'const {PasswordService}=require("/workspace/apps/api/dist/src/auth/password.service"); new PasswordService().hashPassword(process.env.TASK_PASSWORD).then((value)=>process.stdout.write(value))'
} 2>/dev/null)"
psql_task \
  -v user_id="$test_user_id" \
  -v email="$test_email" \
  -v password_hash="$password_hash" <<'SQL'
BEGIN;
INSERT INTO users
  (id, email, name, password_hash, role, is_active, created_at, updated_at)
VALUES
  (:'user_id', :'email', 'FILE-UPLOAD-01 E2E Admin', :'password_hash',
   'OFFICE', true, NOW(), NOW());
INSERT INTO user_roles
  (id, user_id, role_id, assigned_at, created_at, updated_at)
SELECT
  :'user_id' || '-role', :'user_id', id, NOW(), NOW(), NOW()
FROM roles
WHERE code = 'ADMIN';
COMMIT;
SQL

run_browser() {
  docker compose -f "$compose_file" --profile e2e run --rm \
    -e E2E_ADMIN_EMAIL="$test_email" \
    -e E2E_ADMIN_PASSWORD="$test_password" \
    -e FILE_UPLOAD_01_RUN_ID="$run_suffix-$1" \
    ${2:+-e E2E_FORCE_FAILURE="$2"} \
    e2e-web file-upload-unicode.spec.ts --project=chromium \
    --output="test-results/file-upload-01/$1"
}

if [[ "$mode" == "repro" ]]; then
  run_browser repro ""
  exit 0
fi

set +e
run_browser cleanup-probe "1"
probe_status=$?
set -e
if [[ "$probe_status" -eq 0 ]]; then
  echo "Intentional FILE-UPLOAD-01 cleanup probe unexpectedly passed." >&2
  exit 1
fi
cleanup_fixtures
if [[ "$(residual_count)" != "0" ]]; then
  echo "FILE-UPLOAD-01 cleanup probe left database residue." >&2
  exit 1
fi

psql_task \
  -v user_id="$test_user_id" \
  -v email="$test_email" \
  -v password_hash="$password_hash" <<'SQL'
BEGIN;
INSERT INTO users
  (id, email, name, password_hash, role, is_active, created_at, updated_at)
VALUES
  (:'user_id', :'email', 'FILE-UPLOAD-01 E2E Admin', :'password_hash',
   'OFFICE', true, NOW(), NOW());
INSERT INTO user_roles
  (id, user_id, role_id, assigned_at, created_at, updated_at)
SELECT
  :'user_id' || '-role', :'user_id', id, NOW(), NOW(), NOW()
FROM roles
WHERE code = 'ADMIN';
COMMIT;
SQL
run_browser success ""
verify_filename_evidence
cleanup_fixtures
trap - EXIT

if [[ "$(residual_count)" != "0" ]]; then
  echo "FILE-UPLOAD-01 success run left database residue." >&2
  exit 1
fi
"$repo_root/scripts/verify-file-upload-01-repair.sh"
echo "FILE-UPLOAD-01 browser/full-stack cleanup gate passed."
