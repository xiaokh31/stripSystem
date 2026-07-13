#!/usr/bin/env bash
set -euo pipefail

fake_codex() {
  local output_file=''
  local argument
  local next_is_output=false
  local call_number=0
  local result=''
  local status=''
  local task_id="${FAKE_TASK_ID:-UNLOAD-PALLET-09}"

  for argument in "$@"; do
    if [[ "${argument}" == '--version' || "${argument}" == '-V' ]]; then
      printf 'codex-cli fake\n'
      return 0
    fi
    if [[ "${next_is_output}" == true ]]; then
      output_file="${argument}"
      next_is_output=false
      continue
    fi
    case "${argument}" in
      -o|--output-last-message)
        next_is_output=true
        ;;
    esac
  done

  if [[ -z "${output_file}" ]]; then
    printf 'Fake Codex did not receive --output-last-message.\n' >&2
    return 90
  fi

  if [[ -r "${FAKE_CODEX_STATE}" ]]; then
    read -r call_number <"${FAKE_CODEX_STATE}" || call_number=0
  fi
  call_number=$((call_number + 1))
  printf '%s\n' "${call_number}" >"${FAKE_CODEX_STATE}"
  {
    printf 'call=%s' "${call_number}"
    printf ' %q' "$@"
    printf '\n'
  } >>"${FAKE_CODEX_CALL_LOG}"

  jq -nc --arg id 'fake-session-001' '{type:"thread.started",thread_id:$id}'

  if [[ "${FAKE_CODEX_SCENARIO}" == 'process_failure_then_done' && ${call_number} -eq 1 ]]; then
    jq -nc '{type:"error",message:"simulated process failure"}'
    return 17
  fi

  case "${FAKE_CODEX_SCENARIO}" in
    continue_then_done)
      if [[ ${call_number} -eq 1 ]]; then status='CONTINUE'; else status='DONE'; fi
      ;;
    malformed_then_done)
      if [[ ${call_number} -eq 1 ]]; then
        result='UNLOAD-PALLET-09 is still in progress.'
      else
        status='DONE'
      fi
      ;;
    wrong_task_then_done)
      if [[ ${call_number} -eq 1 ]]; then
        task_id='UNLOAD-PALLET-10'
      fi
      status='DONE'
      ;;
    terminal_progress_then_done)
      status='DONE'
      ;;
    process_failure_then_done)
      status='DONE'
      ;;
    blocked)
      status='BLOCKED'
      ;;
    external)
      status='CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING'
      ;;
    exhaust)
      status='CONTINUE'
      ;;
    *)
      printf 'Unknown fake scenario: %s\n' "${FAKE_CODEX_SCENARIO}" >&2
      return 91
      ;;
  esac

  if [[ -z "${result}" ]]; then
    case "${status}" in
      CONTINUE)
        result="$(jq -nc --arg task_id "${task_id}" '{
          task_id:$task_id,
          status:"CONTINUE",
          summary:"Implementation is continuing.",
          changed_files:["example.ts"],
          tests:[],
          remaining_work:["Finish the focused regression tests."],
          external_verification:[],
          blockers:[],
          next_action:"Continue implementation."
        }')"
        ;;
      DONE)
        summary='All repository work and verification are complete.'
        if [[ "${FAKE_CODEX_SCENARIO}" == 'terminal_progress_then_done' && ${call_number} -eq 1 ]]; then
          summary='Task is still in progress.'
        fi
        result="$(jq -nc --arg task_id "${task_id}" --arg summary "${summary}" '{
          task_id:$task_id,
          status:"DONE",
          summary:$summary,
          changed_files:["example.ts"],
          tests:["focused tests passed"],
          remaining_work:[],
          external_verification:[],
          blockers:[],
          next_action:""
        }')"
        ;;
      CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING)
        result="$(jq -nc --arg task_id "${task_id}" '{
          task_id:$task_id,
          status:"CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING",
          summary:"Code and local automation are complete.",
          changed_files:["example.ts"],
          tests:["focused tests passed"],
          remaining_work:[],
          external_verification:["Open the generated workbook in Microsoft Excel."],
          blockers:[],
          next_action:"Perform the named external verification."
        }')"
        ;;
      BLOCKED)
        result="$(jq -nc --arg task_id "${task_id}" '{
          task_id:$task_id,
          status:"BLOCKED",
          summary:"A non-inferable production credential is required.",
          changed_files:[],
          tests:[],
          remaining_work:["Run the credential-protected external operation."],
          external_verification:[],
          blockers:["The required production credential was not provided."],
          next_action:"Provide the named credential through the approved channel."
        }')"
        ;;
    esac
  fi

  printf '%s\n' "${result}" >"${output_file}"
  jq -nc --arg text "${result}" '{type:"item.completed",item:{type:"agent_message",text:$text}}'
  jq -nc '{type:"turn.completed",usage:{input_tokens:1,output_tokens:1}}'
}

if [[ "$(basename -- "$0")" == 'codex' ]]; then
  fake_codex "$@"
  exit $?
fi

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(cd -- "${script_dir}/.." && pwd)"
launcher="${project_root}/scripts/run-business-agent.sh"
canonical_profile="${project_root}/.codex/business-agent.config.toml"
task_file='prompts/tasks/UNLOAD-PALLET-09Footprint Height Capacity and Oversize Piece Calculation.md'
test_root="$(mktemp -d "${TMPDIR:-/private/tmp}/bestar-business-task-supervisor-test.XXXXXX")"
fake_bin="${test_root}/bin"
fake_home="${test_root}/codex-home"
mkdir -p "${fake_bin}" "${fake_home}"
ln -s "${script_dir}/$(basename -- "$0")" "${fake_bin}/codex"
cp "${canonical_profile}" "${fake_home}/business-agent.config.toml"

cleanup() {
  rm -rf "${test_root}"
}
trap cleanup EXIT

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

assert_equals() {
  local expected="$1"
  local actual="$2"
  local label="$3"
  if [[ "${expected}" != "${actual}" ]]; then
    fail "${label}: expected ${expected}, got ${actual}"
  fi
}

run_case() {
  local scenario="$1"
  local max_turns="$2"
  local expected_exit="$3"
  local expected_calls="$4"
  local expected_state="$5"
  local case_root="${test_root}/${scenario}"
  local state_file="${case_root}/fake-state"
  local call_log="${case_root}/calls.log"
  local run_root="${case_root}/runs"
  local lock_directory="${case_root}/lock"
  local output
  local exit_code
  local final_state
  local calls=0

  mkdir -p "${case_root}"
  set +e
  output="$(
    PATH="${fake_bin}:${PATH}" \
      CODEX_HOME="${fake_home}" \
      FAKE_CODEX_SCENARIO="${scenario}" \
      FAKE_CODEX_STATE="${state_file}" \
      FAKE_CODEX_CALL_LOG="${call_log}" \
      FAKE_TASK_ID='UNLOAD-PALLET-09' \
      BUSINESS_AGENT_MAX_TURNS="${max_turns}" \
      BUSINESS_AGENT_RUN_ROOT="${run_root}" \
      BUSINESS_AGENT_LOCK_DIR="${lock_directory}" \
      "${launcher}" task "${task_file}" 2>&1
  )"
  exit_code=$?
  set -e

  if [[ -r "${state_file}" ]]; then
    read -r calls <"${state_file}" || calls=0
  fi
  final_state="$(find "${run_root}" -name state.json -type f -exec jq -r '.supervisor_status' {} \; | head -n 1)"

  assert_equals "${expected_exit}" "${exit_code}" "${scenario} exit code"
  assert_equals "${expected_calls}" "${calls}" "${scenario} Codex calls"
  assert_equals "${expected_state}" "${final_state}" "${scenario} supervisor state"

  if [[ -d "${lock_directory}" ]]; then
    fail "${scenario} left the business-task lock behind"
  fi

  if (( expected_calls > 1 )) && ! grep -Fq ' resume ' "${call_log}"; then
    fail "${scenario} did not resume the original session"
  fi
  if [[ "${expected_state}" == 'SUPERVISOR_EXHAUSTED' && "${output}" != *'No valid terminal state'* ]]; then
    fail "${scenario} did not explain supervisor exhaustion"
  fi

  printf 'PASS: %s\n' "${scenario}"
}

run_case continue_then_done 4 0 2 DONE
run_case malformed_then_done 4 0 2 DONE
run_case wrong_task_then_done 4 0 2 DONE
run_case terminal_progress_then_done 4 0 2 DONE
run_case process_failure_then_done 4 0 2 DONE
run_case blocked 2 0 1 BLOCKED
run_case external 2 0 1 CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING
run_case exhaust 3 75 3 SUPERVISOR_EXHAUSTED

set +e
raw_exec_output="$(
  PATH="${fake_bin}:${PATH}" CODEX_HOME="${fake_home}" \
    "${launcher}" exec 'unsupervised prompt' 2>&1
)"
raw_exec_exit=$?
set -e
assert_equals 2 "${raw_exec_exit}" 'raw exec guard exit code'
if [[ "${raw_exec_output}" != *'Unsupervised prompts, exec, and resume are disabled'* ]]; then
  fail 'raw exec guard did not provide the supervised command'
fi
printf 'PASS: raw exec guard\n'

set +e
direct_prompt_output="$(
  PATH="${fake_bin}:${PATH}" CODEX_HOME="${fake_home}" \
    "${launcher}" 'execute the next task' 2>&1
)"
direct_prompt_exit=$?
set -e
assert_equals 2 "${direct_prompt_exit}" 'direct prompt guard exit code'
if [[ "${direct_prompt_output}" != *'Unsupervised prompts, exec, and resume are disabled'* ]]; then
  fail 'direct prompt guard did not provide the supervised command'
fi
printf 'PASS: direct prompt guard\n'

concurrent_root="${test_root}/concurrent-lock"
mkdir -p "${concurrent_root}/lock"
printf '%s\n' "$$" >"${concurrent_root}/lock/pid"
printf '%s\n' 'OTHER-TASK-01' >"${concurrent_root}/lock/task"
set +e
concurrent_output="$(
  PATH="${fake_bin}:${PATH}" \
    CODEX_HOME="${fake_home}" \
    BUSINESS_AGENT_RUN_ROOT="${concurrent_root}/runs" \
    BUSINESS_AGENT_LOCK_DIR="${concurrent_root}/lock" \
    "${launcher}" task "${task_file}" 2>&1
)"
concurrent_exit=$?
set -e
assert_equals 73 "${concurrent_exit}" 'concurrent lock exit code'
if [[ "${concurrent_output}" != *'Another supervised business Task is active'* ]]; then
  fail 'concurrent lock did not identify the active Task'
fi
rm -f "${concurrent_root}/lock/pid" "${concurrent_root}/lock/task"
rmdir "${concurrent_root}/lock"
printf 'PASS: concurrent Task lock\n'

set +e
invalid_path_output="$(
  PATH="${fake_bin}:${PATH}" CODEX_HOME="${fake_home}" \
    "${launcher}" task AGENTS.md 2>&1
)"
invalid_path_exit=$?
set -e
assert_equals 66 "${invalid_path_exit}" 'invalid Task path exit code'
if [[ "${invalid_path_output}" != *'directly under prompts/tasks/'* ]]; then
  fail 'invalid Task path did not explain the path boundary'
fi
printf 'PASS: Task path boundary\n'

printf 'Business-task supervisor tests passed.\n'
