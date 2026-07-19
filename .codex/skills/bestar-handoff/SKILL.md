---
name: bestar-handoff
description: Maintain the tracked Bestar project HANDOFF.md so fresh agents can safely continue work. Use at the start of every repository session, before resuming or selecting a Task, and before ending, pausing, handing off, or reaching a supervised Task terminal state. Captures current work, completed work, blockers, next action, verification, and pitfalls without duplicating authoritative plans or exposing secrets.
---

# Bestar Handoff

Use the repository-root `HANDOFF.md` as the single current-session handoff.
Git history preserves older versions after commits; do not create competing
"latest" handoff files.

## Start A Session

1. Read `AGENTS.md`, then `HANDOFF.md`, before selecting or editing a Task.
2. Inspect `git status` and the authoritative Task/index/report files referenced
   by the handoff.
3. Treat the handoff as orientation, not as proof. Resolve conflicts in favor of
   the current worktree, named Task, task index, completion report, tests, and
   persisted artifacts.
4. State whether the handoff is current, stale, or inconsistent before acting.
5. Preserve all existing changes. Never reset work merely because the handoff
   describes another session.

## End Or Pause A Session

Update `HANDOFF.md` immediately before the final response, including for
read-only planning/diagnosis sessions. Keep it concise and reference existing
artifacts instead of copying them.

Always record:

- what is active now and its exact Task/status;
- what was completed in this session;
- changed files and tests actually run;
- remaining implementation, external verification, and blockers separately;
- the single next action and prerequisite;
- task-specific pitfalls that the next agent must not repeat;
- authoritative paths the next agent should read.

For a supervised business Task, use
`.codex/skills/bestar-handoff/scripts/write-handoff.sh`; the supervisor calls
it automatically from the structured terminal result. For other agents, update
the same sections directly with `apply_patch`.

## Status Rules

- `DONE`: no remaining implementation, external verification, or blockers.
- `CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING`: repository work is complete;
  list exact device, Excel, target-host, real-sample, or business-signoff work.
- `BLOCKED`: name the non-inferable decision, credential, or external resource.
- `CONTINUE`: list concrete remaining implementation; this is a recovery
  snapshot, not a terminal result.
- Never convert an archived Task into a next action.

## Safety

- Never write passwords, tokens, secrets, private signing material, full device
  identifiers, private customer data, or unredacted personal information.
- Do not claim unrun tests or inferred visual/device results.
- Do not paste long diffs, logs, PRDs, or reports. Link their repository paths.
- Do not use the handoff to override `AGENTS.md`, the active Task, the task
  index, the completion report, or database/runtime evidence.
- If there is no task-specific pitfall, say so explicitly instead of inventing
  one.
