# Bestar Agent Handoff

> 新会话必须先读 `AGENTS.md` 和本文件，再核对当前 Task、任务索引、完成度报告与 `git status`。本文件用于交接，不替代验收证据。

## 交接元数据

- Generated at: `2026-08-01T09:02:51Z`
- Source: `business-task-supervisor`
- Task: `FILE-UPLOAD-01`
- Task file: `prompts/tasks/FILE-UPLOAD-01Unicode Original Filename Integrity Regression.md`
- Status: `DONE`
- Execution mode: `full`
- Session: `019fbc2d-0911-74c2-bc20-9de7fa66e14e`
- Git HEAD: `973f3a1`
- Worktree: dirty; preserve and inspect existing changes
- Local supervisor artifacts: `/Volumes/xfl/logistics/stripSystem/.codex/business-agent-runs/20260801T071455Z-FILE-UPLOAD-01-58229`

## 现在在做什么

FILE-UPLOAD-01 is complete; no implementation or verification remains for this Task.

## 已完成

- 已完成 Unicode 原始文件名完整性修复。卸柜与考勤上传现共用严格 UTF-8 codec，原始传输证据、canonical 显示名和安全存储名分离；历史记录修复 CLI、Prisma migration、安全下载头、双语 Web 提示及真实浏览器回归均已交付。Task、索引和完成报告已同步为 DONE；WAGE-HOURS-08 仅解锁为 READY，未在本 Session 启动。

### Changed files

- .gitignore
- apps/api/package.json
- apps/api/prisma/schema.prisma
- apps/api/prisma/migrations/20260801010000_unicode_upload_filename_evidence/migration.sql
- apps/api/src/common/upload-filename.ts
- apps/api/src/common/upload-filename.spec.ts
- apps/api/src/upload-filenames/repair-upload-filenames.ts
- apps/api/src/attendance/attendance.controller.ts
- apps/api/src/attendance/attendance.service.ts
- apps/api/src/attendance/attendance.service.spec.ts
- apps/api/src/attendance/dto/attendance-response.dto.ts
- apps/api/src/imports/imports.controller.ts
- apps/api/src/imports/imports.service.ts
- apps/api/src/imports/imports.service.spec.ts
- apps/api/src/imports/dto/import-file-response.dto.ts
- apps/api/src/dashboard/dashboard.service.ts
- apps/api/src/parser-learning-cases/parser-learning-cases.controller.ts
- apps/api/src/parser-learning-cases/parser-learning-cases.service.ts
- apps/api/src/reports/reports.controller.ts
- apps/api/src/unloading-summary/unloading-summary.controller.ts
- apps/api/src/unloading-wage/unloading-wage.controller.ts
- apps/api/test/attendance-imports.e2e-spec.ts
- apps/api/test/imports.e2e-spec.ts
- apps/web/e2e/file-upload-unicode.spec.ts
- apps/web/src/components/imports/filename-review-notice.tsx
- apps/web/src/components/imports/import-upload-form.tsx
- apps/web/src/app/imports/page.tsx
- apps/web/src/app/imports/[id]/page.tsx
- apps/web/src/app/work-hours/page.tsx
- apps/web/src/lib/api-client.ts
- apps/web/src/lib/i18n/locales/en.ts
- apps/web/src/lib/i18n/locales/zh.ts
- scripts/run-file-upload-01-e2e.sh
- scripts/verify-file-upload-01-repair.sh
- docs/architecture/04-api-contracts.md
- docs/architecture/06-storage-deployment.md
- docs/runbooks/backup-restore.md
- docs/runbooks/upload-filename-repair.md
- docs/reports/file-upload-01-unicode-filename-verification.md
- docs/reports/project-completion-status.html
- prompts/tasks/FILE-UPLOAD-01Unicode Original Filename Integrity Regression.md
- prompts/tasks/OPEN-FUNCTIONS-20260707Task Index.md

### Tests and verification actually run

- 修复前真实 Chromium/FormData/nginx/API/DB 红灯复现：稳定确认 Busboy 默认 Latin-1 解码根因
- API Docker/Nest production build、lint、typecheck：通过
- API unit：50 suites、403 tests 全部通过
- API E2E：21 suites、131 tests 全部通过
- Web lint、typecheck、Next production build：通过；284/284 unit tests 通过
- Worker：235/235 pytest 通过
- Prisma：39 migrations，database schema up to date
- scripts/run-file-upload-01-e2e.sh verify：真实 multipart→nginx→API→DB→response→DOM、双语、dark、390/1366、真实 200% zoom、故意失败 cleanup 探针全部通过
- scripts/verify-file-upload-01-repair.sh：dry-run 无写入、缺少备份拒绝、apply=1、源 SHA 不变、second apply=0、隔离清理全部通过
- Docker full-stack build/healthcheck：通过
- 下载头全仓扫描及 parser-learning 下载 E2E：通过
- bash syntax 与 git diff --check：通过
- 最终数据库、存储和临时目录残留：全部为 0；两份受控源文件 SHA 与固定期望值一致

## 卡在哪里

### Remaining implementation

- No remaining implementation was reported.

### External verification

- No external verification was reported.

### Blockers

- No blocker was reported.

## 下一步

- 监督器接收 DONE 并自动写入 HANDOFF.md；后续如需继续，应使用新的 supervisor Session 执行 WAGE-HOURS-08。

## 不要再踩的坑

- 不得恢复 Multer/Busboy 默认 Latin-1 行为，也不得在前端做猜测性或二次解码。
- 生产修复 CLI 的 JSON 应直接调用构建后的 Node 入口；pnpm 包装日志会污染重定向结果，apply 必须提供匹配的 PostgreSQL 与 storage 备份 manifest。
- 新增 architecture/runbook/report 必须加入根 .gitignore 的精确 allowlist，否则交付文件不会出现在工作树状态中。
- 若在运行中的 Web 容器内执行 pnpm build 改写 .next，必须重启 Web/nginx 后再判断 healthcheck。
- 异常中断后必须同时检查专项 users、auth audit、native sessions、roles、imports、attendance records 和 storage；不能只检查上传记录。
- WAGE-HOURS-08 必须由新的 supervisor Session 执行，并继续保护真实考勤样本隐私。

## 新会话启动清单

1. Read `AGENTS.md` and `.codex/skills/bestar-handoff/SKILL.md`.
2. Run `git status --short`; preserve all existing changes.
3. Read the Task file above plus `prompts/tasks/OPEN-FUNCTIONS-20260707Task Index.md` and `docs/reports/project-completion-status.html`.
4. Verify this handoff against code, tests, runtime state, and artifacts before acting.
5. Do not execute any Task marked `Task-Status: ARCHIVED`.

## 权威参考

- `prompts/tasks/FILE-UPLOAD-01Unicode Original Filename Integrity Regression.md`
- `prompts/tasks/OPEN-FUNCTIONS-20260707Task Index.md`
- `docs/reports/project-completion-status.html`
- `docs/runbooks/business-agent-execution.md`
