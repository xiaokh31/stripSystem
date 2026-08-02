#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
compose_file="$repo_root/infra/docker/compose.local.yml"
mode="${1:-verify}"
run_suffix="$(date +%s)-$$"
test_user_id="wage-hours-08-e2e-$run_suffix"
test_email="wage-hours-08-$run_suffix@example.invalid"
test_password="$(openssl rand -base64 30 | tr -d '\n')Aa1!"
artifact_root="$repo_root/test-results/wage-hours-08"
real_runtime_root="$artifact_root/runtime"
visual_root="$artifact_root/visual"
sample_sha="63927d94a027f77b41ce4345e38fb9f7b9df8b8d44b989e710fe7f50f4172597"

cd "$repo_root"

psql_task() {
  docker compose -f "$compose_file" exec -T postgres sh -c \
    'psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"' \
    sh "$@"
}

cleanup_database() {
  psql_task -v user_id="$test_user_id" <<'SQL'
BEGIN;
CREATE TEMP TABLE target_attendance_imports ON COMMIT DROP AS
SELECT id FROM attendance_imports WHERE imported_by_id = :'user_id';
DELETE FROM async_jobs
WHERE attendance_import_id IN (SELECT id FROM target_attendance_imports);
DELETE FROM attendance_row_audit_events
WHERE attendance_import_id IN (SELECT id FROM target_attendance_imports);
DELETE FROM attendance_rows
WHERE attendance_import_id IN (SELECT id FROM target_attendance_imports);
DELETE FROM attendance_import_audit_events
WHERE attendance_import_id IN (SELECT id FROM target_attendance_imports);
DELETE FROM wage_generated_files
WHERE attendance_import_id IN (SELECT id FROM target_attendance_imports);
DELETE FROM attendance_imports WHERE id IN (SELECT id FROM target_attendance_imports);
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

cleanup_storage() {
  while IFS= read -r import_id; do
    [[ -z "$import_id" ]] && continue
    if [[ ! "$import_id" =~ ^[A-Za-z0-9_-]{20,40}$ ]]; then
      echo "WAGE-HOURS-08 cleanup rejected an invalid import id." >&2
      return 1
    fi
    target="$repo_root/storage/attendance_imports/$import_id"
    [[ -d "$target" ]] || continue
    case "$target" in
      "$repo_root"/storage/attendance_imports/*)
        find "$target" -depth -delete
        ;;
      *)
        echo "WAGE-HOURS-08 cleanup rejected a path outside attendance_imports." >&2
        return 1
        ;;
    esac
  done < <(
    psql_task -At -v user_id="$test_user_id" <<'SQL'
SELECT id FROM attendance_imports WHERE imported_by_id = :'user_id';
SQL
  )
}

cleanup_runtime() {
  local run_id="$1"
  if [[ ! "$run_id" =~ ^[0-9]+-[0-9]+-(cleanup-probe|success)$ ]]; then
    echo "WAGE-HOURS-08 cleanup rejected an invalid runtime id." >&2
    return 1
  fi
  local target="$real_runtime_root/$run_id"
  [[ -d "$target" ]] || return 0
  case "$target" in
    "$real_runtime_root"/*) find "$target" -depth -delete ;;
    *) return 1 ;;
  esac
}

residual_count() {
  psql_task -At -v user_id="$test_user_id" <<'SQL'
SELECT
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

cleanup_task_state() {
  cleanup_storage
  cleanup_database
}

cleanup_on_exit() {
  original_status=$?
  trap - EXIT
  set +e
  cleanup_task_state
  cleanup_runtime "$run_suffix-cleanup-probe"
  cleanup_runtime "$run_suffix-success"
  set -e
  exit "$original_status"
}
trap cleanup_on_exit EXIT

create_test_user() {
  cleanup_task_state
  local password_hash
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
  (:'user_id', :'email', 'WAGE-HOURS-08 E2E Admin', :'password_hash',
   'OFFICE', true, NOW(), NOW());
INSERT INTO user_roles
  (id, user_id, role_id, assigned_at, created_at, updated_at)
SELECT
  :'user_id' || '-role', :'user_id', id, NOW(), NOW(), NOW()
FROM roles
WHERE code = 'ADMIN';
COMMIT;
SQL
}

run_browser() {
  local run_id="$1"
  local force_failure="$2"
  docker compose -f "$compose_file" --profile e2e run --rm \
    -e E2E_ADMIN_EMAIL="$test_email" \
    -e E2E_ADMIN_PASSWORD="$test_password" \
    -e WAGE_HOURS_08_RUN_ID="$run_id" \
    -e WAGE_HOURS_08_FORCE_FAILURE="$force_failure" \
    e2e-web pnpm exec playwright test wage-hours-08.spec.ts \
    --config=playwright.wage-hours-08.config.ts --project=chromium \
    --output="/tmp/wage-hours-08-playwright-$run_id"
}

run_real_workbook_audit() {
  local run_id="$1"
  local runtime_container="/workspace/test-results/wage-hours-08/runtime/$run_id"
  docker compose -f "$compose_file" run --rm -T --no-deps \
    -v "$repo_root/test-results:/workspace/test-results" \
    -v "$repo_root/scripts/audit-wage-hours-08-workbook.py:/tmp/audit-wage-hours-08-workbook.py:ro" \
    worker-python uv run python /tmp/audit-wage-hours-08-workbook.py \
    --workbook "$runtime_container/api-downloaded-wage-record.xls" \
    --template /workspace/samples/wage/20260601-0630_wageRecords.xls \
    --period-start 2026-07-01 --period-end 2026-07-31 \
    --output /workspace/test-results/wage-hours-08/real-workbook-audit.json
}

run_visual_gate() {
  find "$visual_root" -depth -delete 2>/dev/null || true
  docker compose -f "$compose_file" run --rm -T --no-deps \
    -v "$repo_root/test-results:/workspace/test-results" \
    worker-python uv run python \
    tests/fixtures/generate_wage_hours_08_visual_workbooks.py \
    --output-dir /workspace/test-results/wage-hours-08/visual
  docker compose -f "$compose_file" --profile report-visual build \
    wage-hours-08-visual-test
  docker compose -f "$compose_file" --profile report-visual run --rm -T --no-deps \
    wage-hours-08-visual-test /workspace/test-results/wage-hours-08/visual
}

source_file="$(find "$repo_root/samples/attendance_test" -maxdepth 1 -type f -name '*.xls' -print)"
if [[ -z "$source_file" || "$(printf '%s\n' "$source_file" | wc -l | tr -d ' ')" != "1" ]]; then
  echo "WAGE-HOURS-08 requires exactly one approved real .xls sample." >&2
  exit 1
fi
if [[ "$(shasum -a 256 "$source_file" | awk '{print $1}')" != "$sample_sha" ]]; then
  echo "WAGE-HOURS-08 real sample SHA-256 changed." >&2
  exit 1
fi

if [[ "$mode" == "repro" ]]; then
  create_test_user
  run_browser "$run_suffix-success" 0
  exit 0
fi
if [[ "$mode" != "verify" ]]; then
  echo "Usage: $0 [repro|verify]" >&2
  exit 2
fi

docker compose -f "$compose_file" up -d --build \
  worker-python api web nginx
docker compose -f "$compose_file" --profile e2e build e2e-web

probe_id="$run_suffix-cleanup-probe"
create_test_user
set +e
run_browser "$probe_id" 1
probe_status=$?
set -e
if [[ "$probe_status" -eq 0 ]]; then
  echo "WAGE-HOURS-08 intentional failure cleanup probe unexpectedly passed." >&2
  exit 1
fi
cleanup_task_state
cleanup_runtime "$probe_id"
if [[ "$(residual_count)" != "0" || -e "$real_runtime_root/$probe_id" ]]; then
  echo "WAGE-HOURS-08 intentional failure cleanup probe left residue." >&2
  exit 1
fi

success_id="$run_suffix-success"
create_test_user
run_browser "$success_id" 0
run_real_workbook_audit "$success_id"
cp "$real_runtime_root/$success_id/repro-evidence.json" \
  "$artifact_root/real-sanitized-evidence.json"
cleanup_task_state
cleanup_runtime "$success_id"
if [[ "$(residual_count)" != "0" || -e "$real_runtime_root/$success_id" ]]; then
  echo "WAGE-HOURS-08 success path left database, storage, or runtime residue." >&2
  exit 1
fi
if [[ "$(shasum -a 256 "$source_file" | awk '{print $1}')" != "$sample_sha" ]]; then
  echo "WAGE-HOURS-08 real sample changed during verification." >&2
  exit 1
fi

run_visual_gate
trap - EXIT
echo "WAGE-HOURS-08 full-stack, package, privacy cleanup, and visual gate passed."
