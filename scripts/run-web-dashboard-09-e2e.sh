#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
compose_file="$repo_root/infra/docker/compose.local.yml"
run_suffix="$(date +%s)-$$"
test_user_id="wd09-e2e-admin-$run_suffix"
test_email="wd09-$run_suffix@example.invalid"
test_password="$(openssl rand -base64 30 | tr -d '\n')Aa1!"
success_prefix="wd09-success-$run_suffix"
failure_prefix="wd09-failure-$run_suffix"
clock_prefix="wd09-clock-$run_suffix"

cd "$repo_root"

psql_task() {
  docker compose -f "$compose_file" exec -T postgres sh -c \
    'psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"' \
    sh "$@"
}

cleanup_admin() {
  psql_task -v user_id="$test_user_id" <<'SQL'
BEGIN;
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

cleanup_fixtures_from_shell() {
  E2E_ADMIN_EMAIL="$test_email" E2E_ADMIN_PASSWORD="$test_password" \
    docker compose -f "$compose_file" --profile e2e run --rm \
    -e WEB_DASHBOARD_09_CLEANUP_ONLY=1 \
    -e UNLOADING_WAGE_SUCCESS_PREFIX="$success_prefix" \
    -e UNLOADING_WAGE_FAILURE_PREFIX="$failure_prefix" \
    -e DASHBOARD_CLOCK_E2E_PREFIX="$clock_prefix" \
    e2e-web pnpm exec playwright test \
      dashboard-09-fixture-cleanup.spec.ts \
      --project=chromium \
      --output=test-results/web-dashboard-09-shell-cleanup
}

cleanup_on_exit() {
  original_status=$?
  trap - EXIT
  set +e
  cleanup_fixtures_from_shell
  fixture_cleanup_status=$?
  cleanup_admin
  admin_cleanup_status=$?
  if [[ "$fixture_cleanup_status" -ne 0 || "$admin_cleanup_status" -ne 0 ]]; then
    exit 1
  fi
  exit "$original_status"
}
trap cleanup_on_exit EXIT

dedicated_month_count="$(
  psql_task -At <<'SQL'
SELECT
  (SELECT COUNT(*) FROM pay_containers
   WHERE completed_at >= TIMESTAMPTZ '2001-01-01T07:00:00Z'
     AND completed_at < TIMESTAMPTZ '2001-02-01T07:00:00Z') +
  (SELECT COUNT(*) FROM unloading_wage_settlements
   WHERE settlement_month = '2001-01');
SQL
)"
if [[ "$dedicated_month_count" != "0" ]]; then
  echo "Dedicated historical E2E month 2001-01 contains non-fixture records." >&2
  exit 1
fi

test_hash="$(
  docker compose -f "$compose_file" exec -T \
    -e TASK_PASSWORD="$test_password" \
    api node -e \
    'const {PasswordService}=require("/workspace/apps/api/dist/src/auth/password.service"); new PasswordService().hashPassword(process.env.TASK_PASSWORD).then((value)=>process.stdout.write(value))'
)"
cleanup_admin
psql_task \
  -v user_id="$test_user_id" \
  -v email="$test_email" \
  -v password_hash="$test_hash" <<'SQL'
BEGIN;
INSERT INTO users
  (id, email, name, password_hash, role, is_active, created_at, updated_at)
VALUES
  (:'user_id', :'email', 'WEB-DASHBOARD-09 E2E Admin', :'password_hash',
   'OFFICE', true, NOW(), NOW());
INSERT INTO user_roles
  (id, user_id, role_id, assigned_at, created_at, updated_at)
SELECT
  :'user_id' || '-role', :'user_id', id, NOW(), NOW(), NOW()
FROM roles
WHERE code = 'ADMIN';
COMMIT;
SQL

set +e
E2E_ADMIN_EMAIL="$test_email" E2E_ADMIN_PASSWORD="$test_password" \
  docker compose -f "$compose_file" --profile e2e run --rm \
  -e UNLOADING_WAGE_E2E_PREFIX="$failure_prefix" \
  -e E2E_FORCE_FAILURE=1 \
  e2e-web pnpm exec playwright test unloading-wage.spec.ts --project=chromium
failure_status=$?
set -e
if [[ "$failure_status" -eq 0 ]]; then
  echo "Intentional Playwright failure probe unexpectedly passed." >&2
  exit 1
fi

E2E_ADMIN_EMAIL="$test_email" E2E_ADMIN_PASSWORD="$test_password" \
  docker compose -f "$compose_file" --profile e2e run --rm \
  -e UNLOADING_WAGE_E2E_PREFIX="$success_prefix" \
  -e DASHBOARD_CLOCK_E2E_PREFIX="$clock_prefix" \
  e2e-web pnpm exec playwright test \
    unloading-wage.spec.ts dashboard-clock-integrity.spec.ts \
    --project=chromium

residual="$(
  psql_task -At \
    -v success_pattern="%$success_prefix%" \
    -v failure_pattern="%$failure_prefix%" \
    -v clock_pattern="$clock_prefix%" <<'SQL'
SELECT json_build_object(
  'fixtureRecords',
    (SELECT COUNT(*) FROM pay_containers
     WHERE trailer_number LIKE :'success_pattern'
        OR trailer_number LIKE :'failure_pattern') +
    (SELECT COUNT(*) FROM unloading_workers
     WHERE worker_code LIKE :'success_pattern'
        OR worker_code LIKE :'failure_pattern') +
    (SELECT COUNT(*) FROM users
     WHERE email LIKE :'success_pattern'
        OR email LIKE :'failure_pattern'),
  'clockFixtureRecords',
    (SELECT COUNT(*) FROM pay_containers WHERE id LIKE :'clock_pattern') +
    (SELECT COUNT(*) FROM containers WHERE id LIKE :'clock_pattern'),
  'dedicatedMonthRecords',
    (SELECT COUNT(*) FROM pay_containers
     WHERE completed_at >= TIMESTAMPTZ '2001-01-01T07:00:00Z'
       AND completed_at < TIMESTAMPTZ '2001-02-01T07:00:00Z') +
    (SELECT COUNT(*) FROM unloading_wage_settlements
     WHERE settlement_month = '2001-01')
)::text;
SQL
)"
echo "$residual"
if [[ "$residual" != *'"fixtureRecords" : 0'* ||
      "$residual" != *'"clockFixtureRecords" : 0'* ||
      "$residual" != *'"dedicatedMonthRecords" : 0'* ]]; then
  echo "WEB-DASHBOARD-09 E2E residual audit failed." >&2
  exit 1
fi

cleanup_admin
