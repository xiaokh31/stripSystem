#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

COMPOSE_FILE="${COMPOSE_FILE:-$REPO_ROOT/infra/docker/compose.local.yml}"
POSTGRES_SERVICE="${POSTGRES_SERVICE:-postgres}"
POSTGRES_USER="${POSTGRES_USER:-bestar}"
POSTGRES_DB="${POSTGRES_DB:-bestar_unloading}"
OUTPUT_DIR="${OUTPUT_DIR:-$REPO_ROOT/audit-exports}"
SIEM_SINCE_INTERVAL="${SIEM_SINCE_INTERVAL:-24 hours}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"

if [[ ! "$SIEM_SINCE_INTERVAL" =~ ^[0-9]+[[:space:]]+(minute|minutes|hour|hours|day|days)$ ]]; then
  echo "Invalid SIEM_SINCE_INTERVAL: $SIEM_SINCE_INTERVAL" >&2
  exit 1
fi

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "Compose file does not exist: $COMPOSE_FILE" >&2
  exit 1
fi

umask 077
mkdir -p "$OUTPUT_DIR"

run_export() {
  local name="$1"
  local sql="$2"
  local output_path="$OUTPUT_DIR/$name-$TIMESTAMP.jsonl"
  local tmp_path="$output_path.tmp"

  docker compose -f "$COMPOSE_FILE" exec -T "$POSTGRES_SERVICE" \
    psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -At \
    -c "$sql" > "$tmp_path"

  mv "$tmp_path" "$output_path"
  local line_count
  line_count="$(wc -l < "$output_path" | tr -d ' ')"
  printf '{"event":"siem_audit_export","stream":"%s","path":"%s","lineCount":%s,"sinceInterval":"%s"}\n' \
    "$name" "$output_path" "$line_count" "$SIEM_SINCE_INTERVAL"
}

SINCE_SQL="$(printf "%s" "$SIEM_SINCE_INTERVAL" | sed "s/'//g")"

run_export "pallet-events" "
select jsonb_build_object(
  'event', 'pallet_event',
  'id', pe.id,
  'occurredAt', pe.occurred_at,
  'eventType', pe.event_type,
  'palletRecordId', pe.pallet_id,
  'loadJobId', pe.load_job_id,
  'operatorId', pe.operator_id,
  'operatorEmail', u.email,
  'fromStatus', pe.from_status,
  'toStatus', pe.to_status,
  'deviceId', pe.device_id,
  'exceptionReason', pe.exception_reason,
  'scanPayload', pe.scan_payload,
  'metadata', coalesce(pe.metadata::jsonb, '{}'::jsonb)
)::text
from pallet_events pe
left join users u on u.id = pe.operator_id
where pe.occurred_at >= now() - interval '$SINCE_SQL'
order by pe.occurred_at asc, pe.id asc;
"

run_export "correction-feedback" "
select jsonb_build_object(
  'event', 'correction_feedback',
  'id', cf.id,
  'createdAt', cf.created_at,
  'targetType', cf.target_type,
  'fieldName', cf.field_name,
  'containerId', cf.container_id,
  'containerDestinationId', cf.container_destination_id,
  'palletRecordId', cf.pallet_id,
  'generatedFileId', cf.generated_file_id,
  'attendanceImportId', cf.attendance_import_id,
  'payContainerId', cf.pay_container_id,
  'unloadingWageSettlementId', cf.unloading_wage_settlement_id,
  'correctedById', cf.corrected_by_id,
  'correctedByEmail', u.email,
  'reason', cf.reason,
  'note', cf.note,
  'oldValue', cf.old_value,
  'newValue', cf.new_value
)::text
from correction_feedback cf
left join users u on u.id = cf.corrected_by_id
where cf.created_at >= now() - interval '$SINCE_SQL'
order by cf.created_at asc, cf.id asc;
"

run_export "generated-files" "
select jsonb_build_object(
  'event', 'generated_file',
  'id', gf.id,
  'createdAt', gf.created_at,
  'fileType', gf.file_type,
  'status', gf.status,
  'containerId', gf.container_id,
  'importFileId', gf.import_file_id,
  'fileSha256', gf.file_sha256,
  'fileSizeBytes', gf.file_size_bytes,
  'generatedById', gf.generated_by_id,
  'generatedByEmail', u.email
)::text
from generated_files gf
left join users u on u.id = gf.generated_by_id
where gf.created_at >= now() - interval '$SINCE_SQL'
order by gf.created_at asc, gf.id asc;
"

run_export "import-files" "
select jsonb_build_object(
  'event', 'import_file',
  'id', i.id,
  'createdAt', i.created_at,
  'originalFilename', i.original_filename,
  'fileSha256', i.file_sha256,
  'format', i.format,
  'importStatus', i.import_status,
  'parseStatus', i.parse_status,
  'warningCount', i.warning_count,
  'errorCount', i.error_count,
  'importedById', i.imported_by_id,
  'importedByEmail', u.email,
  'deletedAt', i.deleted_at,
  'deletedById', i.deleted_by_id
)::text
from import_files i
left join users u on u.id = i.imported_by_id
where i.created_at >= now() - interval '$SINCE_SQL'
   or i.deleted_at >= now() - interval '$SINCE_SQL'
order by i.created_at asc, i.id asc;
"

run_export "wage-files" "
select jsonb_build_object(
  'event', 'wage_generated_file',
  'id', wgf.id,
  'createdAt', wgf.created_at,
  'fileType', wgf.file_type,
  'status', wgf.status,
  'attendanceImportId', wgf.attendance_import_id,
  'unloadingWageSettlementId', wgf.unloading_wage_settlement_id,
  'fileSha256', wgf.file_sha256,
  'fileSizeBytes', wgf.file_size_bytes,
  'generatedById', wgf.generated_by_id,
  'generatedByEmail', u.email
)::text
from wage_generated_files wgf
left join users u on u.id = wgf.generated_by_id
where wgf.created_at >= now() - interval '$SINCE_SQL'
order by wgf.created_at asc, wgf.id asc;
"

run_export "unloading-wage" "
select jsonb_build_object(
  'event', 'unloading_wage',
  'recordType', 'pay_container',
  'id', pc.id,
  'createdAt', pc.created_at,
  'updatedAt', pc.updated_at,
  'payContainerNo', pc.pay_container_no,
  'classification', pc.classification,
  'trailerNumber', pc.trailer_number,
  'status', pc.status,
  'rateAmount', pc.rate_amount,
  'allocationMethod', pc.allocation_method,
  'completedAt', pc.completed_at,
  'completedById', pc.completed_by_id,
  'completedByEmail', completed.email,
  'createdById', pc.created_by_id,
  'createdByEmail', created.email
)::text
from pay_containers pc
left join users completed on completed.id = pc.completed_by_id
left join users created on created.id = pc.created_by_id
where pc.created_at >= now() - interval '$SINCE_SQL'
   or pc.updated_at >= now() - interval '$SINCE_SQL'
union all
select jsonb_build_object(
  'event', 'unloading_wage',
  'recordType', 'settlement',
  'id', uws.id,
  'createdAt', uws.created_at,
  'updatedAt', uws.updated_at,
  'settlementMonth', uws.settlement_month,
  'status', uws.status,
  'totalAmount', uws.total_amount,
  'warningCount', uws.warning_count,
  'errorCount', uws.error_count,
  'generatedById', uws.generated_by_id,
  'generatedByEmail', u.email
)::text
from unloading_wage_settlements uws
left join users u on u.id = uws.generated_by_id
where uws.created_at >= now() - interval '$SINCE_SQL'
   or uws.updated_at >= now() - interval '$SINCE_SQL'
order by 1 asc;
"
