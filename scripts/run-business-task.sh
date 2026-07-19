#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(cd -- "${script_dir}/.." && pwd)"
launcher="${project_root}/scripts/run-business-agent.sh"
terminal_schema="${project_root}/.codex/business-task-terminal.schema.json"
handoff_writer="${project_root}/.codex/skills/bestar-handoff/scripts/write-handoff.sh"
handoff_file="${BUSINESS_AGENT_HANDOFF_FILE:-${project_root}/HANDOFF.md}"

usage() {
  printf 'Usage: %s <prompts/tasks/task-file.md>\n' "$0" >&2
  printf 'Runs exactly one business Task with automatic terminal-state supervision.\n' >&2
}

if [[ $# -ne 1 ]]; then
  usage
  exit 64
fi

if ! command -v jq >/dev/null 2>&1; then
  printf 'The supervised business-task runner requires jq.\n' >&2
  exit 69
fi

if [[ ! -f "${terminal_schema}" ]]; then
  printf 'Missing terminal-state schema: %s\n' "${terminal_schema}" >&2
  exit 66
fi

if [[ ! -f "${handoff_writer}" ]]; then
  printf 'Missing project handoff writer: %s\n' "${handoff_writer}" >&2
  exit 66
fi

task_argument="$1"
if [[ "${task_argument}" == /* ]]; then
  task_candidate="${task_argument}"
else
  task_candidate="${project_root}/${task_argument}"
fi

task_directory="$(cd -- "$(dirname -- "${task_candidate}")" 2>/dev/null && pwd -P)" || {
  printf 'Task directory does not exist: %s\n' "$(dirname -- "${task_candidate}")" >&2
  exit 66
}
task_filename="$(basename -- "${task_candidate}")"
task_path="${task_directory}/${task_filename}"
expected_task_directory="${project_root}/prompts/tasks"

if [[ "${task_directory}" != "${expected_task_directory}" || ! -f "${task_path}" || "${task_filename}" != *.md ]]; then
  printf 'Task must be an existing Markdown file directly under prompts/tasks/: %s\n' "${task_argument}" >&2
  exit 66
fi

if grep -Eq '^[[:space:]]*Task-Status:[[:space:]]*ARCHIVED[[:space:]]*$' "${task_path}"; then
  printf 'Task is archived and cannot be executed: %s\n' "${task_argument}" >&2
  printf 'Reactivate it only after explicit product approval by removing the ARCHIVED marker and updating the Task index and completion report.\n' >&2
  exit 78
fi

task_id="$(
  sed -nE 's/^[[:space:]#]*执行[[:space:]]+([A-Z][A-Z0-9]*(-[A-Z][A-Z0-9]*)*-[0-9]+).*/\1/p' "${task_path}" |
    sed -n '1p'
)"
if [[ -z "${task_id}" ]]; then
  task_id="$(
    printf '%s\n' "${task_filename}" |
      sed -nE 's/^([A-Z][A-Z0-9]*(-[A-Z][A-Z0-9]*)*-[0-9]+).*/\1/p'
  )"
fi

if [[ -z "${task_id}" || ! "${task_id}" =~ ^[A-Z][A-Z0-9]*(-[A-Z][A-Z0-9]*)*-[0-9]+$ ]]; then
  printf 'Could not derive a stable Task ID from: %s\n' "${task_path}" >&2
  exit 65
fi

task_relative_path="prompts/tasks/${task_filename}"
max_turns="${BUSINESS_AGENT_MAX_TURNS:-20}"
if [[ ! "${max_turns}" =~ ^[1-9][0-9]*$ ]] || (( max_turns > 100 )); then
  printf 'BUSINESS_AGENT_MAX_TURNS must be an integer from 1 to 100.\n' >&2
  exit 64
fi

execution_mode="${BUSINESS_AGENT_EXECUTION_MODE:-full}"
case "${execution_mode}" in
  full|implementation-only)
    ;;
  *)
    printf 'BUSINESS_AGENT_EXECUTION_MODE must be full or implementation-only.\n' >&2
    exit 64
    ;;
esac

run_root="${BUSINESS_AGENT_RUN_ROOT:-${project_root}/.codex/business-agent-runs}"
lock_directory="${BUSINESS_AGENT_LOCK_DIR:-${project_root}/.codex/business-agent-task.lock}"
mkdir -p "${run_root}"

acquire_lock() {
  local owner_pid=''

  if mkdir "${lock_directory}" 2>/dev/null; then
    printf '%s\n' "$$" >"${lock_directory}/pid"
    printf '%s\n' "${task_id}" >"${lock_directory}/task"
    return 0
  fi

  if [[ -r "${lock_directory}/pid" ]]; then
    read -r owner_pid <"${lock_directory}/pid" || owner_pid=''
  fi

  if [[ "${owner_pid}" =~ ^[1-9][0-9]*$ ]] && kill -0 "${owner_pid}" 2>/dev/null; then
    printf 'Another supervised business Task is active (pid=%s, task=%s).\n' \
      "${owner_pid}" "$(cat "${lock_directory}/task" 2>/dev/null || printf 'unknown')" >&2
    return 1
  fi

  rm -f "${lock_directory}/pid" "${lock_directory}/task"
  if ! rmdir "${lock_directory}" 2>/dev/null || ! mkdir "${lock_directory}" 2>/dev/null; then
    printf 'Could not recover stale business-task lock: %s\n' "${lock_directory}" >&2
    return 1
  fi

  printf '%s\n' "$$" >"${lock_directory}/pid"
  printf '%s\n' "${task_id}" >"${lock_directory}/task"
}

lock_owned=false
cleanup_lock() {
  local owner_pid=''

  if [[ "${lock_owned}" != true || ! -d "${lock_directory}" ]]; then
    return
  fi
  if [[ -r "${lock_directory}/pid" ]]; then
    read -r owner_pid <"${lock_directory}/pid" || owner_pid=''
  fi
  if [[ "${owner_pid}" == "$$" ]]; then
    rm -f "${lock_directory}/pid" "${lock_directory}/task"
    rmdir "${lock_directory}" 2>/dev/null || true
  fi
}

if ! acquire_lock; then
  exit 73
fi
lock_owned=true
trap cleanup_lock EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP

run_timestamp="$(date -u '+%Y%m%dT%H%M%SZ')"
run_directory="${run_root}/${run_timestamp}-${task_id}-$$"
mkdir -p "${run_directory}"

session_id=''
turn_number=0
supervisor_status='STARTING'
supervisor_reason=''
candidate_status=''
validation_reason=''
handoff_updated_at=''

write_state() {
  local updated_at
  updated_at="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  jq -n \
    --arg task_id "${task_id}" \
    --arg task_path "${task_relative_path}" \
    --arg session_id "${session_id}" \
    --arg status "${supervisor_status}" \
    --arg reason "${supervisor_reason}" \
    --arg execution_mode "${execution_mode}" \
    --arg handoff_path "${handoff_file}" \
    --arg handoff_updated_at "${handoff_updated_at}" \
    --arg updated_at "${updated_at}" \
    --argjson pid "$$" \
    --argjson turn "${turn_number}" \
    --argjson max_turns "${max_turns}" \
    '{
      task_id: $task_id,
      task_path: $task_path,
      session_id: $session_id,
      supervisor_status: $status,
      reason: $reason,
      execution_mode: $execution_mode,
      handoff_path: $handoff_path,
      handoff_updated_at: $handoff_updated_at,
      pid: $pid,
      turn: $turn,
      max_turns: $max_turns,
      updated_at: $updated_at
    }' >"${run_directory}/state.json.tmp"
  mv "${run_directory}/state.json.tmp" "${run_directory}/state.json"
}

render_events() {
  jq --unbuffered -r '
    def as_text:
      if . == null then ""
      elif type == "string" then .
      else tojson
      end;
    def error_text:
      if (.message? | type) == "string" then .message
      elif (.error? | type) == "object" then (.error.message // .error | as_text)
      elif .error? != null then (.error | as_text)
      else "unknown error"
      end;
    if .type == "thread.started" then
      "[business-agent] session " + (.thread_id // "unknown" | as_text)
    elif .type == "item.completed" and .item.type == "agent_message" then
      (.item.text | as_text)
    elif .type == "item.completed" and .item.type == "command_execution" then
      "[command exit " + ((.item.exit_code // "?") | tostring) + "] " + (.item.command // "" | as_text)
    elif .type == "item.completed" and .item.type == "file_change" then
      "[file change] " + (.item.status // "completed" | as_text)
    elif .type == "turn.failed" then
      "[turn failed] " + error_text
    elif .type == "error" then
      "[codex error] " + error_text
    else
      empty
    end
  ' 2>/dev/null || true
}

extract_session_id() {
  local event_log="$1"
  jq -r 'select(.type == "thread.started") | .thread_id // empty' "${event_log}" 2>/dev/null |
    sed -n '1p'
}

validate_result() {
  local result_file="$1"
  local result_task_id
  local remaining_count
  local external_count
  local blocker_count
  local tests_count
  local terminal_text

  candidate_status=''
  validation_reason=''

  if [[ ! -s "${result_file}" ]]; then
    validation_reason='Codex did not write a final result.'
    return 1
  fi

  if ! jq -e '
    def string_array: type == "array" and all(.[]; type == "string");
    type == "object" and
    (.task_id | type == "string") and
    (.status | type == "string") and
    (.summary | type == "string" and length > 0) and
    (.changed_files | string_array) and
    (.tests | string_array) and
    (.remaining_work | string_array) and
    (.external_verification | string_array) and
    (.blockers | string_array) and
    (.pitfalls | string_array) and
    (.next_action | type == "string")
  ' "${result_file}" >/dev/null 2>&1; then
    validation_reason='Final result does not match the required JSON contract.'
    return 1
  fi

  result_task_id="$(jq -r '.task_id' "${result_file}")"
  candidate_status="$(jq -r '.status' "${result_file}")"
  remaining_count="$(jq -r '.remaining_work | length' "${result_file}")"
  external_count="$(jq -r '.external_verification | length' "${result_file}")"
  blocker_count="$(jq -r '.blockers | length' "${result_file}")"
  tests_count="$(jq -r '.tests | length' "${result_file}")"

  if [[ "${result_task_id}" != "${task_id}" ]]; then
    validation_reason="Final result Task ID ${result_task_id} does not match ${task_id}."
    return 1
  fi

  case "${candidate_status}" in
    CONTINUE)
      if (( remaining_count == 0 )); then
        validation_reason='CONTINUE requires at least one concrete remaining-work item.'
        return 1
      fi
      ;;
    DONE)
      if (( remaining_count != 0 || external_count != 0 || blocker_count != 0 )); then
        validation_reason='DONE requires empty remaining_work, external_verification, and blockers arrays.'
        return 1
      fi
      ;;
    CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING)
      if (( remaining_count != 0 || external_count == 0 || blocker_count != 0 )); then
        validation_reason='CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING requires only external verification to remain.'
        return 1
      fi
      ;;
    BLOCKED)
      if (( blocker_count == 0 )); then
        validation_reason='BLOCKED requires at least one concrete blocker.'
        return 1
      fi
      ;;
    *)
      validation_reason="Unsupported terminal status: ${candidate_status}."
      return 1
      ;;
  esac

  if [[ "${execution_mode}" == 'implementation-only' && "${candidate_status}" == 'DONE' ]]; then
    validation_reason='Implementation-only mode cannot claim DONE before tests, builds, and runtime verification run on a capable host.'
    return 1
  fi
  if [[ "${execution_mode}" == 'implementation-only' && ${tests_count} -ne 0 ]]; then
    validation_reason='Implementation-only mode must not claim locally executed tests or builds; leave tests empty and list verification externally.'
    return 1
  fi

  if [[ "${candidate_status}" == 'DONE' ]]; then
    terminal_text="$(jq -r '[.summary, .next_action] | join(" ")' "${result_file}")"
    if [[ "${terminal_text}" =~ 尚未完成|正在执行|请继续|IN_PROGRESS|[Ii]n[[:space:]]progress|[Nn]ot[[:space:]]complete ]]; then
      validation_reason='DONE contains in-progress language.'
      return 1
    fi
  elif [[ "${candidate_status}" == 'CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING' ]]; then
    terminal_text="$(jq -r '[.summary, .next_action] | join(" ")' "${result_file}")"
    if [[ "${terminal_text}" =~ 正在执行|请继续|IN_PROGRESS|[Ii]n[[:space:]]progress ]]; then
      validation_reason='Code-complete status contains in-progress implementation language.'
      return 1
    fi
  fi

  return 0
}

render_terminal_result() {
  local result_file="$1"
  jq -r '
    "Task: " + .task_id,
    "Status: " + .status,
    "Summary: " + .summary,
    (if (.changed_files | length) > 0 then
      "Changed files:\n" + (.changed_files | map("- " + .) | join("\n"))
    else empty end),
    (if (.tests | length) > 0 then
      "Tests:\n" + (.tests | map("- " + .) | join("\n"))
    else empty end),
    (if (.external_verification | length) > 0 then
      "External verification:\n" + (.external_verification | map("- " + .) | join("\n"))
    else empty end),
    (if (.blockers | length) > 0 then
      "Blockers:\n" + (.blockers | map("- " + .) | join("\n"))
    else empty end),
    (if (.pitfalls | length) > 0 then
      "Pitfalls:\n" + (.pitfalls | map("- " + .) | join("\n"))
    else empty end),
    (if .next_action != "" then "Next action: " + .next_action else empty end)
  ' "${result_file}"
}

write_task_handoff() {
  local result_file="$1"

  if ! bash "${handoff_writer}" \
    --result "${result_file}" \
    --task-path "${task_relative_path}" \
    --execution-mode "${execution_mode}" \
    --session-id "${session_id}" \
    --run-directory "${run_directory}" \
    --output "${handoff_file}"; then
    return 1
  fi
  handoff_updated_at="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
}

write_start_handoff() {
  local start_result="${run_directory}/start-handoff-result.json"

  jq -n \
    --arg task_id "${task_id}" \
    --arg task_path "${task_relative_path}" \
    '{
      task_id: $task_id,
      status: "CONTINUE",
      summary: "The supervised Task was selected and its recovery snapshot was initialized.",
      changed_files: [],
      tests: [],
      remaining_work: ["Read the named Task and complete its implementation and Definition of Done."],
      external_verification: [],
      blockers: [],
      pitfalls: [
        "Do not start another Task or treat this startup snapshot as implementation evidence.",
        "Inspect and preserve the existing worktree before editing."
      ],
      next_action: ("Execute " + $task_id + " from " + $task_path + " through the current supervisor.")
    }' >"${start_result}.tmp"
  mv "${start_result}.tmp" "${start_result}"
  write_task_handoff "${start_result}"
}

if [[ "${execution_mode}" == 'implementation-only' ]]; then
  execution_mode_prompt="$(printf '%s\n' \
    'This supervisor is running in explicit implementation-only mode on a Windows host without Docker or verification tooling.' \
    'Do not invoke Docker, package installation, tests, builds, migrations, application services, browsers, emulators, device tools, or runtime smoke checks.' \
    'Complete every in-scope code and documentation change that can be justified through repository inspection; do not fabricate test or runtime evidence.' \
    'Never return DONE in this mode. When implementation work is complete, return CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING and list every omitted test, build, migration, runtime, visual, device, and business verification item exactly.'
  )"
  delivery_scope_prompt='Continue through all implementation and directly related documentation updates, but leave every execution or verification step to a capable external host.'
else
  execution_mode_prompt='Run in full Definition-of-Done mode, including every current-environment implementation and verification requirement.'
  delivery_scope_prompt='Continue through implementation, migrations, Docker-only tests/builds, required browser or artifact verification, and directly related Task/index/report updates.'
fi

initial_prompt="$(printf '%s\n' \
  'You are running under the Bestar programmatic business-task supervisor.' \
  "Execution mode: ${execution_mode}." \
  "${execution_mode_prompt}" \
  'Use Chinese for progress updates and result text.' \
  'Read AGENTS.md, HANDOFF.md, .codex/skills/bestar-handoff/SKILL.md, prompts/agents/business-logic-agent.md, docs/runbooks/business-agent-execution.md, the named Task, and all relevant skills/docs.' \
  'Verify HANDOFF.md against the current worktree and authoritative Task evidence; use it for orientation, never as proof.' \
  'Inspect and preserve every existing worktree change. Do not revert or overwrite unrelated work.' \
  "Fully execute Task ${task_id} from '${task_relative_path}'." \
  "${delivery_scope_prompt}" \
  'Do not start another Task.' \
  'At the end of this Codex turn, return one JSON object matching the supplied schema.' \
  'Use status CONTINUE whenever any actionable in-scope work remains; the supervisor will resume this same Task automatically.' \
  'Use DONE only after every current-environment acceptance criterion is complete.' \
  'Use CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING only when all repository work and automation are complete and only a named external check remains.' \
  'Use BLOCKED only for a proven external blocker allowed by the business-agent protocol.' \
  'Populate pitfalls with concrete mistakes or recovery hazards the next Session must avoid; use an empty array only when none exist.' \
  'Do not write secrets, credentials, private customer data, or unredacted personal data into the structured result.' \
  "Always return task_id exactly '${task_id}'."
)"

continuation_prompt=''
turn_mode='initial'
if ! write_start_handoff; then
  supervisor_status='HANDOFF_FAILED'
  supervisor_reason="Could not initialize ${handoff_file}."
  write_state
  printf '[supervisor] %s\n' "${supervisor_reason}" >&2
  exit 74
fi
write_state

while (( turn_number < max_turns )); do
  turn_number=$((turn_number + 1))
  event_log="${run_directory}/turn-$(printf '%02d' "${turn_number}")-events.jsonl"
  error_log="${run_directory}/turn-$(printf '%02d' "${turn_number}")-stderr.log"
  result_file="${run_directory}/turn-$(printf '%02d' "${turn_number}")-result.json"
  rm -f "${event_log}" "${error_log}" "${result_file}"

  supervisor_status='RUNNING'
  supervisor_reason="Starting supervised turn ${turn_number} of ${max_turns}."
  write_state
  printf '\n[supervisor] %s turn %s/%s mode=%s\n' "${task_id}" "${turn_number}" "${max_turns}" "${execution_mode}"

  set +e
  if [[ "${turn_mode}" == 'resume' && -n "${session_id}" ]]; then
    BUSINESS_AGENT_SUPERVISOR_INTERNAL=1 "${launcher}" exec resume \
      --json \
      --output-schema "${terminal_schema}" \
      --output-last-message "${result_file}" \
      "${session_id}" \
      "${continuation_prompt}" \
      2>"${error_log}" |
      tee "${event_log}" |
      render_events
  else
    BUSINESS_AGENT_SUPERVISOR_INTERNAL=1 "${launcher}" exec \
      --json \
      --output-schema "${terminal_schema}" \
      --output-last-message "${result_file}" \
      "${initial_prompt}" \
      2>"${error_log}" |
      tee "${event_log}" |
      render_events
  fi
  pipeline_status=("${PIPESTATUS[@]}")
  codex_exit_code="${pipeline_status[0]}"
  set -e

  if [[ -s "${error_log}" ]]; then
    sed 's/^/[codex stderr] /' "${error_log}" >&2
  fi

  observed_session_id="$(extract_session_id "${event_log}")"
  if [[ -n "${observed_session_id}" ]]; then
    if [[ -n "${session_id}" && "${session_id}" != "${observed_session_id}" ]]; then
      supervisor_reason="Codex changed session ID from ${session_id} to ${observed_session_id}."
    fi
    session_id="${observed_session_id}"
  fi

  if (( codex_exit_code == 0 )) && validate_result "${result_file}"; then
    if ! write_task_handoff "${result_file}"; then
      supervisor_status='HANDOFF_FAILED'
      supervisor_reason="Accepted ${candidate_status}, but could not update ${handoff_file}."
      write_state
      printf '[supervisor] %s\n' "${supervisor_reason}" >&2
      exit 74
    fi
    if [[ "${candidate_status}" != 'CONTINUE' ]]; then
      supervisor_status="${candidate_status}"
      supervisor_reason='Accepted a valid terminal result.'
      write_state
      printf '\n[supervisor] Accepted terminal state after %s turn(s).\n' "${turn_number}"
      render_terminal_result "${result_file}"
      printf 'Handoff: %s\n' "${handoff_file}"
      printf 'Run artifacts: %s\n' "${run_directory}"
      exit 0
    fi
    supervisor_reason="Agent requested CONTINUE: $(jq -c '.remaining_work' "${result_file}")"
  elif (( codex_exit_code != 0 )); then
    supervisor_reason="Codex process exited with code ${codex_exit_code}; it will be recovered automatically."
  else
    supervisor_reason="Rejected final result: ${validation_reason}"
  fi

  supervisor_status='CONTINUING'
  write_state
  printf '[supervisor] %s\n' "${supervisor_reason}" >&2

  if (( turn_number >= max_turns )); then
    supervisor_status='SUPERVISOR_EXHAUSTED'
    supervisor_reason="No valid terminal state after ${max_turns} supervised turns."
    write_state
    printf '[supervisor] %s\n' "${supervisor_reason}" >&2
    printf '[supervisor] Inspect %s before restarting the same Task.\n' "${run_directory}" >&2
    exit 75
  fi

  previous_result='No valid structured result was produced.'
  if [[ -s "${result_file}" ]]; then
    previous_result="$(head -c 6000 "${result_file}")"
  fi
  continuation_prompt="$(printf '%s\n' \
    "The supervisor is continuing Task ${task_id}; do not start another Task and do not wait for user input." \
    "Execution mode remains ${execution_mode}. ${execution_mode_prompt}" \
    "Supervisor reason: ${supervisor_reason}" \
    "Previous turn result: ${previous_result}" \
    'Inspect the current worktree, running containers, logs, and persisted artifacts, then continue immediately from the smallest missing acceptance criterion.' \
    'Read the latest HANDOFF.md recovery snapshot, but verify it against the worktree and authoritative Task evidence before relying on it.' \
    'Do not repeat already verified work unless relevant source changed.' \
    'At the end of this turn, return the required JSON object. Use CONTINUE again if actionable work still remains; the supervisor will resume automatically.' \
    'Keep pitfalls current and never include secrets or private business data in the result.' \
    "Always return task_id exactly '${task_id}'."
  )"

  if [[ -n "${session_id}" ]]; then
    turn_mode='resume'
  else
    turn_mode='initial'
    initial_prompt="${initial_prompt}

This is an automatic recovery after a Codex process ended before exposing a session ID. Inspect and continue the existing worktree; do not restart completed work."
  fi
done

exit 75
