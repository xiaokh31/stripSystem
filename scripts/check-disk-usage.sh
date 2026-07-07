#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

DISK_USAGE_PATHS="${DISK_USAGE_PATHS:-$REPO_ROOT $REPO_ROOT/storage $REPO_ROOT/backups}"
DISK_USAGE_WARN_PERCENT="${DISK_USAGE_WARN_PERCENT:-80}"
DISK_USAGE_CRITICAL_PERCENT="${DISK_USAGE_CRITICAL_PERCENT:-90}"
ALERT_WEBHOOK_URL="${ALERT_WEBHOOK_URL:-}"

json_escape() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\n'/\\n}"
  printf '%s' "$value"
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
    echo "Disk usage alert webhook failed." >&2
  }
}

emit_result() {
  local path="$1"
  local status="$2"
  local used_percent="$3"
  local available_kb="$4"
  local mount="$5"
  local message="$6"

  printf '{"event":"disk_usage_check","path":"%s","status":"%s","usedPercent":%s,"warnPercent":%s,"criticalPercent":%s,"availableKb":%s,"mount":"%s","message":"%s"}\n' \
    "$(json_escape "$path")" \
    "$(json_escape "$status")" \
    "$used_percent" \
    "$DISK_USAGE_WARN_PERCENT" \
    "$DISK_USAGE_CRITICAL_PERCENT" \
    "$available_kb" \
    "$(json_escape "$mount")" \
    "$(json_escape "$message")"
}

exit_code=0

for path in $DISK_USAGE_PATHS; do
  if [[ ! -e "$path" ]]; then
    payload="$(emit_result "$path" "critical" "100" "0" "unknown" "Path does not exist.")"
    printf '%s\n' "$payload"
    send_alert "$payload"
    exit_code=2
    continue
  fi

  read -r used_percent available_kb mount < <(
    df -Pk "$path" | awk 'NR == 2 { gsub("%", "", $5); print $5, $4, $6 }'
  )

  if (( used_percent >= DISK_USAGE_CRITICAL_PERCENT )); then
    payload="$(emit_result "$path" "critical" "$used_percent" "$available_kb" "$mount" "Disk usage is at or above the critical threshold.")"
    printf '%s\n' "$payload"
    send_alert "$payload"
    exit_code=2
  elif (( used_percent >= DISK_USAGE_WARN_PERCENT )); then
    payload="$(emit_result "$path" "warning" "$used_percent" "$available_kb" "$mount" "Disk usage is at or above the warning threshold.")"
    printf '%s\n' "$payload"
    send_alert "$payload"
    if (( exit_code == 0 )); then
      exit_code=1
    fi
  else
    emit_result "$path" "ok" "$used_percent" "$available_kb" "$mount" "Disk usage is within threshold."
  fi
done

exit "$exit_code"
