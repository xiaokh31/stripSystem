执行 INVENTORY-ADJUST-03：Manual Inventory Depletion Regression + Full-Stack Smoke。

优先级：
- High。人工消库存会触碰库存统计、托盘状态、扫码事务、权限和 i18n，必须做关闭门禁，避免破坏原有装车扫描功能。

必须读取：
- AGENTS.md
- prompts/tasks/INVENTORY-ADJUST-01Manual Inventory Depletion API.md
- prompts/tasks/INVENTORY-ADJUST-02Manual Inventory Depletion UI.md
- .codex/skills/qa-regression/SKILL.md
- .codex/skills/warehouse-scan-flow/SKILL.md
- .codex/skills/docker-local-deploy/SKILL.md
- docs/runbooks/local-deployment.md
- docs/runbooks/warehouse-operator-manual.md
- apps/api/src/load-jobs/
- apps/api/src/scan/
- apps/api/src/reports/
- apps/web/e2e/
- apps/web/tests/i18n.test.ts

前置任务：
- INVENTORY-ADJUST-01
- INVENTORY-ADJUST-02

目标：
1. 对人工消库存做 full-stack smoke 和回归补齐。
2. 明确证明原有扫码装车、重复扫码、防重复扣库存、库存报表、权限和 i18n 没有被破坏。
3. 更新项目完成度/任务索引中的该功能状态。

必须覆盖的回归场景：
1. 正常人工消库存：
   - 准备一个目的仓 remaining=3。
   - 人工消 1。
   - 结果 remaining=2、adjustedOut=1、loaded 不变。
2. 扫码路径不受影响：
   - 对未调整的托盘扫码，仍能正常变为 `LOADED`。
   - 对已 `ADJUSTED_OUT` 托盘扫码，必须被拒绝或按现有异常流程处理，不能再次扣库存。
3. 重复扫码：
   - 同一 `LOADED` 托盘重复扫码仍走 duplicate scan，不影响 remaining。
4. 数量边界：
   - count=0 拒绝。
   - count > remaining 拒绝。
   - remaining=0 时入口禁用或后端拒绝。
5. 权限：
   - ADMIN/OFFICE 成功。
   - 普通 WAREHOUSE 不能执行。
   - 只有 `inventory.read` 的用户只能看统计，不能执行调整。
6. 审计：
   - `PalletEvent` 和 adjustment/correction audit 都存在。
   - operator、reason、note、pallet ids 可追溯。
7. 统计：
   - Container detail、inventory report、dashboard inventory summary 如已存在必须口径一致。
8. i18n：
   - 中文、English 下状态、reason、错误、成功、历史文案单语显示。
   - 不出现 raw `ADJUSTED_OUT` 作为主状态文案，除非在 debug/code 字段中明确允许。

I18n hard gate：
1. `pnpm --filter web test -- i18n` 必须通过。
2. E2E 或手工 smoke 必须覆盖 locale switch：
   - English -> 中文 -> refresh -> English。
   - 柜子详情人工消库存入口。
   - 错误提示。
   - 调整历史。
3. 任何新增缺失 key 必须回补到 `en.ts` 和 `zh.ts` 后再关闭任务。
4. API e2e response 不得以本地化句子作为 UI 显示源。

不做：
1. 不新增业务功能。
2. 不改变已经验收的人工消库存 API/UI 交互，除非发现阻塞级缺陷。
3. 不用 mock 业务数据冒充真实验收；测试 fixture 必须标注为测试数据。

验收标准：
1. API、Web、E2E 相关测试通过。
2. Docker full-stack smoke 通过。
3. 原有扫描装车功能仍可用。
4. `ADJUSTED_OUT` 不会被当作 `LOADED`。
5. 库存报表和柜子详情统计一致。
6. i18n 无缺口，语言切换不混排。
7. 任务索引更新该功能完成状态。

建议测试命令：
- pnpm --filter api lint
- pnpm --filter api typecheck
- pnpm --filter api test
- pnpm --filter api test:e2e
- pnpm --filter web lint
- pnpm --filter web typecheck
- pnpm --filter web test
- pnpm --filter web test -- i18n
- docker compose -f infra/docker/compose.local.yml up -d --build
- pnpm --filter web test:e2e
- git diff --check

手工验收：
1. 按 `docs/runbooks/local-deployment.md` 启动 Docker full-stack。
2. 使用真实或脱敏测试清单生成柜子、目的仓、标签和库存。
3. 在柜子详情执行人工消库存。
4. 再创建/执行装车任务，扫描未调整托盘和已调整托盘。
5. 打开库存报表和 dashboard，确认统计口径一致。
6. 中英文切换并刷新，确认单语显示。

完成输出：
1. changed files。
2. full-stack smoke 数据说明。
3. 测试命令和结果。
4. 手工验收步骤和结果。
5. 已知限制或后续建议。
6. 明确结论：`manual inventory depletion regression complete`。
