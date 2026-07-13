# Business Agent Supervised Task Execution

Use this runbook to execute exactly one `prompts/tasks/` development Task without repeated approval prompts or manual
"continue" messages. Complete Tasks must use the programmatic supervisor.

## Components

- `.codex/business-agent.config.toml`: repository-managed sandbox and approval profile.
- `scripts/install-business-agent-profile.sh`: installs and validates the profile in `$CODEX_HOME`.
- `scripts/run-business-agent.sh`: fixed-profile launcher and public command entry.
- `scripts/run-business-task.sh`: one-Task terminal-state supervisor.
- `.codex/business-task-terminal.schema.json`: structured result contract.
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

## Execute One Task

Run one quoted Task path from a normal terminal:

```bash
cd /Volumes/xfl/logistics/stripSystem
./scripts/run-business-agent.sh task \
  'prompts/tasks/UNLOAD-PALLET-09Footprint Height Capacity and Oversize Piece Calculation.md'
```

The `task` command builds the full execution prompt. Do not add "execute the next task", "continue", or a second Task path.
The command is non-interactive: it streams concise activity, supervises the Task, prints the accepted terminal result, and exits.

Raw `exec`, manual `resume`, and direct launcher prompts are intentionally rejected because they have no terminal-state
supervision.

## What The Supervisor Enforces

1. Only an existing Markdown file directly under `prompts/tasks/` is accepted.
2. A repository lock prevents two supervised business Tasks from writing the worktree concurrently.
3. The first turn creates a fresh `codex exec --json` Session with the terminal JSON schema.
4. `CONTINUE`, malformed output, the wrong Task ID, in-progress text presented as a terminal result, or a failed Codex process
   triggers an automatic `codex exec resume` for the same Task.
5. The supervisor never starts the next Task.
6. Only `DONE`, `CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING`, or a valid `BLOCKED` result exits successfully.
7. The default limit is 20 Codex turns. Set `BUSINESS_AGENT_MAX_TURNS` to an integer from 1 to 100 when a Task genuinely needs a
   different guardrail.
8. JSONL events, stderr, per-turn results, Session ID, and supervisor state are stored under
   `.codex/business-agent-runs/<timestamp>-<task-id>-<pid>/`. This runtime directory is gitignored.

The supervisor prevents premature progress messages from stopping the process. It cannot prove that a model's claimed test result
is true; the Task acceptance criteria, repository tests, generated artifacts, and manual verification remain authoritative.

## State Contract

Every Codex turn returns one JSON object with the exact Task ID and these fields:

- `status`
- `summary`
- `changed_files`
- `tests`
- `remaining_work`
- `external_verification`
- `blockers`
- `next_action`

### CONTINUE

At least one concrete `remaining_work` item is required. This is an internal turn state, not Task completion. The supervisor resumes
the same Session automatically; the user does not type "continue".

### DONE

Implementation, migration, current-environment automation, required browser/artifact checks, and directly related task/report
updates are complete. `remaining_work`, `external_verification`, and `blockers` must all be empty.

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
   artifacts.
3. Run the same `run-business-agent.sh task '<same-task-file>'` command again.
4. The new Session must preserve the existing worktree and continue from the smallest missing acceptance criterion.

The lock is removed on normal exit and signals. A lock whose recorded PID no longer exists is recovered automatically. Never run
two business Agents against the same worktree concurrently.

## Before Starting The Next Task

1. Confirm the supervised process ended with an accepted terminal status.
2. Review its result, run artifacts, and `git status`.
3. Do not start a dependent Task unless the prerequisite is `DONE`, or its only external verification does not affect the
   dependency and the Task explicitly permits proceeding.
4. Start the next Task with a new `run-business-agent.sh task '<next-task-file>'` process.

## Supervisor Verification

Run the offline regression without invoking a real model:

```bash
./scripts/test-business-task-supervisor.sh
```

Run the profile and execpolicy smoke separately:

```bash
./scripts/smoke-business-agent-profile.sh
```
