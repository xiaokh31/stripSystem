#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(cd -- "${script_dir}/../../../.." && pwd)"

result_file=''
task_path=''
execution_mode='unknown'
session_id=''
run_directory=''
source_name='business-task-supervisor'
output_file="${project_root}/HANDOFF.md"

usage() {
  printf 'Usage: %s --result <result.json> --task-path <path> [options]\n' "$0" >&2
  printf 'Options: --execution-mode <mode> --session-id <id> --run-directory <path> --source <name> --output <path>\n' >&2
}

while (( $# > 0 )); do
  case "$1" in
    --result)
      result_file="${2:-}"
      shift 2
      ;;
    --task-path)
      task_path="${2:-}"
      shift 2
      ;;
    --execution-mode)
      execution_mode="${2:-}"
      shift 2
      ;;
    --session-id)
      session_id="${2:-}"
      shift 2
      ;;
    --run-directory)
      run_directory="${2:-}"
      shift 2
      ;;
    --source)
      source_name="${2:-}"
      shift 2
      ;;
    --output)
      output_file="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf 'Unknown argument: %s\n' "$1" >&2
      usage
      exit 64
      ;;
  esac
done

if [[ -z "${result_file}" || -z "${task_path}" ]]; then
  usage
  exit 64
fi
if [[ ! -f "${result_file}" ]]; then
  printf 'Structured result does not exist: %s\n' "${result_file}" >&2
  exit 66
fi
if ! command -v jq >/dev/null 2>&1; then
  printf 'write-handoff.sh requires jq.\n' >&2
  exit 69
fi
if ! jq -e '
  def string_array: type == "array" and all(.[]; type == "string");
  type == "object" and
  (.task_id | type == "string" and length > 0) and
  (.status == "CONTINUE" or
   .status == "DONE" or
   .status == "CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING" or
   .status == "BLOCKED") and
  (.summary | type == "string" and length > 0) and
  (.changed_files | string_array) and
  (.tests | string_array) and
  (.remaining_work | string_array) and
  (.external_verification | string_array) and
  (.blockers | string_array) and
  (.pitfalls | string_array) and
  (.next_action | type == "string")
' "${result_file}" >/dev/null; then
  printf 'Structured result cannot be rendered as a Bestar handoff: %s\n' "${result_file}" >&2
  exit 65
fi

task_id="$(jq -r '.task_id' "${result_file}")"
status="$(jq -r '.status' "${result_file}")"
summary="$(jq -r '.summary | gsub("[\\r\\n]+"; " ")' "${result_file}")"
next_action="$(jq -r '.next_action | gsub("[\\r\\n]+"; " ")' "${result_file}")"
generated_at="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
git_head="$(git -C "${project_root}" rev-parse --short HEAD 2>/dev/null || printf 'unknown')"
if [[ -n "$(git -C "${project_root}" status --porcelain --untracked-files=normal 2>/dev/null)" ]]; then
  worktree_state='dirty; preserve and inspect existing changes'
else
  worktree_state='clean'
fi

case "${status}" in
  CONTINUE)
    current_activity="${task_id} remains active; continue from the remaining implementation below."
    ;;
  DONE)
    current_activity="${task_id} is complete; no implementation or verification remains for this Task."
    ;;
  CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING)
    current_activity="${task_id} repository work is complete; only the named external verification remains."
    ;;
  BLOCKED)
    current_activity="${task_id} is paused at the concrete blocker listed below."
    ;;
  *)
    current_activity="${task_id} last reported status ${status}; verify it before continuing."
    ;;
esac

render_list() {
  local heading="$1"
  local expression="$2"
  local empty_text="$3"
  local item

  printf '### %s\n\n' "${heading}"
  if jq -e "${expression} | length > 0" "${result_file}" >/dev/null; then
    while IFS= read -r item; do
      printf -- '- %s\n' "${item}"
    done < <(jq -r "${expression}[] | gsub(\"[\\r\\n]+\"; \" \")" "${result_file}")
  else
    printf -- '- %s\n' "${empty_text}"
  fi
  printf '\n'
}

output_directory="$(dirname -- "${output_file}")"
mkdir -p "${output_directory}"
temporary_file="$(mktemp "${output_directory}/.HANDOFF.md.tmp.XXXXXX")"
cleanup() {
  rm -f "${temporary_file}"
}
trap cleanup EXIT

{
  printf '# Bestar Agent Handoff\n\n'
  printf '> 新会话必须先读 `AGENTS.md` 和本文件，再核对当前 Task、任务索引、完成度报告与 `git status`。本文件用于交接，不替代验收证据。\n\n'
  printf '## 交接元数据\n\n'
  printf -- '- Generated at: `%s`\n' "${generated_at}"
  printf -- '- Source: `%s`\n' "${source_name}"
  printf -- '- Task: `%s`\n' "${task_id}"
  printf -- '- Task file: `%s`\n' "${task_path}"
  printf -- '- Status: `%s`\n' "${status}"
  printf -- '- Execution mode: `%s`\n' "${execution_mode}"
  printf -- '- Session: `%s`\n' "${session_id:-not-recorded}"
  printf -- '- Git HEAD: `%s`\n' "${git_head}"
  printf -- '- Worktree: %s\n' "${worktree_state}"
  if [[ -n "${run_directory}" ]]; then
    printf -- '- Local supervisor artifacts: `%s`\n' "${run_directory}"
  fi
  printf '\n## 现在在做什么\n\n%s\n\n' "${current_activity}"
  printf '## 已完成\n\n- %s\n\n' "${summary}"
  render_list 'Changed files' '.changed_files' 'No changed files were reported.'
  render_list 'Tests and verification actually run' '.tests' 'No tests or verification were reported as run.'
  printf '## 卡在哪里\n\n'
  render_list 'Remaining implementation' '.remaining_work' 'No remaining implementation was reported.'
  render_list 'External verification' '.external_verification' 'No external verification was reported.'
  render_list 'Blockers' '.blockers' 'No blocker was reported.'
  printf '## 下一步\n\n'
  if [[ -n "${next_action}" ]]; then
    printf -- '- %s\n\n' "${next_action}"
  else
    printf -- '- Re-read the current Task index and select only an eligible non-archived next Task.\n\n'
  fi
  printf '## 不要再踩的坑\n\n'
  if jq -e '.pitfalls | length > 0' "${result_file}" >/dev/null; then
    while IFS= read -r item; do
      printf -- '- %s\n' "${item}"
    done < <(jq -r '.pitfalls[] | gsub("[\\r\\n]+"; " ")' "${result_file}")
  else
    printf -- '- No task-specific pitfall was reported; verify the worktree and evidence instead of inventing one.\n'
  fi
  printf '\n## 新会话启动清单\n\n'
  printf '1. Read `AGENTS.md` and `.codex/skills/bestar-handoff/SKILL.md`.\n'
  printf '2. Run `git status --short`; preserve all existing changes.\n'
  printf '3. Read the Task file above plus `prompts/tasks/OPEN-FUNCTIONS-20260707Task Index.md` and `docs/reports/project-completion-status.html`.\n'
  printf '4. Verify this handoff against code, tests, runtime state, and artifacts before acting.\n'
  printf '5. Do not execute any Task marked `Task-Status: ARCHIVED`.\n\n'
  printf '## 权威参考\n\n'
  printf -- '- `%s`\n' "${task_path}"
  printf -- '- `prompts/tasks/OPEN-FUNCTIONS-20260707Task Index.md`\n'
  printf -- '- `docs/reports/project-completion-status.html`\n'
  printf -- '- `docs/runbooks/business-agent-execution.md`\n'
} >"${temporary_file}"

mv "${temporary_file}" "${output_file}"
trap - EXIT
printf 'Updated Bestar handoff: %s\n' "${output_file}"
