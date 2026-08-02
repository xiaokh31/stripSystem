# Bestar Agent Handoff

> 新会话必须先读 `AGENTS.md` 和本文件，再核对当前 Task、任务索引、完成度报告与 `git status`。本文件用于交接，不替代验收证据。

## 交接元数据

- Generated at: `2026-08-02T05:13:14Z`
- Source: `business-task-supervisor`
- Task: `WAGE-HOURS-08`
- Task file: `prompts/tasks/WAGE-HOURS-08Parsed Attendance Wage Workbook Generation Regression.md`
- Status: `CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING`
- Execution mode: `full`
- Session: `019fc0aa-55dd-7923-8dd2-2787dd939047`
- Git HEAD: `319a708`
- Worktree: dirty; preserve and inspect existing changes
- Local supervisor artifacts: `/Volumes/xfl/logistics/stripSystem/.codex/business-agent-runs/20260802T041014Z-WAGE-HOURS-08-78494`

## 现在在做什么

WAGE-HOURS-08 repository work is complete; only the named external verification remains.

## 已完成

- 仓库实现、迁移判断、Docker 自动化、真实 7 月全栈流程、BIFF/LibreOffice 视觉检查、隐私与清理门禁均已完成。续跑核对确认六个服务 healthy，API/Worker 模板 preflight 均返回批准版本和 SHA，专用数据库、storage、runtime 残留均为 0。当前仅剩 Windows Microsoft Excel 外部验收；未启动其他 Task。

### Changed files

- .env.example
- HANDOFF.md
- apps/api/src/config/app.config.spec.ts
- apps/api/src/config/app.config.ts
- apps/api/test/attendance-imports.e2e-spec.ts
- apps/web/src/components/wage/attendance-flow.ts
- apps/web/src/lib/i18n/locales/en.ts
- apps/web/src/lib/i18n/locales/zh.ts
- apps/web/tests/wage-flow.test.ts
- apps/worker-python/src/worker_python/cli.py
- apps/worker-python/src/worker_python/wage/generator.py
- apps/worker-python/src/worker_python/wage/legacy_xls.py
- apps/worker-python/src/worker_python/wage/template.py
- apps/worker-python/templates/wage/bestar-wage-template-v1.xls
- apps/worker-python/templates/wage/bestar-wage-template-v1.json
- apps/worker-python/tests/fixtures/generate_wage_hours_08_visual_workbooks.py
- apps/worker-python/tests/integration/test_wage_api_cli.py
- apps/worker-python/tests/integration/test_wage_p0_cli.py
- apps/worker-python/tests/unit/test_fixtures.py
- apps/worker-python/tests/unit/test_wage_attendance.py
- apps/worker-python/tests/unit/test_wage_generation_regression.py
- apps/worker-python/tests/unit/test_wage_generator_formatting.py
- apps/worker-python/tests/unit/test_wage_template.py
- docs/architecture/06-storage-deployment.md
- docs/fixtures.md
- docs/product/02-work-hours-and-unloading-wage-settlement.md
- docs/reports/project-completion-status.html
- docs/reports/wage-hours-08-generation-regression-verification.md
- docs/runbooks/deploy-linux.md
- docs/runbooks/deploy-windows.md
- docs/runbooks/local-deployment.md
- docs/runbooks/production-deployment-beginner-guide.md
- docs/runbooks/work-hours-settlement-regression.md
- infra/docker/api.Dockerfile
- infra/docker/compose.local.yml
- infra/docker/worker-python.Dockerfile
- prompts/tasks/OPEN-FUNCTIONS-20260707Task Index.md
- prompts/tasks/WAGE-HOURS-08Parsed Attendance Wage Workbook Generation Regression.md
- scripts/audit-wage-hours-08-workbook.py
- scripts/render-wage-hours-08-visual.sh
- scripts/run-wage-hours-08-e2e.sh
- scripts/verify-wage-template-supply.sh

### Tests and verification actually run

- scripts/run-wage-hours-08-e2e.sh verify：通过 clean tracked 镜像供应、故意失败 cleanup、真实 nginx/BullMQ/Chromium upload→Parse→Generate→list→download、BIFF、隐私和零残留门禁
- Worker Ruff：通过；pytest 243/243 通过
- API lint/typecheck：通过；51 suites / 409 unit tests、21 suites / 131 E2E tests 通过
- Prisma migrate status：39 migrations，schema up to date；本 Task 无需 migration
- Web lint/typecheck：通过；285/285 tests 和 Next.js production build 通过
- LibreOffice：模板、6 月和 7 月各 17 Sheets/50 页，样式差异 0；联系表及 24 张原分辨率高信号页面已检查
- 续跑容器检查：API、Web、Worker、nginx、PostgreSQL、Redis 全部 healthy
- API 与 Worker canonical wage-template-preflight：均返回 status OK、bestar-wage-template-v1 和批准 SHA
- 持久化残留检查：专用 users/imports/rows/files/jobs、最近 storage 和 runtime 均为 0
- scripts/healthcheck.sh：通过
- git diff --check：通过

## 卡在哪里

### Remaining implementation

- No remaining implementation was reported.

### External verification

- 在 Windows Microsoft Excel 中通过真实 /work-hours 受保护流程重新上传已批准的同一份 7 月样本，执行 Parse、Generate 并下载工资工作簿。
- 检查所有员工 Sheet 的日期、工时、颜色、行高、列宽、Print Preview 和下载文件名。

### Blockers

- No blocker was reported.

## 下一步

- 由办公室在 Windows Microsoft Excel 执行上述唯一外部验收。

## 不要再踩的坑

- 不得把历史工资成品重新作为运行时模板；它只能作为只读结构参考。
- 模板容量超过 16 名员工必须 fail closed，不能静默丢失员工。
- 不得在日志、截图、报告或 HANDOFF 中记录真实员工姓名、Sheet 名或打卡数据。
- 容器内模板检查应使用 unloading-worker wage-template-preflight，不要假设存在 wage-worker 命令别名。
- WAGE-HOURS-08 外部验收完成前不得启动 PUBLIC-DEPLOY-04。

## 新会话启动清单

1. Read `AGENTS.md` and `.codex/skills/bestar-handoff/SKILL.md`.
2. Run `git status --short`; preserve all existing changes.
3. Read the Task file above plus `prompts/tasks/OPEN-FUNCTIONS-20260707Task Index.md` and `docs/reports/project-completion-status.html`.
4. Verify this handoff against code, tests, runtime state, and artifacts before acting.
5. Do not execute any Task marked `Task-Status: ARCHIVED`.

## 权威参考

- `prompts/tasks/WAGE-HOURS-08Parsed Attendance Wage Workbook Generation Regression.md`
- `prompts/tasks/OPEN-FUNCTIONS-20260707Task Index.md`
- `docs/reports/project-completion-status.html`
- `docs/runbooks/business-agent-execution.md`
