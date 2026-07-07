#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

BACKUP_DIR="${BACKUP_DIR:-$REPO_ROOT/backups}"
MAX_BACKUP_AGE_HOURS="${MAX_BACKUP_AGE_HOURS:-25}"
ALERT_WEBHOOK_URL="${ALERT_WEBHOOK_URL:-}"

json_escape() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\n'/\\n}"
  printf '%s' "$value"
}

file_mtime() {
  local path="$1"
  if stat -f %m "$path" >/dev/null 2>&1; then
    stat -f %m "$path"
    return
  fi
  stat -c %Y "$path"
}

send_alert() {
  local payload="$1"
  if [[ -z "$ALERT_WEBHOOK_URL" ]]; then
    return
  fi

  curl --fail --show-error --silent \
    -H 'Content-Type: application/json' \
    --data "$payload" \
    "$ALERT_WEBHOOK_URL" >/dev/null || {
    echo "Backup alert webhook failed." >&2
  }
}

emit_result() {
  local kind="$1"
  local status="$2"
  local file="$3"
  local age_hours="$4"
  local message="$5"
  local file_json='null'

  if [[ -n "$file" ]]; then
    file_json="\"$(json_escape "$file")\""
  fi

  printf '{"event":"backup_freshness_check","kind":"%s","status":"%s","file":%s,"ageHours":%s,"maxAgeHours":%s,"message":"%s"}\n' \
    "$(json_escape "$kind")" \
    "$(json_escape "$status")" \
    "$file_json" \
    "$age_hours" \
    "$MAX_BACKUP_AGE_HOURS" \
    "$(json_escape "$message")"
}

check_kind() {
  local kind="$1"
  local pattern="$2"
  local latest_file=''
  local latest_mtime=0
  local now
  now="$(date +%s)"

  if [[ -d "$BACKUP_DIR" ]]; then
    while IFS= read -r -d '' candidate; do
      local candidate_mtime
      candidate_mtime="$(file_mtime "$candidate")"
      if (( candidate_mtime > latest_mtime )); then
        latest_mtime="$candidate_mtime"
        latest_file="$candidate"
      fi
    done < <(find "$BACKUP_DIR" -type f -name "$pattern" -size +0c -print0)
  fi

  if [[ -z "$latest_file" ]]; then
    local payload
    payload="$(emit_result "$kind" "alert" "" "null" "No non-empty $kind backup was found in $BACKUP_DIR.")"
    printf '%s\n' "$payload"
    send_alert "$payload"
    return 1
  fi

  local age_hours=$(((now - latest_mtime + 3599) / 3600))
  if (( age_hours > MAX_BACKUP_AGE_HOURS )); then
    local payload
    payload="$(emit_result "$kind" "alert" "$latest_file" "$age_hours" "$kind backup is older than the allowed window.")"
    printf '%s\n' "$payload"
    send_alert "$payload"
    return 1
  fi

  emit_result "$kind" "ok" "$latest_file" "$age_hours" "$kind backup is fresh."
}

failed=0
check_kind "postgres" "postgres-*.sql" || failed=1
check_kind "storage" "storage-*.tar.gz" || failed=1

exit "$failed"
