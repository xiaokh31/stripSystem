# Bestar Agent Handoff

> 新会话必须先读 `AGENTS.md` 和本文件，再核对当前 Task、任务索引、完成度报告与 `git status`。本文件用于交接，不替代验收证据。

## 生产故障修复会话（2026-07-30）

- Active work: `UNLOAD-REPORT-04` 部署后的生产 API 启动修复。
- Status: `DONE`；生产 API 启动故障、04 文件槽位和 05 Excel/实际打印外部验收
  均已关闭。
- Actual Git state at session start: `HEAD c3d4a0b`, clean; the older metadata
  below is stale and must not override current runtime evidence.
- Root cause and recovery: one duplicate current `EXCEL_REPORT` group caused
  `20260730010000_current_generated_artifact` to fail with
  `CURRENT_GENERATED_FILE_REPAIR_REQUIRED`; API retries then failed with Prisma
  `P3009`. PostgreSQL had rolled back all DDL. After matched backups and private
  winner review, repair superseded the older verified record, the failed
  migration was resolved as rolled back, and both 04 migrations deployed.
- Production outcome: duplicate current groups are 0; the partial unique index
  and replacement audit table exist; one `VERIFIED_STORAGE_REPAIR` audit exists;
  temporary repair markers are 0; all 38 migrations are up to date.
- Runtime outcome: PostgreSQL, Redis, API, Web, worker and nginx are all healthy.
  `scripts/healthcheck.sh` passed, API logs contain no new `P3009`, `P3018`,
  `CURRENT_GENERATED_FILE_REPAIR_REQUIRED` or error-level startup entries, and
  the browser login page reports API OK/database Up.
- Recovery point retained outside the repository and Docker volumes under the
  operator-approved `C:\bestar-backups`:
  `postgres-bestar_unloading-20260729-235544.sql` and
  `storage-20260729-235546.tar.gz`. Both are non-empty; the SQL dump header,
  storage archive listing and SHA-256 checks passed. Dry-run, apply, candidate
  review and after-state evidence are retained beside them.
- Changed in this session:
  `docs/runbooks/current-generated-artifact-production-repair.md` now documents
  the evidence-gated `prisma migrate resolve --rolled-back` recovery required
  before `migrate deploy`; `HANDOFF.md` records this incident.
- Tests/actions actually run: backup integrity/SHA checks; repair dry-run/apply
  and zero-duplicate after-run; private candidate time/order review; migration
  rollback evidence, resolve/deploy/status; unique index/audit/marker queries;
  Docker health checks, nginx/API/Web/static assets/storage checks; browser
  login-page health inspection; `git diff --check`.
- Remaining implementation: none.
- External verification: completed. On 2026-07-30 the business confirmed the 04
  office current-file check and the 05 Windows/Microsoft Excel, Print Preview,
  Print to PDF and actual-paper checks passed.
- Blockers: none.
- Next action: retain the matched production backups according to policy and
  select the next independently ready Task; do not restart 04 or 05.
- Pitfalls: do not expose production cabinet/file IDs or SHA values, delete
  historical bytes/rows, manually edit `_prisma_migrations`, or discard either
  half of the matched recovery point before office verification.

## 交接元数据

- Generated at: `2026-07-30`
- Source: `production repair and business external-verification closure`
- Task: `UNLOAD-REPORT-05`
- Task file: `prompts/tasks/UNLOAD-REPORT-05Adaptive Primary and White Cell Layout.md`
- Status: `DONE`
- Execution mode: `full`
- Session: `019fb0a9-71ea-7403-833d-c57d3c880774`
- Git HEAD: `c3d4a0b`
- Worktree: dirty; preserve and inspect existing changes
- Local supervisor artifacts: `/Volumes/xfl/logistics/stripSystem/.codex/business-agent-runs/20260730T013521Z-UNLOAD-REPORT-05-39113`

## 现在在做什么

UNLOAD-REPORT-04 and UNLOAD-REPORT-05 are both `DONE`. The production duplicate-current
repair, failed-migration recovery, full-stack health verification and business office
verification are complete. Do not restart either Task.

## 已完成

- 已完成每页 PRIMARY_ONLY/EXPANDED 自适应物理行规划、保存后独立守恒验证、API 安全 evidence、真实 current 8→9→8 与失败保留、专用 package/PDF/PNG runner、逐图检查、全部当前环境 Definition of Done 和办公室 Windows/Microsoft Excel/目标打印机外部验收；Task 04/05、索引、完成度与验证报告已同步为 DONE。
- Reviewed the completed 04 repair implementation. `repair:current-generated-files`
  defaults to dry-run, validates storage containment/readability/SHA/shared paths,
  selects the newest verified candidate, and only writes with explicit `--apply`.
- Executed the production runbook through matched DB/storage backup, dry-run, candidate
  review, apply, migration recovery/deploy, zero-duplicate verification, startup and
  healthcheck. Historical bytes and rows were preserved.

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
- Production repair dry-run found one verified duplicate group; apply succeeded and the
  post-repair dry-run returned `duplicateGroupCount=0`, `findings=[]`.
- The guarded failed migration was proven fully rolled back, resolved with Prisma, and both
  04 migrations deployed. All 38 migrations are up to date; the unique index, formal
  replacement audit and zero temporary markers were verified.
- Production `scripts/healthcheck.sh` passed; all six services are healthy and API startup
  logs contain no new migration/startup errors.
- 2026-07-30 business confirmation closed the 04 current-file and 05 Microsoft
  Excel/Print to PDF/actual-paper external checks.

## 卡在哪里

### Remaining implementation

- No remaining implementation was reported.

### External verification

- 2026-07-30 业务方确认 04 current 文件槽位与 05 Windows/Microsoft Excel、
  8/9/16、Print Preview、Print to PDF、左侧白边、Standards 和实际纸张打印检查
  均通过。

### Blockers

- No blocker was reported.

## 下一步

- Retain the matched `C:\bestar-backups` recovery point according to warehouse policy,
  preserve the current healthy production stack, and select the next independently ready
  Task from the authoritative Task Index.

## 不要再踩的坑

- 只把 test-results/unload-report-05/20260730T022108Z-42114 作为 05 最终成功证据；此前几个 05 run 是视觉门禁调试失败目录。
- 不要直接运行使用默认 Playwright output 的 e2e-web Compose 命令；本 Session 曾因此误删 gitignored 的旧 03/04 本地二进制/截图目录。使用专用 runner 的唯一 artifact directory 或显式隔离输出挂载。
- 旧 03 report-8 连续写入 4..11，不能用于外部签字；必须使用 05 新 current 工件。
- 多页报告第一页 Total 维持既有全局总数、后续页为页小计；05 validator 按该既有合同检查，不要在外部验收时误判为本 Task 新回归。
- UNLOAD-REPORT-04/05 已为 DONE，不要重启开发；后续回归必须继续使用 05 新
  current 工件，不得回用旧 03 `report-8`。
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
