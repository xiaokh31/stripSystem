# Business Agent Supervised Task Execution

Use this runbook to execute exactly one `prompts/tasks/` development Task without repeated approval prompts or manual
"continue" messages. Complete Tasks must use the programmatic supervisor.

On a fresh Windows machine, read `docs/runbooks/fresh-windows-agent-onboarding.md`
first. The Bash supervisor requires Git Bash or WSL plus `jq`, and the `codex`
executable must be available in that same shell. The no-Docker Windows workflow
is implementation-only and must not run native tooling, tests, builds, services
or runtime checks.
Codex CLI is the required and recommended execution surface. The Windows
desktop app may be used for optional inspection, but it must not execute a
tracked Task or write the same checkout while the CLI supervisor is active.

## Components

- `.codex/business-agent.config.toml`: repository-managed sandbox and approval profile.
- `scripts/run-business-agent.cmd`: PowerShell/cmd.exe entry that locates Git for Windows and delegates to the canonical launcher.
- `scripts/install-business-agent-profile.sh`: installs and validates the profile in `$CODEX_HOME`.
- `scripts/run-business-agent.sh`: fixed-profile launcher and public command entry.
- `scripts/run-business-task.sh`: one-Task terminal-state supervisor.
- `.codex/business-task-terminal.schema.json`: structured result contract.
- `.codex/skills/bestar-handoff/`: project handoff contract and deterministic writer.
- `HANDOFF.md`: tracked latest-session recovery summary read by every fresh Agent.
- `scripts/test-business-task-supervisor.sh`: offline supervisor regression using a fake Codex CLI.

The launcher fixes the repository root, `business-agent` profile, `danger-full-access` sandbox, and `never` approval. Project
execpolicy still rejects destructive Git, recursive deletion, publishing, remote infrastructure, and host development commands.

## Install Or Update The Profile

Run this after the canonical profile changes:

```bash
cd /Volumes/xfl/logistics/stripSystem
./scripts/install-business-agent-profile.sh --replace
```

Do not resume a Session created with another profile, sandbox, approval policy, or Task.

On Windows, run the wrapper directly from PowerShell. It locates Git for
Windows and delegates to the same tested Bash supervisor:

```powershell
Set-Location C:\bestar-unloading
.\scripts\run-business-agent.cmd doctor
.\scripts\run-business-agent.cmd install
```

`doctor` checks only Git Bash, `jq`, Codex CLI and required shell utilities. It
does not inspect, install or start Docker. For a nonstandard Git installation,
set `BESTAR_GIT_BASH` to the full `bash.exe` path before running the wrapper. A
fresh clone has no local supervisor run history; recover Task status from the
tracked Task index and completion report.

## Execute One Task

Run one quoted Task path from a normal terminal:

```bash
cd /Volumes/xfl/logistics/stripSystem
./scripts/run-business-agent.sh task \
  'prompts/tasks/UNLOAD-PALLET-09Footprint Height Capacity and Oversize Piece Calculation.md'
```

Windows PowerShell equivalent:

```powershell
.\scripts\run-business-agent.cmd develop `
  "prompts/tasks/TASK-FILE.md"
```

`develop` sets `BUSINESS_AGENT_EXECUTION_MODE=implementation-only`. In that
mode the Agent must not invoke Docker, package installation, tests, builds,
migrations, services, browsers, emulators, device tools or runtime smoke. It
must finish all implementation that repository inspection can justify, must
not claim `DONE`, and must return
`CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING` with every omitted verification
item. Its result `tests` array must stay empty because nothing was executed.
Run `.cmd task` only on a different host that can satisfy the full Task
Definition of Done.

The `task` command builds the full execution prompt. Do not add "execute the next task", "continue", or a second Task path.
The command is non-interactive: it streams concise activity, supervises the Task, prints the accepted terminal result, and exits.

Raw `exec`, manual `resume`, and direct launcher prompts are intentionally rejected because they have no terminal-state
supervision.

## What The Supervisor Enforces

1. Only an existing Markdown file directly under `prompts/tasks/` is accepted.
2. A Task containing an exact `Task-Status: ARCHIVED` marker is rejected with exit code 78 before a Codex Session is created.
3. A repository lock prevents two supervised business Tasks from writing the worktree concurrently.
4. The first turn creates a fresh `codex exec --json` Session with the terminal JSON schema.
5. Before Codex starts, the supervisor writes a Task startup recovery snapshot to `HANDOFF.md`.
6. Every valid `CONTINUE` or terminal result atomically updates `HANDOFF.md`; a handoff write failure stops the supervisor instead
   of accepting an unrecorded terminal state.
7. `CONTINUE`, malformed output, the wrong Task ID, in-progress text presented as a terminal result, or a failed Codex process
   triggers an automatic `codex exec resume` for the same Task.
8. The supervisor never starts the next Task.
9. Only `DONE`, `CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING`, or a valid `BLOCKED` result exits successfully.
10. The default limit is 20 Codex turns. Set `BUSINESS_AGENT_MAX_TURNS` to an integer from 1 to 100 when a Task genuinely needs a
   different guardrail.
11. JSONL events, stderr, per-turn results, Session ID, handoff path/update time, and supervisor state are stored under
   `.codex/business-agent-runs/<timestamp>-<task-id>-<pid>/`. This runtime directory is gitignored.

The supervisor prevents premature progress messages from stopping the process. It cannot prove that a model's claimed test result
is true; the Task acceptance criteria, repository tests, generated artifacts, and manual verification remain authoritative.

## Archived Tasks

Archived Task files remain in place so their completed history, implementation
references and reactivation requirements are not lost. Do not rename, copy or
launch one to bypass the guard. To reactivate a Task, first obtain an explicit
product decision, then remove its `Task-Status: ARCHIVED` marker and update both
`prompts/tasks/OPEN-FUNCTIONS-20260707Task Index.md` and
`docs/reports/project-completion-status.html` in the same change.

## State Contract

Every Codex turn returns one JSON object with the exact Task ID and these fields:

- `status`
- `summary`
- `changed_files`
- `tests`
- `remaining_work`
- `external_verification`
- `blockers`
- `pitfalls`
- `next_action`

`pitfalls` records concise, task-specific mistakes or recovery hazards the next
Session must avoid. It may be empty only when none exist. The structured result
and handoff must never contain credentials, private customer data or
unredacted personal information.

### CONTINUE

At least one concrete `remaining_work` item is required. This is an internal turn state, not Task completion. The supervisor resumes
the same Session automatically; the user does not type "continue".

### DONE

Implementation, migration, current-environment automation, required browser/artifact checks, and directly related task/report
updates are complete. `remaining_work`, `external_verification`, and `blockers` must all be empty.

The supervisor rejects `DONE` while `BUSINESS_AGENT_EXECUTION_MODE` is
`implementation-only`.

### CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING

All repository work and current-environment automation are complete. `remaining_work` and `blockers` must be empty, and at least
one exact `external_verification` item is required, such as:

- Microsoft Excel Print Preview or physical printing;
- Android/iOS/Windows hardware not attached to the current host;
- a target deployment host;
- business-user signoff;
- a real or de-identified workbook that has not been supplied.

### BLOCKED

At least one concrete `blockers` item is required. Use this only for an unavailable, non-inferable business decision, credential,
external resource, or a destructive/production/publishing action. Ordinary technical failures must be diagnosed and recovered.

`IN_PROGRESS`, natural-language "not complete", and requests for the user to continue are rejected terminal results.

## Interactive Launcher

Running the launcher without a subcommand opens an unsupervised Codex TUI:

```bash
./scripts/run-business-agent.sh
```

Use that mode only for discussion, inspection, or diagnosis. Do not execute a complete tracked Task there, and do not enter the
next Task into an existing TUI Session.

## Interrupted Process Recovery

If the terminal or host stops the supervisor before an accepted terminal state:

1. Confirm the previous supervisor/Codex process is no longer running.
2. Inspect the latest `.codex/business-agent-runs/*/state.json`, `git status`, current diff, Docker containers, and persisted test
   artifacts. Read `HANDOFF.md` first, but verify it against those sources.
3. Run the same platform and mode command again: `run-business-agent.sh task '<same-task-file>'`, Windows
   `run-business-agent.cmd develop "<same-task-file>"` for implementation-only, or `.cmd task` on a full verification host.
4. The new Session must preserve the existing worktree and continue from the smallest missing acceptance criterion.

The lock is removed on normal exit and signals. A lock whose recorded PID no longer exists is recovered automatically. Never run
two business Agents against the same worktree concurrently.

## Before Starting The Next Task

1. Confirm the supervised process ended with an accepted terminal status.
2. Review `HANDOFF.md`, its structured result, run artifacts, and `git status`.
3. Do not start a dependent Task unless the prerequisite is `DONE`, or its only external verification does not affect the
   dependency and the Task explicitly permits proceeding.
4. Start the next Task with a new supervised `.sh` process, or the `.cmd` wrapper on Windows PowerShell.

## Supervisor Verification

Run the offline regression without invoking a real model:

```bash
./scripts/test-business-task-supervisor.sh
```

The regression redirects `BUSINESS_AGENT_HANDOFF_FILE` to an isolated temporary
file. Do not set that variable during normal execution; normal Tasks must update
the repository-root `HANDOFF.md`.

Run the profile and execpolicy smoke separately:

```bash
./scripts/smoke-business-agent-profile.sh
```
