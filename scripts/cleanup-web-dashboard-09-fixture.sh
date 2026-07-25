#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
compose_file="$repo_root/infra/docker/compose.local.yml"
fixture_id="cmrwzd3bt02os1xpnwpu4lh4a"
mode="${1:---dry-run}"

if [[ "$mode" != "--dry-run" && "$mode" != "--apply" ]]; then
  echo "Usage: $0 [--dry-run|--apply]" >&2
  exit 2
fi

psql_task() {
  docker compose -f "$compose_file" exec -T postgres sh -c \
    'psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"' \
    sh "$@"
}

non_fixture_snapshot() {
  psql_task -At -v fixture_id="$fixture_id" <<'SQL'
SELECT json_build_object(
  'pay_container_count', COUNT(*),
  'fingerprint', md5(COALESCE(string_agg(
    id || '|' || pay_container_no || '|' || status::text || '|' ||
    COALESCE(completed_at::text, ''), ',' ORDER BY id
  ), ''))
)::text
FROM pay_containers
WHERE id <> :'fixture_id';
SQL
}

dry_run="$(
  psql_task -At -v fixture_id="$fixture_id" <<'SQL'
DO $$
DECLARE
  fixture_count integer;
  unsafe_count integer;
BEGIN
  SELECT COUNT(*) INTO fixture_count
  FROM pay_containers
  WHERE id = 'cmrwzd3bt02os1xpnwpu4lh4a'
    AND pay_container_no = 'PC-TRAILER-TR-E2E-1048122'
    AND trailer_number = 'TR-E2E-1048122'
    AND completed_at = TIMESTAMPTZ '2099-06-18T20:30:00Z'
    AND completion_note = 'Playwright smoke completed unloading';
  IF fixture_count NOT IN (0, 1) THEN
    RAISE EXCEPTION 'WEB-DASHBOARD-09 pay-container provenance failed';
  END IF;
  IF fixture_count = 0 AND EXISTS (
    SELECT 1 FROM pay_containers WHERE id = 'cmrwzd3bt02os1xpnwpu4lh4a'
  ) THEN
    RAISE EXCEPTION 'WEB-DASHBOARD-09 target id exists with unexpected provenance';
  END IF;

  SELECT COUNT(*) INTO unsafe_count
  FROM pay_container_containers pcc
  JOIN containers c ON c.id = pcc.container_id
  WHERE pcc.pay_container_id = 'cmrwzd3bt02os1xpnwpu4lh4a'
    AND NOT (
      c.company = 'Bestar E2E'
      AND c.container_no IN ('ZCSU1048122A', 'TGBU1048122B')
    );
  IF unsafe_count <> 0 THEN
    RAISE EXCEPTION 'WEB-DASHBOARD-09 source-container provenance failed';
  END IF;

  SELECT COUNT(*) INTO unsafe_count
  FROM unloader_assignments ua
  JOIN unloading_workers uw ON uw.id = ua.unloading_worker_id
  WHERE ua.pay_container_id = 'cmrwzd3bt02os1xpnwpu4lh4a'
    AND NOT (
      uw.worker_code LIKE 'TEMP-E2E-%'
      AND uw.note = 'Playwright unloading wage smoke worker'
    );
  IF unsafe_count <> 0 THEN
    RAISE EXCEPTION 'WEB-DASHBOARD-09 worker provenance failed';
  END IF;

  SELECT COUNT(*) INTO unsafe_count
  FROM unloader_assignments
  WHERE unloading_worker_id IN (
    SELECT unloading_worker_id FROM unloader_assignments
    WHERE pay_container_id = 'cmrwzd3bt02os1xpnwpu4lh4a' AND unloading_worker_id IS NOT NULL
  )
    AND pay_container_id <> 'cmrwzd3bt02os1xpnwpu4lh4a';
  IF unsafe_count <> 0 THEN
    RAISE EXCEPTION 'WEB-DASHBOARD-09 worker is shared with non-target records';
  END IF;

  SELECT COUNT(*) INTO unsafe_count
  FROM unloading_wage_settlement_lines
  WHERE settlement_id IN (
    SELECT settlement_id FROM unloading_wage_settlement_lines
    WHERE pay_container_id = 'cmrwzd3bt02os1xpnwpu4lh4a'
  )
    AND pay_container_id IS DISTINCT FROM 'cmrwzd3bt02os1xpnwpu4lh4a';
  IF unsafe_count <> 0 THEN
    RAISE EXCEPTION 'WEB-DASHBOARD-09 settlement contains non-target lines';
  END IF;

  SELECT COUNT(*) INTO unsafe_count
  FROM wage_generated_files
  WHERE unloading_wage_settlement_id IN (
    SELECT settlement_id FROM unloading_wage_settlement_lines
    WHERE pay_container_id = 'cmrwzd3bt02os1xpnwpu4lh4a'
  )
    AND storage_path !~ '^/workspace/storage/unloading_wage_settlements/2099-06/[a-z0-9]+/settlement(-report)?\.(json|html)$';
  IF unsafe_count <> 0 THEN
    RAISE EXCEPTION 'WEB-DASHBOARD-09 storage path left the fixture root';
  END IF;
END $$;

WITH
  target_containers AS (
    SELECT container_id FROM pay_container_containers
    WHERE pay_container_id = :'fixture_id'
  ),
  target_destinations AS (
    SELECT id FROM container_destinations
    WHERE container_id IN (SELECT container_id FROM target_containers)
  ),
  target_pallets AS (
    SELECT id FROM pallets
    WHERE container_destination_id IN (SELECT id FROM target_destinations)
  ),
  target_settlements AS (
    SELECT DISTINCT settlement_id FROM unloading_wage_settlement_lines
    WHERE pay_container_id = :'fixture_id'
  ),
  target_workers AS (
    SELECT DISTINCT unloading_worker_id AS id FROM unloader_assignments
    WHERE pay_container_id = :'fixture_id' AND unloading_worker_id IS NOT NULL
  )
SELECT json_build_object(
  'payContainers', (SELECT COUNT(*) FROM pay_containers WHERE id = :'fixture_id'),
  'sourceContainers', (SELECT COUNT(*) FROM target_containers),
  'destinations', (SELECT COUNT(*) FROM target_destinations),
  'pallets', (SELECT COUNT(*) FROM target_pallets),
  'temporaryUnloaders', (SELECT COUNT(*) FROM target_workers),
  'settlements', (SELECT COUNT(*) FROM target_settlements),
  'settlementLines', (SELECT COUNT(*) FROM unloading_wage_settlement_lines WHERE settlement_id IN (SELECT settlement_id FROM target_settlements)),
  'corrections', (SELECT COUNT(*) FROM correction_feedback WHERE pay_container_id = :'fixture_id' OR container_id IN (SELECT container_id FROM target_containers) OR unloading_wage_settlement_id IN (SELECT settlement_id FROM target_settlements)),
  'generatedFileMetadata', (SELECT COUNT(*) FROM wage_generated_files WHERE unloading_wage_settlement_id IN (SELECT settlement_id FROM target_settlements)),
  'storageArtifacts', (SELECT COUNT(*) FROM wage_generated_files WHERE unloading_wage_settlement_id IN (SELECT settlement_id FROM target_settlements)),
  'provenanceComplete', true
)::text;
SQL
)"

echo "$dry_run"
if [[ "$mode" == "--dry-run" ]]; then
  exit 0
fi

before_snapshot="$(non_fixture_snapshot)"
storage_paths=()
while IFS= read -r storage_path; do
  storage_paths+=("$storage_path")
done < <(
  psql_task -At -v fixture_id="$fixture_id" <<'SQL'
SELECT storage_path
FROM wage_generated_files
WHERE unloading_wage_settlement_id IN (
  SELECT settlement_id FROM unloading_wage_settlement_lines
  WHERE pay_container_id = :'fixture_id'
)
ORDER BY storage_path;
SQL
)

psql_task -v fixture_id="$fixture_id" <<'SQL'
BEGIN;
CREATE TEMP TABLE target_containers ON COMMIT DROP AS
  SELECT container_id AS id FROM pay_container_containers
  WHERE pay_container_id = :'fixture_id';
CREATE TEMP TABLE target_destinations ON COMMIT DROP AS
  SELECT id FROM container_destinations
  WHERE container_id IN (SELECT id FROM target_containers);
CREATE TEMP TABLE target_pallets ON COMMIT DROP AS
  SELECT id FROM pallets
  WHERE container_destination_id IN (SELECT id FROM target_destinations);
CREATE TEMP TABLE target_settlements ON COMMIT DROP AS
  SELECT DISTINCT settlement_id AS id FROM unloading_wage_settlement_lines
  WHERE pay_container_id = :'fixture_id';
CREATE TEMP TABLE target_workers ON COMMIT DROP AS
  SELECT DISTINCT unloading_worker_id AS id FROM unloader_assignments
  WHERE pay_container_id = :'fixture_id' AND unloading_worker_id IS NOT NULL;
CREATE TEMP TABLE target_wage_files ON COMMIT DROP AS
  SELECT id FROM wage_generated_files
  WHERE unloading_wage_settlement_id IN (SELECT id FROM target_settlements);

DELETE FROM correction_feedback
WHERE pay_container_id = :'fixture_id'
   OR container_id IN (SELECT id FROM target_containers)
   OR container_destination_id IN (SELECT id FROM target_destinations)
   OR pallet_id IN (SELECT id FROM target_pallets)
   OR unloading_wage_settlement_id IN (SELECT id FROM target_settlements);
DELETE FROM pallet_events WHERE pallet_id IN (SELECT id FROM target_pallets);
DELETE FROM inventory_adjustments
WHERE container_id IN (SELECT id FROM target_containers)
   OR container_destination_id IN (SELECT id FROM target_destinations);
DELETE FROM async_jobs
WHERE container_id IN (SELECT id FROM target_containers)
   OR wage_generated_file_id IN (SELECT id FROM target_wage_files);
DELETE FROM wage_generated_files WHERE id IN (SELECT id FROM target_wage_files);
DELETE FROM unloading_wage_settlements WHERE id IN (SELECT id FROM target_settlements);
DELETE FROM unloader_assignments WHERE pay_container_id = :'fixture_id';
DELETE FROM pay_container_containers WHERE pay_container_id = :'fixture_id';
DELETE FROM pay_containers WHERE id = :'fixture_id';
DELETE FROM unloading_workers WHERE id IN (SELECT id FROM target_workers);
DELETE FROM pallets WHERE id IN (SELECT id FROM target_pallets);
DELETE FROM container_lines WHERE container_id IN (SELECT id FROM target_containers);
DELETE FROM container_destinations WHERE id IN (SELECT id FROM target_destinations);
DELETE FROM generated_files WHERE container_id IN (SELECT id FROM target_containers);
DELETE FROM async_jobs WHERE container_id IN (SELECT id FROM target_containers);
DELETE FROM containers WHERE id IN (SELECT id FROM target_containers);
COMMIT;
SQL

for container_path in "${storage_paths[@]}"; do
  relative_path="${container_path#/workspace/storage/}"
  if [[ "$container_path" == "$relative_path" ||
        "$relative_path" != unloading_wage_settlements/2099-06/* ||
        "$relative_path" == *".."* ]]; then
    echo "Unsafe storage path rejected after database rollback-safe cleanup: $container_path" >&2
    exit 1
  fi
  host_path="$repo_root/storage/$relative_path"
  if [[ -f "$host_path" ]]; then
    find "$host_path" -maxdepth 0 -type f -delete
  else
    echo "Warning: expected fixture artifact was already absent: $relative_path" >&2
  fi
done
for settlement_dir in \
  "$repo_root/storage/unloading_wage_settlements/2099-06/cmrwzd43702p81xpnry37yaai" \
  "$repo_root/storage/unloading_wage_settlements/2099-06/cmrwzd4l502pg1xpnki4447kr"; do
  rmdir "$settlement_dir" 2>/dev/null || true
done

after_snapshot="$(non_fixture_snapshot)"
if [[ "$before_snapshot" != "$after_snapshot" ]]; then
  echo "Non-fixture pay-container snapshot changed during cleanup." >&2
  exit 1
fi

residual="$(
  psql_task -At -v fixture_id="$fixture_id" <<'SQL'
SELECT json_build_object(
  'targetPayContainer', (SELECT COUNT(*) FROM pay_containers WHERE id = :'fixture_id'),
  'futurePayContainers', (SELECT COUNT(*) FROM pay_containers WHERE completed_at >= TIMESTAMPTZ '2030-01-01T00:00:00Z'),
  'targetContainers', (SELECT COUNT(*) FROM containers WHERE container_no IN ('ZCSU1048122A', 'TGBU1048122B')),
  'targetWorkers', (SELECT COUNT(*) FROM unloading_workers WHERE worker_code IN ('TEMP-E2E-A-1048003', 'TEMP-E2E-B-1048075')),
  'targetSettlements', (SELECT COUNT(*) FROM unloading_wage_settlements WHERE id IN ('cmrwzd43702p81xpnry37yaai', 'cmrwzd4l502pg1xpnki4447kr')),
  'nonFixtureUnchanged', true
)::text;
SQL
)"
echo "$residual"
