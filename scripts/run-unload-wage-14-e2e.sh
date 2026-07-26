#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
compose_file="$repo_root/infra/docker/compose.local.yml"
run_suffix="$(date +%s)-$$"
test_user_id="uw14-e2e-admin-$run_suffix"
test_email="uw14-admin-$run_suffix@example.invalid"
test_password="$(openssl rand -base64 30 | tr -d '\n')Aa1!"
success_prefix="uw14-success-$run_suffix"
failure_prefix="uw14-failure-$run_suffix"

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
    -e UNLOADING_WAGE_CLEANUP_ONLY=1 \
    -e UNLOADING_WAGE_CLEANUP_PREFIXES="$success_prefix,$failure_prefix" \
    e2e-web pnpm exec playwright test \
      unloading-wage-fixture-cleanup.spec.ts \
      --project=chromium \
      --output=test-results/unload-wage-14-shell-cleanup
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
  (:'user_id', :'email', 'UNLOAD-WAGE-14 E2E Admin', :'password_hash',
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
  e2e-web pnpm exec playwright test \
    unloading-wage.spec.ts \
    --project=chromium \
    --output=test-results/unload-wage-14-failure-probe
failure_status=$?
set -e
if [[ "$failure_status" -eq 0 ]]; then
  echo "Intentional unloading wage cleanup failure probe unexpectedly passed." >&2
  exit 1
fi

E2E_ADMIN_EMAIL="$test_email" E2E_ADMIN_PASSWORD="$test_password" \
  docker compose -f "$compose_file" --profile e2e run --rm \
  -e UNLOADING_WAGE_E2E_PREFIX="$success_prefix" \
  e2e-web pnpm exec playwright test \
    unloading-wage.spec.ts \
    --project=chromium \
    --project=mobile-chrome \
    --output=test-results/unload-wage-14

cleanup_fixtures_from_shell
residual="$(
  psql_task -At \
    -v success_pattern="%$success_prefix%" \
    -v failure_pattern="%$failure_prefix%" <<'SQL'
SELECT
  (SELECT COUNT(*) FROM containers
   WHERE container_no ILIKE :'success_pattern'
      OR container_no ILIKE :'failure_pattern') +
  (SELECT COUNT(*) FROM unloading_workers
   WHERE worker_code ILIKE :'success_pattern'
      OR worker_code ILIKE :'failure_pattern') +
  (SELECT COUNT(*) FROM users
   WHERE email ILIKE :'success_pattern'
      OR email ILIKE :'failure_pattern');
SQL
)"
if [[ "$residual" != "0" ]]; then
  echo "UNLOAD-WAGE-14 E2E residual audit failed: $residual" >&2
  exit 1
fi

cleanup_admin
