# Fresh Windows Agent Onboarding

## Purpose

Use this runbook when a Windows 11 machine and its Codex Agent have no prior
Bestar conversation or local runtime history. The repository is the handoff;
conversation memory is not required.

This document does not replace the active Task or completion evidence. It tells
a fresh Agent how to recover the authoritative state, identify external
prerequisites, and execute exactly one Task without repeating completed work.

## Recommended Codex Surface: CLI

Use **Codex CLI** as the only execution surface for tracked Bestar Tasks on
Windows. Do not use the Codex/ChatGPT Windows desktop app to execute a
`prompts/tasks/` Task.

This repository's supervisor directly depends on stable CLI capabilities:

- `codex exec` for non-interactive execution;
- `codex exec resume` for automatic continuation of the same Task;
- JSONL event output;
- a JSON output Schema and final-result file;
- a fixed workspace, profile, sandbox and approval policy;
- shell exit codes and persisted supervisor state.

The Windows desktop app is useful for optional interactive inspection, diff
review and general discussion, but it is not the authoritative runner for this
project. Starting a Task in the app bypasses
`scripts/run-business-agent.sh`, the one-Task lock, structured terminal states
and automatic continuation. Never let the app and CLI write the same checkout
at the same time.

Official references:

- Codex CLI developer commands and `codex exec`:
  <https://developers.openai.com/codex/cli/reference>
- Codex/ChatGPT desktop app:
  <https://developers.openai.com/codex/app>

The desktop app may be installed, but it is optional. Codex CLI is required.

## Can One Fresh Windows Machine Close Every Remaining Task?

No. A correctly prepared Windows 11 machine can perform active Docker target
deployment, Microsoft Excel and printing evidence when those tools exist, but
it cannot replace all external resources. The React Native Windows/MSIX package
route was archived by product decision on 2026-07-15 and is not active work.

The current Windows machine is explicitly **implementation-only** because it
has no Docker and the user does not want local execution or testing. It may edit
business code, but it cannot close any Task that requires a test, build,
migration, runtime, visual, device or business acceptance gate.

| Work | Windows capability | Additional requirement |
| --- | --- | --- |
| `UNLOAD-REPORT-01` | Yes | Desktop Microsoft Excel, the generated workbook, Print Preview and Print to PDF evidence |
| `UNLOAD-PALLET-04` | Yes | A real or de-identified business workbook supplied outside Git |
| `UNLOAD-PALLET-10` external closure | Partly | The same business workbook, target 150mm x 100mm printer and PDA/scanner |
| `NATIVE-AUTH-01` | No active Windows portion | Remaining active evidence comes from Android/iOS devices; Windows Credential Locker is archived |
| `NATIVE-UX-04/05/06` | No active Windows portion | Final closure uses Android/iOS evidence; Windows matrices are archived |
| `CROSS-UX-QA-01` | Web work can run on a capable host | Active Native matrix consumes Android/iOS evidence; Windows is archived |
| Windows RNW/MSIX archive | Do not execute | P6-MOBILE-09 through 13 carry `Task-Status: ARCHIVED` and the supervisor rejects them |
| `P5-PILOT-01` | Yes, only on the target host | Intended warehouse network, production configuration, accounts, devices, backup destination and business sign-off |

The live list and order are maintained in:

- `prompts/tasks/OPEN-FUNCTIONS-20260707Task Index.md`
- `docs/reports/project-completion-status.html`

Do not infer current status from Task filenames, old conversation text, or the
absence of `.codex/business-agent-runs/` on a fresh clone.

## Authoritative Read Order

Before changing files, a fresh Agent must read these in order:

1. `AGENTS.md` for repository rules and the Definition of Done.
2. `HANDOFF.md` and `.codex/skills/bestar-handoff/SKILL.md` for the latest
   recovery summary and its trust rules.
3. `CONTEXT.md` for domain terms and product boundaries.
4. `prompts/agents/business-logic-agent.md` for the business Agent contract.
5. `prompts/tasks/OPEN-FUNCTIONS-20260707Task Index.md` for the current queue.
6. `docs/reports/project-completion-status.html` for implementation and
   verification evidence.
7. The one selected `prompts/tasks/<TASK>.md` file.
8. Every skill, product document, ADR, runbook and checklist named by that
   Task.

`HANDOFF.md` is advisory and may be stale after a branch switch or incomplete
file transfer. Resolve conflicts in favor of the current worktree, selected
Task, task index, completion report, tests and persisted artifacts. Preserve
existing changes while resolving the discrepancy.

Only after an explicit future product decision reactivates Windows native work,
also read:

- `docs/product/01-cross-platform-mobile-scan-app.md`
- `docs/adr/0003-native-scan-app.md`
- `docs/runbooks/native-scan-app-release.md`
- `docs/runbooks/native-scan-app-testing.md`
- `apps/mobile-scan-app/windows/PLATFORM-STATUS.md`
- `apps/mobile-scan-app/windows/P6-MOBILE-13-MSIX-RELEASE-CHECKLIST.md`
- `docs/reports/native-auth-01-revocable-session-verification.md`

## State That Git Does Not Carry

A fresh clone only contains committed repository files. Arrange the following
through approved secure channels when the selected Task needs them:

- `.env` values and production secrets;
- PostgreSQL data or a PostgreSQL backup;
- the persistent `storage/` contents;
- original, real or de-identified Excel fixtures and the unloading report
  template under `samples/`;
- test accounts or one-time account credentials;
- signing certificates and private keys;
- MSIX, APK or IPA binaries;
- previous device screenshots, measurements and business sign-off not already
  committed as a redacted report.

Most `samples/`, all runtime storage, `.env`, signing files and package binaries
are intentionally ignored by Git. Never fabricate a real-sample acceptance
result because those files are absent.

Before moving work to the Windows machine, commit and transfer the intended
branch or copy the complete worktree. Uncommitted changes on another computer
do not appear in a normal clone. The same applies to an uncommitted
`HANDOFF.md`; transfer or commit it only after checking that it contains no
secrets or private business data.

## Windows Machine Prerequisites

Common prerequisites:

- Windows 11 with a short local repository path such as
  `C:\bestar-unloading`; do not use OneDrive or a synchronized directory.
- Git for Windows, including Git Bash.
- Codex CLI and `jq` available to Git Bash. PowerShell calls the provided `.cmd`
  wrapper, which uses Git Bash internally for the canonical supervisor.

This implementation-only Windows host does not require Docker, Node, pnpm,
Visual Studio, Android Studio, Microsoft Excel, a database or device tooling.
Do not install or invoke them from the `develop` workflow.

The following are dormant reactivation prerequisites for `P6-MOBILE-13`, not
current machine setup requirements:

- Node.js `>=22.11.0` and the repository-pinned pnpm `11.9.0`;
- Visual Studio 2022 with Desktop development with C++, Universal Windows
  Platform tools and the Windows SDK;
- MSIX packaging tools;
- a company certificate or an approved test-signing certificate kept outside
  Git;
- a real Windows warehouse device or tablet;
- access to the warehouse LAN API and an authorized WAREHOUSE test account.

Install Android Studio/JDK/SDK and attach an Android device only when collecting
Android evidence. A Windows machine cannot build the iOS app; retain existing
iOS evidence or use a separate macOS/Xcode build machine and iPhone.

## First-Machine Preflight

In PowerShell from the repository root:

```powershell
git status --short
git rev-parse --show-toplevel
git rev-parse HEAD
codex --version
```

The following belongs only to a future Windows native verification host after
the archive is explicitly reopened, not the current implementation-only machine:

```powershell
node --version
corepack pnpm --version
where.exe msbuild
where.exe dotnet
```

The Node version must satisfy `apps/mobile-scan-app/package.json`, and pnpm must
match the root `packageManager` field. Host Node/pnpm is allowed only for an
explicit Android, iOS or Windows native toolchain Task. Web, API, Worker,
Prisma, lint, tests and production builds remain Docker-only.

Continue in PowerShell:

```powershell
.\scripts\run-business-agent.cmd doctor
.\scripts\run-business-agent.cmd install
```

The `.cmd` wrapper allows PowerShell to use the repository supervisor without
manually opening Git Bash. It locates the standard Git for Windows install and
checks that `codex` and `jq` are available to Git Bash. For a nonstandard Git
installation, set the override before running `doctor`:

```powershell
$env:BESTAR_GIT_BASH = 'C:\Program Files\Git\bin\bash.exe'
```

Do not run RNW, MSIX, Android, Docker or application commands in this mode.

Do not open the same tracked Task in the Windows desktop app as a workaround for
shell setup. Fix any failure reported by `run-business-agent.cmd doctor`, then
use the supervised CLI entry point.

## No Docker Or Runtime Setup On This Host

Do not create `.env`, restore PostgreSQL or `storage/`, start Docker, install
dependencies, run migrations, start application services, or execute tests and
builds on the implementation-only Windows machine. It only edits repository
source and documentation.

A later verification host must follow `docs/runbooks/local-deployment.md` and
`docs/runbooks/backup-restore.md`. Missing runtime state is external
verification, not permission to fabricate fixtures or acceptance evidence.

## Select Exactly One Task

Select `develop` only when the named Task still has concrete repository code or
documentation to implement. The currently listed incomplete Tasks are largely
external verification gates. Do not rerun `NATIVE-AUTH-01`,
`UNLOAD-REPORT-01`, `UNLOAD-PALLET-10` or other code-complete Tasks merely
because this machine has no run history.

`P6-MOBILE-13` is archived and the supervisor rejects it with exit code 78
before creating a Session. Do not copy, rename or manually prompt the Task to
bypass that guard. Its RNW/MSIX requirements remain only as future references.

Other next actions are conditional:

- real/de-identified packaging workbook available: `UNLOAD-PALLET-04`;
- Microsoft Excel available with the generated report: close the external
  verification for `UNLOAD-REPORT-01` without repeating repository development;
- only Android/iOS devices available: collect evidence using the existing
  runbooks and reports; do not start a new code Task;
- intended warehouse production host available: run `P5-PILOT-01` only after
  every preceding active sample, print and Android/iOS native gate is closed.

Always re-read the live Task index before launching because this paragraph may
be older than a later completed Task.

## Execute One Supervised Task

From PowerShell in the Windows checkout:

```powershell
Set-Location C:\bestar-unloading
.\scripts\run-business-agent.cmd install
.\scripts\run-business-agent.cmd develop `
  "prompts/tasks/TASK-FILE.md"
```

The launcher creates a fresh Codex Session for that Task. It automatically
resumes only that Session while actionable work remains. Do not run raw
`codex exec`, manually resume an old Session, or put multiple Task paths into
one prompt. A valid implementation-only terminal result has an empty `tests`
array and lists all unexecuted verification under `external_verification`.

After the supervisor exits:

1. Read `HANDOFF.md`, the accepted terminal status and latest
   `.codex/business-agent-runs/*/state.json`.
2. Review `git status`, the diff and the exact omitted verification list.
3. Do not mark the Task Done or write unexecuted tests/builds as passing.
4. Start a dependent Task in a new supervised Session only when its prerequisite
   evidence exists.

Runtime supervisor history is intentionally ignored by Git. The supervisor
updates the tracked `HANDOFF.md` at startup and after every valid state; the
Task index, completion report, Task file, code, migrations and committed
verification reports remain the authoritative durable evidence behind it.

## Windows Native Archive And Reactivation

The Windows native package route is not in the current execution order. Its
archived files remain in place so the work can be restored without losing
history. Reactivation must be one deliberate change:

1. Obtain an explicit product decision that Windows RNW/MSIX delivery is active again.
2. Remove `Task-Status: ARCHIVED` from P6-MOBILE-09 through P6-MOBILE-13.
3. Restore the Windows acceptance scope in NATIVE-AUTH-01, NATIVE-UX-04/05/06 and CROSS-UX-QA-01.
4. Update the open-task index and completion report from `Archived` to an honest active status.
5. Re-run the supervisor regression, then launch only the first reactivated Task on a capable Windows build host.

Until all five steps are completed, Windows RNW/MSIX work must not start and
must not block Android/iOS or P5 target deployment planning.

## Fresh Interactive Agent Instruction

For inspection or diagnosis before starting a supervised Task, give a new
interactive Agent this instruction:

```text
Do not edit yet. Read AGENTS.md, HANDOFF.md,
.codex/skills/bestar-handoff/SKILL.md, CONTEXT.md,
docs/runbooks/fresh-windows-agent-onboarding.md,
prompts/agents/business-logic-agent.md,
prompts/tasks/OPEN-FUNCTIONS-20260707Task Index.md, and
docs/reports/project-completion-status.html. Inspect git status and the current
machine prerequisites. Treat tracked reports and the selected Task as the
authority; do not rely on conversation memory or repeat completed Tasks.
```

Use the interactive session only for inspection. Execute a tracked development
Task through the supervised launcher.

## Security And Evidence Rules

- Never commit or print passwords, JWTs, refresh tokens, `.env`, private
  certificates or signing passwords.
- Do not inspect secure-store token values to prove persistence; verify behavior
  through restart, expiry, revoke and logout outcomes.
- Use real or explicitly de-identified business files for pilot acceptance.
- Keep generated package paths and SHA-256 hashes in reports; keep package
  binaries and private keys outside Git.
- Preserve original uploads, audit history, PostgreSQL data and `storage/`.
- Every UI change must retain strict English/Chinese i18n management and must
  show one selected language at a time.
