#!/bin/sh

set -eu

real_uv="/usr/local/bin/uv-real"
counter="/tmp/unload-report-03-conservation-write-count"

if [ ! -x "$real_uv" ]; then
  echo "Missing real uv executable for report conservation fault probe." >&2
  exit 127
fi

is_report_write=0
previous=""
for argument in "$@"; do
  if [ "$previous" = "unloading-worker" ] && [ "$argument" = "write-report" ]; then
    is_report_write=1
    break
  fi
  previous="$argument"
done

if [ "$is_report_write" -eq 1 ]; then
  write_count=0
  if [ -f "$counter" ]; then
    write_count="$(tr -d '\r\n' < "$counter")"
  fi
  if [ "$write_count" -ge 1 ]; then
    printf '%s\n' \
      '{"task_status":"ERROR","report_result":null,"warnings":[],"errors":[{"code":"REPORT_DESTINATION_CONSERVATION_FAILED","message":"REPORT_DESTINATION_CONSERVATION_FAILED","stage":"reopen.row","expectedCount":9,"actualCount":8}],"exception":null}'
    exit 1
  fi
  printf '1\n' > "$counter"
fi

exec "$real_uv" "$@"
