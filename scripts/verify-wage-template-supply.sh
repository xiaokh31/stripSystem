#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
template_rel="apps/worker-python/templates/wage/bestar-wage-template-v1.xls"
manifest_rel="apps/worker-python/templates/wage/bestar-wage-template-v1.json"
historical_rel="samples/wage/20260601-0630_wageRecords.xls"
expected_sha="f9e11d6f2c6f45b0453f8346df2ff8347f2e6f5c8b7505a642367f1dade4206c"
expected_version="bestar-wage-template-v1"
run_id="$$"
worker_image="bestar-wage-template-clean-worker:$run_id"
api_image="bestar-wage-template-clean-api:$run_id"
temp_root="$(mktemp -d)"
context="$temp_root/context"

cleanup() {
  local status=$?
  trap - EXIT
  docker image rm --force "$worker_image" "$api_image" >/dev/null 2>&1 || true
  find "$temp_root" -depth -delete
  exit "$status"
}
trap cleanup EXIT

cd "$repo_root"
test -s "$template_rel"
test -s "$manifest_rel"
if git check-ignore -q "$template_rel"; then
  echo "WAGE_TEMPLATE_TRACKING_IGNORED" >&2
  exit 1
fi
if [[ "$(shasum -a 256 "$template_rel" | awk '{print $1}')" != "$expected_sha" ]]; then
  echo "WAGE_TEMPLATE_SHA_MISMATCH" >&2
  exit 1
fi

mkdir -p "$context"
git ls-files --cached --others --exclude-standard -z \
  | tar --null --files-from=- --create \
  | tar --extract --directory "$context"

test -s "$context/$template_rel"
test -s "$context/$manifest_rel"
test ! -e "$context/$historical_rel"
if find "$context/samples/wage" -type f -print -quit 2>/dev/null | grep -q .; then
  echo "WAGE_TEMPLATE_CLEAN_CONTEXT_CONTAINS_HISTORICAL_WAGE_FILES" >&2
  exit 1
fi

docker build \
  --file "$context/infra/docker/worker-python.Dockerfile" \
  --tag "$worker_image" \
  "$context"
docker run --rm --entrypoint sh "$worker_image" -c \
  "test ! -e /workspace/$historical_rel && \
   unloading-worker wage-template-preflight \
   --template /workspace/$template_rel \
   --expected-sha256 $expected_sha \
   --expected-version $expected_version \
   --require-read-only"

docker build \
  --file "$context/infra/docker/api.Dockerfile" \
  --tag "$api_image" \
  "$context"
docker run --rm --entrypoint sh "$api_image" -c \
  "test ! -e /workspace/$historical_rel && \
   unloading-worker wage-template-preflight \
   --template /workspace/$template_rel \
   --expected-sha256 $expected_sha \
   --expected-version $expected_version \
   --require-read-only"

trap - EXIT
docker image rm --force "$worker_image" "$api_image" >/dev/null
find "$temp_root" -depth -delete
echo "WAGE-HOURS-08 clean tracked checkout and image template supply passed."
