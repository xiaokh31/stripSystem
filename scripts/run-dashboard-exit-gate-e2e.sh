#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
compose_file="$repo_root/infra/docker/compose.local.yml"
run_suffix="$(date +%s)-$$"
test_user_id="dash08-e2e-admin-$run_suffix"
test_email="dash08-$run_suffix@example.invalid"
test_password="$(openssl rand -base64 30 | tr -d '\n')Aa1!"

cd "$repo_root"

test_hash="$(
  docker compose -f "$compose_file" exec -T \
    -e TASK_PASSWORD="$test_password" \
    api node -e \
    'const {PasswordService}=require("/workspace/apps/api/dist/src/auth/password.service"); new PasswordService().hashPassword(process.env.TASK_PASSWORD).then((value)=>process.stdout.write(value))'
)"

psql_with_variables() {
  docker compose -f "$compose_file" exec -T postgres sh -c \
    'psql -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"' \
    sh "$@"
}

cleanup() {
  psql_with_variables -v user_id="$test_user_id" <<'SQL'
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
trap cleanup EXIT

cleanup
psql_with_variables \
  -v user_id="$test_user_id" \
  -v email="$test_email" \
  -v password_hash="$test_hash" <<'SQL'
BEGIN;
INSERT INTO users
  (id, email, name, password_hash, role, is_active, created_at, updated_at)
VALUES
  (:'user_id', :'email', 'Dashboard Exit Gate Admin', :'password_hash',
   'OFFICE', true, NOW(), NOW());
INSERT INTO user_roles
  (id, user_id, role_id, assigned_at, created_at, updated_at)
SELECT
  :'user_id' || '-role', :'user_id', id, NOW(), NOW(), NOW()
FROM roles
WHERE code = 'ADMIN';
COMMIT;
SQL

E2E_ADMIN_EMAIL="$test_email" \
E2E_ADMIN_PASSWORD="$test_password" \
  docker compose -f "$compose_file" --profile e2e run --rm e2e-web "$@"

cleanup
trap - EXIT

residual="$(
  psql_with_variables -At -v user_id="$test_user_id" <<'SQL'
SELECT COUNT(*) FROM users WHERE id = :'user_id';
SQL
)"
if [[ "$residual" != "0" ]]; then
  echo "Temporary Dashboard E2E administrator cleanup failed." >&2
  exit 1
fi
echo "Temporary Dashboard E2E administrator residue: 0"
