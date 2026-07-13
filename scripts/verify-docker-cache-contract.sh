#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/infra/docker/compose.local.yml"
MODE="${1:---static}"

case "$MODE" in
  --static | --source-probe | --manifest-probe | --all) ;;
  *)
    echo "Usage: $0 [--static|--source-probe|--manifest-probe|--all]" >&2
    exit 2
    ;;
esac

pass() {
  echo "PASS: $1"
}

fail() {
  echo "FAIL: $1" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "required command is unavailable: $1"
}

line_number() {
  local file="$1"
  local pattern="$2"
  awk -v pattern="$pattern" 'index($0, pattern) { print NR; exit }' "$file"
}

assert_order() {
  local file="$1"
  local first_pattern="$2"
  local second_pattern="$3"
  local third_pattern="$4"
  local first_line second_line third_line

  first_line="$(line_number "$file" "$first_pattern")"
  second_line="$(line_number "$file" "$second_pattern")"
  third_line="$(line_number "$file" "$third_pattern")"

  [[ -n "$first_line" && -n "$second_line" && -n "$third_line" ]] ||
    fail "$file is missing an expected cache-contract instruction"
  ((first_line < second_line && second_line < third_line)) ||
    fail "$file does not place manifests, dependency install, and source COPY in cache-safe order"
}

assert_contains() {
  local file="$1"
  local pattern="$2"
  grep -Fq -- "$pattern" "$file" || fail "$file is missing: $pattern"
}

run_static_contract() (
  local config_json
  config_json="$(mktemp)"
  trap 'rm -f "$config_json"' EXIT

  docker compose -f "$COMPOSE_FILE" --profile e2e config --format json >"$config_json"
  jq -e '
    . as $config
    |
    ["postgres", "redis", "api", "web", "worker-python", "nginx", "e2e-web"]
    | all(. as $service | $config.services[$service] != null)
  ' "$config_json" >/dev/null || fail "Compose config is missing a required service"
  pass "Compose config parses with all runtime and e2e services"

  local runtime_commands
  runtime_commands="$(
    jq -r '
      [.services.api.command, .services.web.command, .services["worker-python"].command]
      | map(if type == "array" then join(" ") else . end)
      | join("\n")
    ' "$config_json"
  )"
  if grep -Eiq 'pnpm[[:space:]]+install|uv[[:space:]]+sync|prisma[[:space:]]+generate|pnpm[^\n]*[[:space:]]build|next[[:space:]]+build' <<<"$runtime_commands"; then
    fail "runtime commands contain dependency installation, generation, or application build"
  fi
  if grep -Eiq '(^|[[:space:]])pnpm([[:space:]]|$)|(^|[[:space:]])uv([[:space:]]|$)' <<<"$runtime_commands"; then
    fail "runtime commands route through package managers instead of baked binaries"
  fi
  pass "runtime commands directly migrate/start baked artifacts"

  jq -e '
    def targets($service): [.services[$service].volumes[]?.target];
    ([targets("api"), targets("web"), targets("worker-python")] | flatten) as $targets
    | [
        "/workspace/node_modules",
        "/workspace/apps/api/node_modules",
        "/workspace/apps/web/node_modules",
        "/workspace/apps/web/.next",
        "/workspace/apps/worker-python/.venv"
      ]
    | all(. as $forbidden | ($targets | index($forbidden) | not))
  ' "$config_json" >/dev/null || fail "a runtime mount shadows baked dependencies or build output"
  pass "runtime mounts do not shadow node_modules, .next, or .venv"

  jq -e '
    (.services.postgres.volumes | any(.target == "/var/lib/postgresql/data" and .type == "volume")) and
    (.services.api.volumes | any(.target == "/workspace/storage" and .type == "bind")) and
    (.services["worker-python"].volumes | any(.target == "/workspace/storage" and .type == "bind"))
  ' "$config_json" >/dev/null || fail "PostgreSQL or storage persistence contract changed"
  pass "PostgreSQL volume and storage bind mounts remain persistent"

  local api_dockerfile="$ROOT_DIR/infra/docker/api.Dockerfile"
  local web_dockerfile="$ROOT_DIR/infra/docker/web.Dockerfile"
  local worker_dockerfile="$ROOT_DIR/infra/docker/worker-python.Dockerfile"
  local e2e_dockerfile="$ROOT_DIR/infra/docker/web-e2e.Dockerfile"

  assert_order "$api_dockerfile" \
    "COPY package.json pnpm-lock.yaml pnpm-workspace.yaml" \
    "pnpm install --filter api... --frozen-lockfile" \
    "COPY apps/api apps/api"
  assert_order "$api_dockerfile" \
    "COPY apps/worker-python/pyproject.toml apps/worker-python/uv.lock" \
    "uv sync --directory apps/worker-python --frozen --no-install-project" \
    "COPY apps/worker-python apps/worker-python"
  assert_order "$web_dockerfile" \
    "COPY package.json pnpm-lock.yaml pnpm-workspace.yaml" \
    "pnpm install --filter web... --frozen-lockfile" \
    "COPY apps/web apps/web"
  assert_order "$worker_dockerfile" \
    "COPY apps/worker-python/pyproject.toml apps/worker-python/uv.lock" \
    "uv sync --frozen --no-install-project" \
    "COPY apps/worker-python ./"
  assert_order "$e2e_dockerfile" \
    "COPY package.json pnpm-lock.yaml pnpm-workspace.yaml" \
    "pnpm install --filter web... --frozen-lockfile" \
    "COPY apps/web apps/web"

  for dockerfile in "$api_dockerfile" "$web_dockerfile" "$e2e_dockerfile"; do
    assert_contains "$dockerfile" "corepack prepare pnpm@11.9.0 --activate"
    if grep -Fq -- "--frozen-lockfile=false" "$dockerfile"; then
      fail "$dockerfile disables frozen lockfile validation"
    fi
  done
  assert_contains "$worker_dockerfile" "uv sync --frozen --no-install-project"
  assert_contains "$worker_dockerfile" "UV_NO_SYNC=1"
  assert_contains "$api_dockerfile" "UV_NO_SYNC=1"
  assert_contains "$e2e_dockerfile" 'ENTRYPOINT ["./node_modules/.bin/playwright", "test"]'
  pass "Dockerfiles pin pnpm and place frozen dependency layers before source"
)

copy_probe_context() {
  local destination="$1"
  mkdir -p "$destination"
  (
    cd "$ROOT_DIR"
    tar \
      --exclude='node_modules' \
      --exclude='.next' \
      --exclude='.venv' \
      --exclude='dist' \
      --exclude='coverage' \
      --exclude='test-results' \
      --exclude='playwright-report' \
      -cf - \
      .dockerignore package.json pnpm-lock.yaml pnpm-workspace.yaml \
      infra/docker apps/api apps/web apps/worker-python samples docs/fixtures.md
  ) | tar -C "$destination" -xf -
}

build_probe() {
  local context="$1"
  local dockerfile="$2"
  local log_file="$3"

  if ! DOCKER_BUILDKIT=1 docker build \
    --progress=plain \
    --output=type=cacheonly \
    -f "$context/$dockerfile" \
    "$context" >"$log_file" 2>&1; then
    tail -n 100 "$log_file" >&2
    fail "probe build failed for $dockerfile"
  fi
}

assert_step_cached() {
  local log_file="$1"
  local step="$2"
  awk -v step="$step" '
    index($0, step) {
      split($0, fields, " ")
      step_id = fields[1]
      seen = 1
      next
    }
    seen && index($0, step_id " CACHED") == 1 { cached = 1; exit }
    seen && index($0, step_id " DONE") == 1 { exit }
    seen && index($0, step_id " ERROR") == 1 { exit }
    seen && index($0, step_id " CANCELED") == 1 { exit }
    END { exit !(seen && cached) }
  ' "$log_file" || fail "expected cached BuildKit step not found: $step"
}

assert_step_rebuilt() {
  local log_file="$1"
  local step="$2"
  awk -v step="$step" '
    index($0, step) {
      split($0, fields, " ")
      step_id = fields[1]
      seen = 1
      next
    }
    seen && index($0, step_id " CACHED") == 1 { cached = 1; exit }
    seen && index($0, step_id " DONE") == 1 { rebuilt = 1; exit }
    seen && index($0, step_id " ERROR") == 1 { exit }
    seen && index($0, step_id " CANCELED") == 1 { exit }
    END { exit !(seen && rebuilt && !cached) }
  ' "$log_file" || fail "expected rebuilt BuildKit step not found: $step"
}

seed_probe_builds() {
  local context="$1"
  local log_dir="$2"
  build_probe "$context" "infra/docker/api.Dockerfile" "$log_dir/api-seed.log"
  build_probe "$context" "infra/docker/web.Dockerfile" "$log_dir/web-seed.log"
  build_probe "$context" "infra/docker/worker-python.Dockerfile" "$log_dir/worker-seed.log"
  build_probe "$context" "infra/docker/web-e2e.Dockerfile" "$log_dir/e2e-seed.log"
}

run_source_probe() (
  local probe_root context log_dir
  probe_root="$(mktemp -d)"
  context="$probe_root/context"
  log_dir="$probe_root/logs"
  trap 'rm -rf "$probe_root"' EXIT
  mkdir -p "$log_dir"
  copy_probe_context "$context"
  seed_probe_builds "$context" "$log_dir"

  printf '\n// docker cache source probe %s\n' "$probe_root" >>"$context/apps/api/src/main.ts"
  printf '\n// docker cache source probe %s\n' "$probe_root" >>"$context/apps/web/src/app/page.tsx"
  printf '\n# docker cache source probe %s\n' "$probe_root" >>"$context/apps/worker-python/src/worker_python/__init__.py"

  build_probe "$context" "infra/docker/api.Dockerfile" "$log_dir/api-source.log"
  build_probe "$context" "infra/docker/web.Dockerfile" "$log_dir/web-source.log"
  build_probe "$context" "infra/docker/worker-python.Dockerfile" "$log_dir/worker-source.log"
  build_probe "$context" "infra/docker/web-e2e.Dockerfile" "$log_dir/e2e-source.log"

  assert_step_cached "$log_dir/api-source.log" "pnpm install --filter api... --frozen-lockfile"
  assert_step_cached "$log_dir/api-source.log" "uv sync --directory apps/worker-python --frozen --no-install-project"
  assert_step_cached "$log_dir/web-source.log" "pnpm install --filter web... --frozen-lockfile"
  assert_step_cached "$log_dir/worker-source.log" "uv sync --frozen --no-install-project"
  assert_step_cached "$log_dir/e2e-source.log" "pnpm install --filter web... --frozen-lockfile"

  assert_step_rebuilt "$log_dir/api-source.log" "COPY apps/api apps/api"
  assert_step_rebuilt "$log_dir/web-source.log" "COPY apps/web apps/web"
  assert_step_rebuilt "$log_dir/worker-source.log" "COPY apps/worker-python ./"
  assert_step_rebuilt "$log_dir/e2e-source.log" "COPY apps/web apps/web"
  pass "source-only changes rebuild source layers while all dependency layers stay cached"
)

run_manifest_probe() (
  local probe_root context log_dir
  probe_root="$(mktemp -d)"
  context="$probe_root/context"
  log_dir="$probe_root/logs"
  trap 'rm -rf "$probe_root"' EXIT
  mkdir -p "$log_dir"
  copy_probe_context "$context"
  seed_probe_builds "$context" "$log_dir"

  printf '\n# docker cache manifest probe %s\n' "$probe_root" >>"$context/pnpm-lock.yaml"
  printf '\n# docker cache manifest probe %s\n' "$probe_root" >>"$context/apps/worker-python/uv.lock"

  build_probe "$context" "infra/docker/api.Dockerfile" "$log_dir/api-manifest.log"
  build_probe "$context" "infra/docker/web.Dockerfile" "$log_dir/web-manifest.log"
  build_probe "$context" "infra/docker/worker-python.Dockerfile" "$log_dir/worker-manifest.log"
  build_probe "$context" "infra/docker/web-e2e.Dockerfile" "$log_dir/e2e-manifest.log"

  assert_step_rebuilt "$log_dir/api-manifest.log" "pnpm install --filter api... --frozen-lockfile"
  assert_step_rebuilt "$log_dir/api-manifest.log" "uv sync --directory apps/worker-python --frozen --no-install-project"
  assert_step_rebuilt "$log_dir/web-manifest.log" "pnpm install --filter web... --frozen-lockfile"
  assert_step_rebuilt "$log_dir/worker-manifest.log" "uv sync --frozen --no-install-project"
  assert_step_rebuilt "$log_dir/e2e-manifest.log" "pnpm install --filter web... --frozen-lockfile"
  pass "isolated lockfile changes invalidate each corresponding dependency layer"
)

require_command docker
require_command jq
require_command tar

run_static_contract
if [[ "$MODE" == "--source-probe" || "$MODE" == "--all" ]]; then
  run_source_probe
fi
if [[ "$MODE" == "--manifest-probe" || "$MODE" == "--all" ]]; then
  run_manifest_probe
fi
