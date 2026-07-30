# Bestar Agent Handoff

> 新会话必须先读 `AGENTS.md` 和本文件，再核对当前 Task、任务索引、完成度报告与 `git status`。本文件用于交接，不替代验收证据。

## 交接元数据

- Generated at: `2026-07-30T03:30:10Z`
- Source: `product-planning-agent follow-up after business-task-supervisor`
- Task: `UNLOAD-REPORT-05`
- Task file: `prompts/tasks/UNLOAD-REPORT-05Adaptive Primary and White Cell Layout.md`
- Status: `CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING`
- Execution mode: `full`
- Session: `019fb0a9-71ea-7403-833d-c57d3c880774`
- Git HEAD: `33e12fd`
- Worktree: dirty; preserve and inspect existing changes
- Local supervisor artifacts: `/Volumes/xfl/logistics/stripSystem/.codex/business-agent-runs/20260730T013521Z-UNLOAD-REPORT-05-39113`

## 现在在做什么

UNLOAD-REPORT-05 repository work is complete; only the named external verification remains.
The production duplicate-current cleanup procedure is documented but has not been run
against any production environment in this Session.

The post-deploy production API startup incident is under read-only diagnosis. The same
commit `acd8e55` starts successfully in the local Docker full stack, while the new
`20260730010000_current_generated_artifact` migration intentionally aborts with
`CURRENT_GENERATED_FILE_REPAIR_REQUIRED` when historical duplicate current report/label
rows exist. Production logs and read-only duplicate counts have not yet been supplied, so
this is the leading diagnosis rather than a production-confirmed root cause.

The operator later reported running host `corepack use pnpm@11.18.0` and restoring the
production `package.json`, followed by a package permission error. This creates an earlier
possible failure boundary: if Docker build cannot read the host build context, migration
has not run yet. The tracked baseline is clean and pins `pnpm@11.9.0`; locally
`package.json`, `pnpm-lock.yaml`, and `pnpm-workspace.yaml` are mode 0644 and owned by the
repository user. Production ownership/mode, parent-directory traversal permissions and the
exact error have not yet been supplied.

An isolated disposable PostgreSQL reproduction confirmed the exact startup path:
the first deploy fails with `P3018` / SQLSTATE `23505` /
`CURRENT_GENERATED_FILE_REPAIR_REQUIRED`, and a retry fails with `P3009` because Prisma
records the migration as failed. PostgreSQL rolled back the migration DDL. Recovery in the
disposable database required duplicate convergence, then
`prisma migrate resolve --rolled-back 20260730010000_current_generated_artifact`, then
`prisma migrate deploy`. The temporary databases were removed after the checks.

## 已完成

- 已完成每页 PRIMARY_ONLY/EXPANDED 自适应物理行规划、保存后独立守恒验证、API 安全 evidence、真实 current 8→9→8 与失败保留、专用 package/PDF/PNG runner、逐图检查及全部当前环境 Definition of Done；Task 03/04/05、索引、完成度与验证报告已同步。唯一剩余项是办公室 Windows/Microsoft Excel 和目标打印机验收。
- Reviewed the completed 04 repair implementation. `repair:current-generated-files`
  defaults to dry-run, validates storage containment/readability/SHA/shared paths,
  selects the newest verified candidate, and only writes with explicit `--apply`.
- Added a production runbook covering maintenance mode, matched DB/storage backup,
  dry-run, candidate review, apply, migration, zero-duplicate verification, startup and
  rollback. No production database or storage was accessed or modified.

### Changed files

- apps/worker-python/src/worker_python/reports/cell_map.py
- apps/worker-python/src/worker_python/reports/excel_report_writer.py
- apps/worker-python/tests/unit/test_excel_report_writer.py
- apps/worker-python/tests/fixtures/generate_report_05_visual_workbooks.py
- apps/api/src/reports/dto/generated-file-response.dto.ts
- apps/api/src/reports/reports.service.ts
- apps/api/src/reports/reports.service.spec.ts
- apps/api/src/reports/worker-report.service.ts
- apps/web/e2e/report-package-inspector.py
- apps/web/e2e/unload-report-rich-text.spec.ts
- apps/web/e2e/adaptive-report-layout.spec.ts
- scripts/render-unload-report-03-visual.sh
- scripts/verify-unload-report-02.sh
- scripts/verify-unload-report-05.sh
- infra/docker/compose.local.yml
- docs/reports/unload-report-05-adaptive-primary-white-layout-verification.md
- docs/reports/unload-report-03-print-margin-destination-preservation-verification.md
- docs/reports/unload-report-04-current-artifact-replacement-verification.md
- docs/reports/project-completion-status.html
- docs/runbooks/backup-restore.md
- docs/runbooks/current-generated-artifact-production-repair.md
- prompts/tasks/UNLOAD-REPORT-03Print Margin and Destination Preservation Regression.md
- prompts/tasks/UNLOAD-REPORT-04Current Report and Label Replacement Regression.md
- prompts/tasks/UNLOAD-REPORT-05Adaptive Primary and White Cell Layout.md
- prompts/tasks/OPEN-FUNCTIONS-20260707Task Index.md
- HANDOFF.md

### Tests and verification actually run

- scripts/verify-unload-report-05.sh：通过；最终制品 test-results/unload-report-05/20260730T022108Z-42114
- Worker 报告专项：57 passed；Worker 全量：235 passed
- API lint/typecheck/build：通过；49 suites / 388 unit tests passed；21 suites / 129 E2E tests passed
- Web lint/typecheck/build：通过；284 tests passed（含 catalog parity、stable-code mapping 与 unmanaged-string i18n 门禁）
- Prisma migrate status：38 migrations found，Database schema is up to date；05 无 schema migration
- 真实 nginx/API/BullMQ/Chromium current 8→9→8、layout review 失败保留、守恒失败保留和故意失败 cleanup：通过
- LibreOffice/PDF/PNG/OCR/几何：36 张非模板生成页均为 A4 landscape，左侧 whitespace 相对模板 22.225mm 的 delta 全为 0.0mm
- 原尺寸人工视觉检查：模板、8、9、16、17、24、25、真实 API 8/9 共 24 张 full-page/destination-table PNG 通过
- 模板 SHA-256 before/after 一致：31a613e86a76447bfcbb308f1a23f6072dd1a5381f1992fbc0757a2735c92027
- scripts/healthcheck.sh：通过；git diff --check：通过；专用 runner storage/generated-files 精确恢复且 residual 为 0
- This follow-up changed documentation only. No application test, migration, repair
  `--apply`, production command or external print check was run.
- Read-only local validation of the runbook SQL returned 0 duplicate rows.
- Docker one-off repair dry-run completed with `apply=false`,
  `duplicateGroupCount=0`, `findings=[]`; no write mode was used.
- Read-only incident checks on commit `acd8e55` found the local API healthy, 0 duplicate
  current artifact groups, 0 unsuccessful migration rows, 38 migrations up to date, and
  `/api/health` returning OK. No source file, production database, migration record or
  storage artifact was changed during the incident diagnosis.
- An isolated migration reproduction went red deterministically with `P3018`, then `P3009`
  on retry, and went green after simulated duplicate convergence plus `migrate resolve
  --rolled-back` and `migrate deploy`. One final diagnostic inspection query had a quoting
  error after the successful migration; it did not affect the result, and the disposable
  database cleanup still ran.
- Verified the tracked package-manager baseline without running host package tooling:
  root `package.json` has no diff, pins `pnpm@11.9.0`, and all API/Web Dockerfiles prepare
  pnpm 11.9.0 inside their images.

## 卡在哪里

### Remaining implementation

- No remaining implementation was reported.
- No incident fix is authorized or justified until the production API log identifies the
  failing startup stage.

### External verification

- 在办公室 Windows/Microsoft Excel 从唯一 current slot 打开 8 条报告，确认只使用深色主行且白色追加行空白可编辑；重新生成 9 条并确认同一 slot 被替换、顺序为 1–9。
- 用 16 条 current 报告核对一 worksheet/一张 A4 landscape、逐目的仓/PLT/CTN/total、Standards、左侧白边、Print Preview 和 Microsoft Print to PDF。
- 在办公室目标打印机实际纸张打印并签字；不得 AutoFit 或手动修改 margin、scale、print area、fill、row mapping。

### Blockers

- No blocker was reported.
- Production repair requires access to the production Docker host and an operator-approved
  winner for every duplicate group. These were not available or requested for execution.
- Production API logs and read-only duplicate/migration status are not accessible from
  this workspace, so the leading migration diagnosis cannot yet be confirmed against the
  failing host.
- Production `stat`/`namei`, Git diff and Docker build output are required to determine
  whether the current failure occurs before migration because `package.json` or a parent
  directory is unreadable.

## 下一步

- On the production host, capture `docker compose -f infra/docker/compose.local.yml
  build --progress=plain api` output and
  `docker compose -f infra/docker/compose.local.yml logs --no-color --tail=200 api`.
  First verify exact ownership/mode and parent-directory traversal permissions for
  `package.json`; do not use host pnpm/corepack as a probe. If the API log contains
  `CURRENT_GENERATED_FILE_REPAIR_REQUIRED`, follow
  `docs/runbooks/current-generated-artifact-production-repair.md` through matched
  DB/storage backup and dry-run only; review every proposed winner before deciding whether
  to run `--apply`. If Prisma has already recorded the failed migration, the reviewed
  recovery must also resolve
  `20260730010000_current_generated_artifact` as rolled back before retrying deploy; the
  current runbook does not yet document that required step.

## 不要再踩的坑

- 只把 test-results/unload-report-05/20260730T022108Z-42114 作为 05 最终成功证据；此前几个 05 run 是视觉门禁调试失败目录。
- 不要直接运行使用默认 Playwright output 的 e2e-web Compose 命令；本 Session 曾因此误删 gitignored 的旧 03/04 本地二进制/截图目录。使用专用 runner 的唯一 artifact directory 或显式隔离输出挂载。
- 旧 03 report-8 连续写入 4..11，不能用于外部签字；必须使用 05 新 current 工件。
- 多页报告第一页 Total 维持既有全局总数、后续页为页小计；05 validator 按该既有合同检查，不要在外部验收时误判为本 Task 新回归。
- 不要重启 UNLOAD-REPORT-05 开发或标记 DONE；Microsoft Excel、Print to PDF 和实际纸张签字通过前只能保持 CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING。
- `repair:current-generated-files --apply` processes every duplicate group in the dry-run,
  not just one container. Stop if any proposed winner is unapproved.
- Stop on `NO_VERIFIABLE_CURRENT_ARTIFACT`, invalid/shared paths or SHA mismatch. The
  current tool cannot explicitly select an older winner.
- Cleanup means status convergence and removal from the office current view. Do not
  physically delete superseded bytes or generated-file rows; they remain audit evidence.
- Do not repeatedly restart the failing API, manually edit `_prisma_migrations`, delete
  duplicate rows, or run repair `--apply` before matched backups and per-group winner
  review. A `P1000`, `P1001` or `P3009` production log would require a different recovery
  path from the duplicate-current repair.
- Do not run `prisma migrate resolve --rolled-back` speculatively. First confirm the exact
  failed migration from production logs/status and confirm its DDL was rolled back; use the
  Prisma command rather than editing `_prisma_migrations` manually.
- Do not fix one unreadable file with `chmod -R 777`, recursive `chown`, `sudo pnpm`, or
  another host `corepack use`. Inspect the exact file and parent path first, then repair
  only the proven ownership/mode boundary and return to Docker-only builds.

## 新会话启动清单

1. Read `AGENTS.md` and `.codex/skills/bestar-handoff/SKILL.md`.
2. Run `git status --short`; preserve all existing changes.
3. Read the Task file above plus `prompts/tasks/OPEN-FUNCTIONS-20260707Task Index.md` and `docs/reports/project-completion-status.html`.
4. Verify this handoff against code, tests, runtime state, and artifacts before acting.
5. Do not execute any Task marked `Task-Status: ARCHIVED`.

## 权威参考

- `prompts/tasks/UNLOAD-REPORT-05Adaptive Primary and White Cell Layout.md`
- `prompts/tasks/OPEN-FUNCTIONS-20260707Task Index.md`
- `docs/reports/project-completion-status.html`
- `docs/runbooks/current-generated-artifact-production-repair.md`
- `docs/runbooks/backup-restore.md`
- `docs/runbooks/business-agent-execution.md`
