#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
local_compose="$repo_root/infra/docker/compose.local.yml"
public_compose="$repo_root/infra/docker/compose.public.yml"
tunnel_compose="$repo_root/infra/docker/compose.cloudflare-tunnel.yml"
test_compose="$repo_root/infra/docker/compose.public-dual-ingress-test.yml"
lan_disabled_compose="$repo_root/infra/docker/compose.public-lan-disabled-test.yml"
tls_dir="$(mktemp -d)"
run_suffix="$(date +%s)-$$"
test_user_id="public-deploy-04-$run_suffix"
test_email="public-deploy-04-$run_suffix@example.invalid"
test_password="$(openssl rand -base64 30 | tr -d '\n')Aa1!"
test_secret="$(openssl rand -hex 32)"

export PUBLIC_BASE_URL=https://public-edge-emulator
export CORS_ORIGINS=https://public-edge-emulator
export LAN_BROWSER_ORIGINS=http://nginx
export LAN_BIND_ADDRESS=0.0.0.0
export LAN_HTTP_PORT=18081
export PUBLIC_HTTP_PORT=18080
export PUBLIC_DEPLOY_04_TLS_DIR="$tls_dir"
export TRUSTED_PROXY_MODE=cloudflare-tunnel
export TRUSTED_PROXY_CIDRS=172.16.0.0/12
export JWT_SECRET="$test_secret"

compose_args=(
  -f "$local_compose"
  -f "$public_compose"
  -f "$tunnel_compose"
  -f "$test_compose"
)

psql_task() {
  docker compose -f "$local_compose" exec -T postgres sh -c \
    'psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"' \
    sh "$@"
}

cleanup_user() {
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

cleanup_business_fixture() {
  local storage_path relative_path host_path storage_paths

  storage_paths="$(
    psql_task -At -v user_id="$test_user_id" <<'SQL'
WITH target_imports AS (
  SELECT id FROM import_files
  WHERE imported_by_id = :'user_id'
     OR original_filename = 'public-deploy-04-outage.xlsx'
), target_containers AS (
  SELECT id FROM containers
  WHERE import_file_id IN (SELECT id FROM target_imports)
)
SELECT stored_path FROM import_files
WHERE id IN (SELECT id FROM target_imports)
UNION
SELECT storage_path FROM generated_files
WHERE import_file_id IN (SELECT id FROM target_imports)
   OR container_id IN (SELECT id FROM target_containers)
ORDER BY 1;
SQL
  )"

  psql_task -v user_id="$test_user_id" <<'SQL'
BEGIN;
CREATE TEMP TABLE public04_target_imports (id text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO public04_target_imports (id)
SELECT id FROM import_files
WHERE imported_by_id = :'user_id'
   OR original_filename = 'public-deploy-04-outage.xlsx';
CREATE TEMP TABLE public04_target_containers (id text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO public04_target_containers (id)
SELECT id FROM containers
WHERE import_file_id IN (SELECT id FROM public04_target_imports);
CREATE TEMP TABLE public04_target_lines (id text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO public04_target_lines (id)
SELECT id FROM container_lines
WHERE container_id IN (SELECT id FROM public04_target_containers);
CREATE TEMP TABLE public04_target_destinations (id text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO public04_target_destinations (id)
SELECT id FROM container_destinations
WHERE container_id IN (SELECT id FROM public04_target_containers);
CREATE TEMP TABLE public04_target_pallets (id text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO public04_target_pallets (id)
SELECT id FROM pallets
WHERE container_destination_id IN (SELECT id FROM public04_target_destinations);
CREATE TEMP TABLE public04_target_generated (id text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO public04_target_generated (id)
SELECT id FROM generated_files
WHERE import_file_id IN (SELECT id FROM public04_target_imports)
   OR container_id IN (SELECT id FROM public04_target_containers);

DELETE FROM generated_file_replacements
WHERE old_generated_file_id IN (SELECT id FROM public04_target_generated)
   OR new_generated_file_id IN (SELECT id FROM public04_target_generated);
DELETE FROM correction_feedback
WHERE import_file_id IN (SELECT id FROM public04_target_imports)
   OR container_id IN (SELECT id FROM public04_target_containers)
   OR container_line_id IN (SELECT id FROM public04_target_lines)
   OR container_destination_id IN (SELECT id FROM public04_target_destinations)
   OR pallet_id IN (SELECT id FROM public04_target_pallets)
   OR generated_file_id IN (SELECT id FROM public04_target_generated);
DELETE FROM parser_profile_audit_events
WHERE import_file_id IN (SELECT id FROM public04_target_imports)
   OR container_id IN (SELECT id FROM public04_target_containers);
DELETE FROM parser_profile_reviews
WHERE import_file_id IN (SELECT id FROM public04_target_imports);
DELETE FROM parser_profile_evidence
WHERE import_file_id IN (SELECT id FROM public04_target_imports);
DELETE FROM pallet_events
WHERE pallet_id IN (SELECT id FROM public04_target_pallets);
DELETE FROM inventory_adjustments
WHERE container_id IN (SELECT id FROM public04_target_containers)
   OR container_destination_id IN (SELECT id FROM public04_target_destinations);
DELETE FROM async_jobs
WHERE import_file_id IN (SELECT id FROM public04_target_imports)
   OR container_id IN (SELECT id FROM public04_target_containers)
   OR generated_file_id IN (SELECT id FROM public04_target_generated);
DELETE FROM pallets WHERE id IN (SELECT id FROM public04_target_pallets);
DELETE FROM container_lines WHERE id IN (SELECT id FROM public04_target_lines);
DELETE FROM container_destinations WHERE id IN (SELECT id FROM public04_target_destinations);
DELETE FROM generated_files WHERE id IN (SELECT id FROM public04_target_generated);
DELETE FROM containers WHERE id IN (SELECT id FROM public04_target_containers);
DELETE FROM import_files WHERE id IN (SELECT id FROM public04_target_imports);
COMMIT;
SQL

  while IFS= read -r storage_path; do
    [[ -z "$storage_path" ]] && continue
    relative_path="${storage_path#/workspace/storage/}"
    if [[ "$relative_path" == "$storage_path" || "$relative_path" == *".."* ]]; then
      echo "Unsafe PUBLIC-DEPLOY-04 fixture path rejected: $storage_path" >&2
      return 1
    fi
    host_path="$repo_root/storage/$relative_path"
    find "$host_path" -maxdepth 0 -type f -delete 2>/dev/null || true
  done <<< "$storage_paths"

  if [[ "$(psql_task -At -v user_id="$test_user_id" <<'SQL'
SELECT COUNT(*) FROM import_files
WHERE imported_by_id = :'user_id'
   OR original_filename = 'public-deploy-04-outage.xlsx';
SQL
)" != "0" ]]; then
    echo "PUBLIC-DEPLOY-04 fixture database cleanup was incomplete" >&2
    return 1
  fi
}

assert_ingress_audit_evidence() {
  local public_logins lan_logins public_rejections lan_rejections
  IFS='|' read -r public_logins lan_logins public_rejections lan_rejections <<EOF
$(psql_task -At -F '|' -v user_id="$test_user_id" <<'SQL'
SELECT
  COUNT(*) FILTER (
    WHERE event_code = 'BROWSER_LOGIN_SUCCEEDED'
      AND metadata->>'ingressType' = 'public'
  ),
  COUNT(*) FILTER (
    WHERE event_code = 'BROWSER_LOGIN_SUCCEEDED'
      AND metadata->>'ingressType' = 'lan'
  ),
  COUNT(*) FILTER (
    WHERE event_code = 'CSRF_REJECTED'
      AND metadata->>'ingressType' = 'public'
      AND metadata->>'reason' = 'BROWSER_INGRESS_REJECTED'
  ),
  COUNT(*) FILTER (
    WHERE event_code = 'CSRF_REJECTED'
      AND metadata->>'ingressType' = 'lan'
      AND metadata->>'reason' = 'BROWSER_INGRESS_REJECTED'
  )
FROM auth_audit_events
WHERE user_id = :'user_id';
SQL
)
EOF
  if (( public_logins < 1 || lan_logins < 1 || public_rejections < 1 || lan_rejections < 1 )); then
    echo "PUBLIC-DEPLOY-04 ingress audit attribution evidence was incomplete" >&2
    return 1
  fi
}

cleanup() {
  status=$?
  trap - EXIT
  set +e
  cleanup_business_fixture
  cleanup_user
  docker compose "${compose_args[@]}" --profile public-deploy-04-test rm -sf public-edge-emulator >/dev/null 2>&1
  docker compose -f "$local_compose" up -d --no-deps --force-recreate api web nginx >/dev/null 2>&1
  find "$tls_dir" -type f -exec unlink {} + 2>/dev/null || true
  rmdir "$tls_dir" 2>/dev/null || true
  exit "$status"
}
trap cleanup EXIT

openssl req -x509 -newkey rsa:2048 -nodes -days 1 \
  -subj '/CN=public-edge-emulator' \
  -addext 'subjectAltName=DNS:public-edge-emulator' \
  -keyout "$tls_dir/tls.key" -out "$tls_dir/tls.crt" >/dev/null 2>&1

docker compose "${compose_args[@]}" --profile public-deploy-04-test \
  up -d --build api web nginx public-edge-emulator
export PUBLIC_DEPLOY_04_EDGE_IP="$(
  docker inspect docker-public-edge-emulator-1 \
    | jq -r '.[0].NetworkSettings.Networks | to_entries | map(.value.IPAddress) | map(select(length > 0)) | first'
)"
if [[ ! "$PUBLIC_DEPLOY_04_EDGE_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Unable to resolve the public edge emulator container IP" >&2
  docker inspect -f 'status={{.State.Status}} error={{.State.Error}} networks={{json .NetworkSettings.Networks}}' \
    docker-public-edge-emulator-1 >&2 || true
  docker logs docker-public-edge-emulator-1 >&2 || true
  exit 1
fi
docker compose "${compose_args[@]}" --profile public-deploy-04-test --profile e2e build e2e-web

test_hash="$(
  docker compose -f "$local_compose" exec -T -e TASK_PASSWORD="$test_password" api node -e \
    'const {PasswordService}=require("/workspace/apps/api/dist/src/auth/password.service"); new PasswordService().hashPassword(process.env.TASK_PASSWORD).then((value)=>process.stdout.write(value))'
)"
cleanup_business_fixture
cleanup_user
psql_task -v user_id="$test_user_id" -v email="$test_email" -v password_hash="$test_hash" <<'SQL'
BEGIN;
INSERT INTO users
  (id, email, name, password_hash, role, is_active, created_at, updated_at)
VALUES
  (:'user_id', :'email', 'PUBLIC-DEPLOY-04 E2E Admin', :'password_hash',
   'OFFICE', true, NOW(), NOW());
INSERT INTO user_roles
  (id, user_id, role_id, assigned_at, created_at, updated_at)
SELECT
  :'user_id' || '-role', :'user_id', id, NOW(), NOW(), NOW()
FROM roles
WHERE code = 'ADMIN';
COMMIT;
SQL

docker compose "${compose_args[@]}" --profile public-deploy-04-test --profile e2e \
  run --rm --no-deps --entrypoint sh e2e-web -c \
    'getent hosts public-edge-emulator nginx && wget --no-check-certificate -qO- https://public-edge-emulator/api/health >/dev/null && wget -qO- http://nginx/api/health >/dev/null'

run_browser_phase() {
  local phase="${1:-normal}"
  docker compose "${compose_args[@]}" --profile public-deploy-04-test --profile e2e run --rm --no-deps \
    -e E2E_ADMIN_EMAIL="$test_email" \
    -e E2E_ADMIN_PASSWORD="$test_password" \
    -e PUBLIC_DEPLOY_04_OUTAGE="$([[ "$phase" == "outage" ]] && echo true || echo false)" \
    -e PUBLIC_DEPLOY_04_PUBLIC_ONLY="$([[ "$phase" == "public-only" ]] && echo true || echo false)" \
    e2e-web pnpm exec playwright test public-deploy-04-dual-ingress.spec.ts \
      --project=chromium --output=test-results/public-deploy-04
}

run_browser_phase normal
docker compose "${compose_args[@]}" --profile public-deploy-04-test stop public-edge-emulator
run_browser_phase outage
docker compose "${compose_args[@]}" --profile public-deploy-04-test up -d public-edge-emulator
run_browser_phase normal

docker compose "${compose_args[@]}" -f "$lan_disabled_compose" \
  --profile public-deploy-04-test up -d --no-deps --force-recreate --wait nginx
if curl -fsS "http://127.0.0.1:$LAN_HTTP_PORT/api/health" >/dev/null 2>&1; then
  echo "LAN host listener remained published during the LAN-disabled phase" >&2
  exit 1
fi
run_browser_phase public-only

assert_ingress_audit_evidence
cleanup_business_fixture
cleanup_user
echo "PUBLIC-DEPLOY-04 dual-ingress Chromium and outage regression: PASS"
