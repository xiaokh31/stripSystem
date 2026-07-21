# Bestar Agent Handoff

> 新会话必须先读 `AGENTS.md` 和本文件，再核对当前 Task、任务索引、完成度报告与 `git status`。本文件用于交接，不替代验收证据。

## 交接元数据

- Generated at: `2026-07-20T17:34:59Z`
- Source: `business-task-supervisor`
- Task: `PARSER-PROFILE-07`
- Task file: `prompts/tasks/PARSER-PROFILE-07Trusted Auto Parse Drift and Fallback Integration.md`
- Status: `DONE`
- Execution mode: `full`
- Session: `019f8064-2918-7943-802b-bb2d5a62cad8`
- Git HEAD: `b75cda9`
- Worktree: dirty; preserve and inspect existing changes
- Local supervisor artifacts: `/Volumes/xfl/logistics/stripSystem/.codex/business-agent-runs/20260720T163754Z-PARSER-PROFILE-07-57048`

## 现在在做什么

PARSER-PROFILE-07 is complete; no implementation or verification remains for this Task.

## 已完成

- 已完成可信 profile 自动解析主链路、事务内状态复核、collision/drift/fallback、material correction 信任撤销、双语来源面板、迁移、文档和全部当前环境验收。未启动下一 Task。

### Changed files

- .gitignore
- HANDOFF.md
- apps/api/prisma/schema.prisma
- apps/api/prisma/migrations/20260720180000_parser_profile_trusted_auto_parse/migration.sql
- apps/api/src/corrections/corrections.service.spec.ts
- apps/api/src/corrections/corrections.service.ts
- apps/api/src/imports/dto/import-file-response.dto.ts
- apps/api/src/imports/imports.service.spec.ts
- apps/api/src/imports/imports.service.ts
- apps/api/src/parser-learning-cases/parser-learning-cases.service.ts
- apps/api/src/parser-profiles/parser-profile-reviews.service.spec.ts
- apps/api/src/parser-profiles/parser-profile-reviews.service.ts
- apps/api/test/parser-profile-reviews.e2e-spec.ts
- apps/web/e2e/parser-profile-review.spec.ts
- apps/web/src/app/imports/[id]/page.tsx
- apps/web/src/components/imports/parser-selection-panel.tsx
- apps/web/src/lib/api-client.ts
- apps/web/src/lib/i18n/locales/en.ts
- apps/web/src/lib/i18n/locales/zh.ts
- apps/web/src/lib/i18n/status-labels.ts
- apps/web/tests/parser-profile-contract.test.ts
- apps/worker-python/src/worker_python/parser_profiles/fingerprint.py
- apps/worker-python/tests/integration/test_parser_profile_real_fixtures.py
- apps/worker-python/tests/unit/test_parser_profile_fingerprint.py
- docs/architecture/02-data-model.md
- docs/architecture/04-api-contracts.md
- docs/product/04-adaptive-parser-profiles.md
- docs/reports/parser-profile-07-trusted-auto-parse-verification.md
- docs/reports/project-completion-status.html
- prompts/tasks/OPEN-FUNCTIONS-20260707Task Index.md

### Tests and verification actually run

- API Docker production build：通过
- API lint/typecheck：通过
- API unit：41 suites、327 tests 全部通过
- API trusted-profile real-fixture E2E：2 tests 通过
- API full E2E：21 suites、121 tests 全部通过
- Worker profile subset：16 tests 通过；性能 0.46 秒，低于 2.5 秒预算
- Worker full：173 tests 全部通过
- Web Docker production build、lint、typecheck：通过
- Web unit/i18n：246 tests 全部通过
- Docker Chromium：1 test 通过；覆盖 EN light desktop、ZH dark mobile、SSR locale refresh、200% zoom 和无横向溢出
- Prisma：32 migrations，数据库 schema 已是最新
- PostgreSQL EXPLAIN：candidate query 使用 lifecycle/trust 索引并限制 100 条
- Full-stack health：nginx、API、Web、Worker、PostgreSQL、Redis 全部 healthy；队列无等待、活动、延迟或失败任务
- git diff --check 及新增文件空白检查：通过

## 卡在哪里

### Remaining implementation

- No remaining implementation was reported.

### External verification

- No external verification was reported.

### Blockers

- No blocker was reported.

## 下一步

- 仅在新的 supervised Session 中执行 PARSER-PROFILE-08 Golden Sample Full Stack I18n Exit Gate。

## 不要再踩的坑

- 同一容器内不要并行启动多个 pnpm 依赖状态检查，否则可能竞争 node_modules 软链接并产生非代码 ENOENT；应串行执行。
- Compose 镜像内置源码；修改源码后必须 rebuild 并 recreate 对应容器，避免验证旧代码。
- collision/drift audit 可能没有 profileVersionId，测试清理不能只依赖 profile version。
- trusted commit 的事务内 exact-version lifecycle、trust、revision、matcher 和 mapping 复核不可删减。
- 不要对全仓执行 Prettier --write；仓库仍有历史格式告警，应只格式化当前 Task 文件。

## 新会话启动清单

1. Read `AGENTS.md` and `.codex/skills/bestar-handoff/SKILL.md`.
2. Run `git status --short`; preserve all existing changes.
3. Read the Task file above plus `prompts/tasks/OPEN-FUNCTIONS-20260707Task Index.md` and `docs/reports/project-completion-status.html`.
4. Verify this handoff against code, tests, runtime state, and artifacts before acting.
5. Do not execute any Task marked `Task-Status: ARCHIVED`.

## 权威参考

- `prompts/tasks/PARSER-PROFILE-07Trusted Auto Parse Drift and Fallback Integration.md`
- `prompts/tasks/OPEN-FUNCTIONS-20260707Task Index.md`
- `docs/reports/project-completion-status.html`
- `docs/runbooks/business-agent-execution.md`
