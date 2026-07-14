#!/bin/sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
compose_file="$repo_root/infra/docker/compose.local.yml"
run_id=${REPORT_VISUAL_RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)}
artifact_rel="unload-report-01/$run_id"
artifact_dir="$repo_root/test-results/$artifact_rel"
source_dir="$artifact_dir/source"
template="$repo_root/samples/templates/卸柜报告-En.xlsx"
e2e_admin_email="unload-report-01-e2e@local.invalid"
e2e_admin_password="UNLOAD-REPORT-01-${run_id}-Safe!"

mkdir -p "$source_dir" "$artifact_dir/playwright"
template_sha_before=$(sha256sum "$template" | awk '{print $1}')

snapshot_storage() {
  {
    find "$repo_root/storage/original_files" -type f -exec sha256sum {} \;
    find "$repo_root/storage/reports" -type f \
      \( -name '*.xlsx' -o -name '*.pdf' \) -exec sha256sum {} \;
  } 2>/dev/null | sort
}

snapshot_generated_files() {
  docker compose -f "$compose_file" exec -T postgres sh -lc \
    'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -AtF "|" -c "SELECT id, updated_at, file_sha256, file_size_bytes, storage_path FROM generated_files ORDER BY id;"'
}

docker compose -f "$compose_file" up -d --build
docker compose -f "$compose_file" --profile e2e --profile report-visual build \
  e2e-web report-visual-test

snapshot_storage > "$artifact_dir/storage-files-before.txt"
snapshot_generated_files > "$artifact_dir/generated-files-before.txt"

# Use a dedicated local-only account so verification never resets an operator's
# password. The seed is idempotent and the generated-file row retains this actor.
docker compose -f "$compose_file" exec -T \
  -e "SEED_ADMIN_EMAIL=$e2e_admin_email" \
  -e "SEED_ADMIN_PASSWORD=$e2e_admin_password" \
  -e "SEED_ADMIN_NAME=UNLOAD-REPORT-01 E2E" \
  api pnpm --filter api prisma db seed

docker compose -f "$compose_file" run --rm -T --no-deps \
  -v "$repo_root/test-results:/workspace/test-results" \
  worker-python sh -lc "
    set -eu
    run_dir='/workspace/test-results/$artifact_rel'
    mkdir -p \"\$run_dir/input\" \"\$run_dir/source\" \"\$run_dir/worker-pipeline\"
    cp '/workspace/samples/unloading-plans/CAAU8011090 UNLOADING PLAN.xlsx' \"\$run_dir/input/CAAU8011090 UNLOADING PLAN.xlsx\"
    cp '/workspace/samples/templates/卸柜报告-En.xlsx' \"\$run_dir/source/template.xlsx\"
    uv run unloading-worker batch \
      --input-dir \"\$run_dir/input\" \
      --template '/workspace/samples/templates/卸柜报告-En.xlsx' \
      --output-dir \"\$run_dir/worker-pipeline\"
    cp \"\$run_dir\"/worker-pipeline/reports/*.xlsx \"\$run_dir/source/worker-generated-report.xlsx\"
    uv run python tests/fixtures/generate_report_visual_workbooks.py \
      --output-dir \"\$run_dir/source\"
  "

docker compose -f "$compose_file" --profile e2e run --rm -T \
  -v "$artifact_dir/playwright:/workspace/apps/web/test-results" \
  -v "$artifact_dir:/artifacts" \
  -e "E2E_ADMIN_EMAIL=$e2e_admin_email" \
  -e "E2E_ADMIN_PASSWORD=$e2e_admin_password" \
  -e "UNLOAD_REPORT_ARTIFACT_DIR=/artifacts/source" \
  e2e-web e2e/unload-report-rich-text.spec.ts --project=chromium

generated_file_id=$(tr -d '\r\n' < "$source_dir/generated-file-id.txt")
actor_user_id=$(tr -d '\r\n' < "$source_dir/actor-user-id.txt")
import_file_id=$(tr -d '\r\n' < "$source_dir/import-file-id.txt")
uploaded_file_sha=$(tr -d '\r\n' < "$source_dir/uploaded-file-sha256.txt")
case "$generated_file_id:$actor_user_id:$import_file_id:$uploaded_file_sha" in
  *[!A-Za-z0-9_:-]*)
    echo "Unsafe identifier or SHA in E2E artifact" >&2
    exit 1
    ;;
esac

recorded_actor=$(docker compose -f "$compose_file" exec -T \
  -e "REPORT_FILE_ID=$generated_file_id" postgres sh -lc \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT generated_by_id FROM generated_files WHERE id = '\''$REPORT_FILE_ID'\'';"')
if [ "$recorded_actor" != "$actor_user_id" ]; then
  echo "Generated-file audit actor mismatch: expected $actor_user_id, got $recorded_actor" >&2
  exit 1
fi
printf 'generated_file_id=%s\nactor_user_id=%s\nrecorded_actor_user_id=%s\n' \
  "$generated_file_id" "$actor_user_id" "$recorded_actor" \
  > "$artifact_dir/database-audit-verification.txt"

stored_original_path=$(docker compose -f "$compose_file" exec -T \
  -e "REPORT_IMPORT_ID=$import_file_id" postgres sh -lc \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT stored_path FROM import_files WHERE id = '\''$REPORT_IMPORT_ID'\'';"')
case "$stored_original_path" in
  /workspace/storage/original_files/*) ;;
  *)
    echo "Uploaded fixture escaped original_files storage: $stored_original_path" >&2
    exit 1
    ;;
esac
stored_original_sha=$(docker compose -f "$compose_file" exec -T \
  -e "REPORT_ORIGINAL_PATH=$stored_original_path" api sh -lc \
  'sha256sum "$REPORT_ORIGINAL_PATH" | awk '\''{print $1}'\''')
if [ "$stored_original_sha" != "$uploaded_file_sha" ]; then
  echo "Preserved upload SHA mismatch: expected $uploaded_file_sha, got $stored_original_sha" >&2
  exit 1
fi
printf 'import_file_id=%s\nstored_path=%s\nexpected_sha256=%s\nstored_sha256=%s\n' \
  "$import_file_id" "$stored_original_path" "$uploaded_file_sha" "$stored_original_sha" \
  > "$artifact_dir/original-upload-verification.txt"

snapshot_storage > "$artifact_dir/storage-files-after.txt"
snapshot_generated_files > "$artifact_dir/generated-files-after.txt"
if ! comm -23 \
  "$artifact_dir/storage-files-before.txt" \
  "$artifact_dir/storage-files-after.txt" \
  > "$artifact_dir/storage-existing-file-changes.txt"; then
  echo "Unable to compare storage snapshots" >&2
  exit 1
fi
if [ -s "$artifact_dir/storage-existing-file-changes.txt" ]; then
  echo "An existing original/report storage file changed or disappeared" >&2
  cat "$artifact_dir/storage-existing-file-changes.txt" >&2
  exit 1
fi
if ! comm -23 \
  "$artifact_dir/generated-files-before.txt" \
  "$artifact_dir/generated-files-after.txt" \
  > "$artifact_dir/generated-existing-record-changes.txt"; then
  echo "Unable to compare generated-file snapshots" >&2
  exit 1
fi
if [ -s "$artifact_dir/generated-existing-record-changes.txt" ]; then
  echo "An existing generated-file record changed or disappeared" >&2
  cat "$artifact_dir/generated-existing-record-changes.txt" >&2
  exit 1
fi

template_sha_after=$(sha256sum "$template" | awk '{print $1}')
if [ "$template_sha_after" != "$template_sha_before" ]; then
  echo "Report template SHA-256 changed during verification" >&2
  exit 1
fi
printf 'before=%s\nafter=%s\n' "$template_sha_before" "$template_sha_after" \
  > "$artifact_dir/template-sha256.txt"

docker compose -f "$compose_file" --profile report-visual run --rm -T --no-deps \
  report-visual-test "/workspace/test-results/$artifact_rel"

echo "UNLOAD-REPORT-01 artifacts: $artifact_dir"
