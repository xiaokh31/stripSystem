# Bestar Agent Handoff

> 新会话必须先读 `AGENTS.md` 和本文件，再核对当前 Task、任务索引、完成度报告与 `git status`。本文件用于交接，不替代验收证据。

## 交接元数据

- Generated at: `2026-07-21T02:02:51Z`
- Source: `business-task-supervisor`
- Task: `PARSER-PROFILE-08`
- Task file: `prompts/tasks/PARSER-PROFILE-08Golden Sample Full Stack I18n Exit Gate.md`
- Status: `CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING`
- Execution mode: `full`
- Session: `019f8241-1936-7162-ab8e-cfde13b6a73d`
- Git HEAD: `e607f34`
- Worktree: dirty; preserve and inspect existing changes
- Local supervisor artifacts: `/Volumes/xfl/logistics/stripSystem/.codex/business-agent-runs/20260721T011851Z-PARSER-PROFILE-08-69284`

## 现在在做什么

PARSER-PROFILE-08 repository work is complete; only the named external verification remains.

## 已完成

- PARSER-PROFILE-08 的仓库实现、Docker 全量验证、浏览器/i18n/视觉门禁、性能与索引证据、精确测试数据清理及状态文档均已完成。未发现满足验收条件的四组同版式客户 golden pair，因此未伪造 TRUSTED 或业务签字，任务保持外部数据门禁待验。监督器将依据本结构化结果更新 HANDOFF.md。

### Changed files

- .gitignore
- HANDOFF.md
- apps/web/e2e/parser-learning-wizard.spec.ts
- docs/reports/parser-profile-08-golden-sample-full-stack-verification.md
- docs/runbooks/parser-profile-operations.md
- docs/reports/project-completion-status.html
- prompts/tasks/OPEN-FUNCTIONS-20260707Task Index.md

### Tests and verification actually run

- API lint、typecheck 通过；unit 41 suites / 327 tests 通过；full E2E 21 suites / 121 tests 通过
- API parser-profile 聚焦 unit 6 suites / 93 tests、真实工作簿聚焦 E2E 2 suites / 5 tests 通过
- Worker 全量 173 tests、parser-profile 聚焦 46 tests、真实 fixture 性能测试 4 tests 通过
- Web lint、typecheck 通过；unit/i18n 246 tests 通过
- API、Web、Worker production Docker builds 通过
- Docker Chromium parser learning/governance/review 聚焦门禁通过；最新精确清理版本的 Chromium journey 通过
- Prisma 32 migrations，数据库 schema up to date
- PostgreSQL 候选查询命中 parser_profile_versions_lifecycle_trust_state_idx，执行 0.165ms；100-candidate Worker 测试 2.34s
- scripts/healthcheck.sh 通过；六项服务健康；队列 waiting/active/delayed/failed 均为 0
- 报告模板 SHA-256 保持 31a613e86a76447bfcbb308f1a23f6072dd1a5381f1992fbc0757a2735c92027；samples 无 Task 差异；git diff --check 通过

## 卡在哪里

### Remaining implementation

- No remaining implementation was reported.

### External verification

- 提供同一新客户布局的 Pair A-D：四份不同 SHA 的真实或明确脱敏原始工作簿、canonical mapping/completion snapshot、最终拆柜报告、预期目的仓/箱数/体积/柜号/托盘结果及版式差异说明
- 提供脱敏审批角色与日期：Pair A 初次明确批准，以及 Pair B/C/D 三次连续无实质修正复核签字，证明 0/3→1/3→2/3→3/3→TRUSTED
- 如可提供第五份同版式客户工作簿，完成人工确认 trusted auto-parse、报告输出及持久化下游结果；现有 fixture 只能证明自动化机制
- 仅当客户最终报告需要 Excel 专属视觉判断时，在 Microsoft Excel 中补充版式/打印确认

### Blockers

- No blocker was reported.

## 下一步

- 等待业务提交完整 Pair A-D 与审批签字后，在同一 Task 中登记完整哈希、执行客户结果对账并关闭为 DONE；不得启动其他 Task。

## 不要再踩的坑

- 不得把自动派生的不同 SHA 工作簿冒充真实客户 golden pair 或业务验收
- 数据库中存在此前会话的测试记录；只能按本次精确 ID 清理，禁止使用 TSPU% 等宽泛条件删除
- 清理临时表必须查询 family_id，不能误写 id；后者可能形成相关子查询并触发过宽删除尝试
- parser-learning-wizard.spec.ts 应使用 --project=chromium；390/768/1366/1920 与 200% zoom 已由测试内部矩阵覆盖，不要再叠加 mobile-chrome 项目的固定 viewport
- 不要整体 source .env 后运行 Compose，也不要把 e2e-web ENTRYPOINT 替换为 pnpm；前者可能覆盖当前数据库环境，后者会触发不适用的运行时 lockfile 检查

## 新会话启动清单

1. Read `AGENTS.md` and `.codex/skills/bestar-handoff/SKILL.md`.
2. Run `git status --short`; preserve all existing changes.
3. Read the Task file above plus `prompts/tasks/OPEN-FUNCTIONS-20260707Task Index.md` and `docs/reports/project-completion-status.html`.
4. Verify this handoff against code, tests, runtime state, and artifacts before acting.
5. Do not execute any Task marked `Task-Status: ARCHIVED`.

## 权威参考

- `prompts/tasks/PARSER-PROFILE-08Golden Sample Full Stack I18n Exit Gate.md`
- `prompts/tasks/OPEN-FUNCTIONS-20260707Task Index.md`
- `docs/reports/project-completion-status.html`
- `docs/runbooks/business-agent-execution.md`
