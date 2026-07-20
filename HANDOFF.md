# Bestar Agent Handoff

> 新会话必须先读 `AGENTS.md` 和本文件，再核对当前 Task、任务索引、完成度报告与 `git status`。本文件用于交接，不替代验收证据。

## 交接元数据

- Generated at: `2026-07-20T07:33:39Z`
- Source: `business-task-supervisor`
- Task: `PARSER-PROFILE-06`
- Task file: `prompts/tasks/PARSER-PROFILE-06Review Mode Evidence and Three Acceptance Trust Gate.md`
- Status: `DONE`
- Execution mode: `full`
- Session: `019f7e50-e3a3-7f00-9df5-758e11f8212a`
- Git HEAD: `bbaa638`
- Worktree: dirty; preserve and inspect existing changes
- Local supervisor artifacts: `/Volumes/xfl/logistics/stripSystem/.codex/business-agent-runs/20260720T065737Z-PARSER-PROFILE-06-43712`

## 现在在做什么

PARSER-PROFILE-06 is complete; no implementation or verification remains for this Task.

## 已完成

- 已完成 PARSER-PROFILE-06 全部实现与 post-DONE remediation：强制 staged review 边界、服务端 material classifier、不可变 staged/final 快照、accept/correct/reject 审计、distinct-SHA 1/3–3/3 信任提升、并发幂等、RBAC、双语 UI、SSR/hydration、真实浏览器 200% zoom，以及任务索引和验证报告更新。未启动 PARSER-PROFILE-07。

### Changed files

- .gitignore
- HANDOFF.md
- apps/api/package.json
- apps/api/prisma/schema.prisma
- apps/api/prisma/migrations/20260720010000_parser_profile_review_trust_gate/migration.sql
- apps/api/prisma/migrations/20260720020000_parser_profile_review_remediation/migration.sql
- apps/api/src/imports/imports.module.ts
- apps/api/src/imports/imports.service.spec.ts
- apps/api/src/imports/imports.service.ts
- apps/api/src/parser-learning-cases/parser-learning-cases.module.ts
- apps/api/src/parser-learning-cases/parser-learning-cases.service.spec.ts
- apps/api/src/parser-learning-cases/parser-learning-cases.service.ts
- apps/api/src/parser-learning-cases/parser-profile-worker.service.ts
- apps/api/src/parser-profiles/dto/parser-profile-review.dto.ts
- apps/api/src/parser-profiles/parser-profile-material.spec.ts
- apps/api/src/parser-profiles/parser-profile-material.ts
- apps/api/src/parser-profiles/parser-profile-reviews.controller.spec.ts
- apps/api/src/parser-profiles/parser-profile-reviews.controller.ts
- apps/api/src/parser-profiles/parser-profile-reviews.service.spec.ts
- apps/api/src/parser-profiles/parser-profile-reviews.service.ts
- apps/api/src/parser-profiles/parser-profiles.module.ts
- apps/api/src/parser-profiles/parser-profiles.service.ts
- apps/api/test/imports.e2e-spec.ts
- apps/api/test/parser-profile-reviews.e2e-spec.ts
- apps/web/e2e/parser-profile-review.spec.ts
- apps/web/src/app/imports/[id]/page.tsx
- apps/web/src/components/parser-profiles/parser-profile-governance.tsx
- apps/web/src/components/parser-profiles/parser-profile-review-labels.ts
- apps/web/src/components/parser-profiles/parser-profile-review-panel.tsx
- apps/web/src/lib/api-client.ts
- apps/web/src/lib/i18n/locales/en.ts
- apps/web/src/lib/i18n/locales/zh.ts
- apps/web/src/lib/permissions.ts
- apps/web/tests/api-client-parser-profile-review.test.ts
- apps/web/tests/parser-profile-review.test.ts
- apps/worker-python/src/worker_python/cli.py
- apps/worker-python/tests/integration/test_parser_profile_cli_contract.py
- docs/architecture/02-data-model.md
- docs/architecture/04-api-contracts.md
- docs/reports/parser-profile-06-review-trust-verification.md
- docs/reports/project-completion-status.html
- prompts/tasks/OPEN-FUNCTIONS-20260707Task Index.md

### Tests and verification actually run

- API 最终聚焦回归：4 suites / 30 tests passed
- API 全量单元测试：41 suites / 319 tests passed
- API lint、TypeScript typecheck、production build：通过
- 真实工作簿 Parser Profile E2E：1/1 passed；覆盖 5 个 distinct SHA、RBAC、修正清零、并发幂等和 3/3 TRUSTED
- Imports 真实 fixture 回归：16/16 passed；相关 attendance 测试 3/3 passed
- Web 全量单元测试：245/245 passed
- Web lint、TypeScript typecheck、production build：通过
- Worker 聚焦契约：2/2 passed；全量 pytest：172/172 passed
- 空 PostgreSQL 数据库迁移：31/31 applied；final_* 字段核验通过
- 当前运行数据库迁移状态：31 migrations，schema up to date
- Playwright Chromium：1/1 passed；覆盖双语 SSR/hydration、主题、mobile、timeline 和真实 200% zoom
- Docker 全栈 healthcheck：通过
- git diff --check：通过
- 临时验证数据库清理核对：残留数量 0

## 卡在哪里

### Remaining implementation

- No remaining implementation was reported.

### External verification

- No external verification was reported.

### Blockers

- No blocker was reported.

## 下一步

- 由监督器写入终态 HANDOFF.md；后续仅在新的受监督会话中执行 PARSER-PROFILE-07。

## 不要再踩的坑

- 不要改写已应用的 20260720010000 迁移；补救内容必须保留在后续 additive migration。
- staged canonical/provenance/warning/error 是不可变证据；修正后的正式结果只能写入 final_* 字段。
- 含 parser errors 的 review 必须阻止 accept/correct，不能静默清零错误或生成正式数据。
- TRUSTED profile 的自动提交、漂移与 fallback 属于 PARSER-PROFILE-07，本任务不得提前实现。
- 生产 API 容器中检查 Prisma 状态应使用 `pnpm --filter api exec prisma`，根目录 `pnpm exec prisma` 找不到工具。

## 新会话启动清单

1. Read `AGENTS.md` and `.codex/skills/bestar-handoff/SKILL.md`.
2. Run `git status --short`; preserve all existing changes.
3. Read the Task file above plus `prompts/tasks/OPEN-FUNCTIONS-20260707Task Index.md` and `docs/reports/project-completion-status.html`.
4. Verify this handoff against code, tests, runtime state, and artifacts before acting.
5. Do not execute any Task marked `Task-Status: ARCHIVED`.

## 权威参考

- `prompts/tasks/PARSER-PROFILE-06Review Mode Evidence and Three Acceptance Trust Gate.md`
- `prompts/tasks/OPEN-FUNCTIONS-20260707Task Index.md`
- `docs/reports/project-completion-status.html`
- `docs/runbooks/business-agent-execution.md`
