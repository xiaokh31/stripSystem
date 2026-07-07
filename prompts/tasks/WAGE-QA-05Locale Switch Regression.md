执行 WAGE-QA-05：Locale Switch Regression。

必须读取：
- AGENTS.md
- prompts/agents/business-logic-agent.md
- prompts/tasks/WAGE-P2-04Locale Aware Status and Business Labels.md
- prompts/tasks/WAGE-P2-05Full Web I18n Copy Coverage.md
- docs/runbooks/local-deployment.md
- docs/product/02-work-hours-and-unloading-wage-settlement.md
- .codex/skills/qa-regression/SKILL.md
- .codex/skills/nextjs-pwa-ui/SKILL.md
- .codex/skills/docker-local-deploy/SKILL.md
- apps/web/package.json
- apps/web/src/components/i18n/
- apps/web/src/lib/i18n/
- apps/web/tests/ 或现有 Playwright 测试目录

前置任务：
- WAGE-P2-04
- WAGE-P2-05

任务范围：
1. 增加 Web i18n 自动化回归测试。
2. 验证中英文切换后，核心页面和状态显示能切换为单语。
3. 验证不会出现用户可见的双语状态 label。
4. 验证刷新页面后 locale cookie / browser locale 仍生效。
5. 只增加测试和必要的测试辅助；除非发现阻塞缺陷，否则不新增业务功能。

必须覆盖的状态矩阵：
1. Container lifecycle：
   - English:
     - `UNLOADED` => `Unloaded`
     - `LOADING_IN_PROGRESS` => `Loading in progress`
     - `LOADED` => `Delivered to destination`
   - 中文：
     - `UNLOADED` => `已拆完`
     - `LOADING_IN_PROGRESS` => `装车中`
     - `LOADED` => `已送库`
2. Pallet/load job loaded semantics：
   - English:
     - `Loaded`
     - `Loaded pallets`
     - `Complete loading`
   - 中文：
     - `已装车`
     - `已装托盘`
     - `完成装车`
   - 这些不能被错误替换成 `已送库`。
3. Wage workflow statuses：
   - attendance import status
   - wage generated file status
   - unloading wage settlement status
   - unloading wage completion status
4. Queue/import/load job statuses：
   - upload queue status
   - offline queue status
   - load job status
   - generated file status

必须覆盖的页面：
1. `/`
2. `/imports`
3. `/containers`
4. `/containers/[id]`，至少用一个具备状态数据的真实/测试数据库记录。
5. `/reports/inventory`
6. `/work-hours`
7. `/unloading-wage`
8. `/unloading-summary`
9. `/load-jobs`
10. `/mobile/load-jobs`
11. `/admin/users`
12. `/settings`

测试要求：
1. 使用项目已有 Docker full-stack 本地路由，不默认启动 host `pnpm --filter web dev`。
2. 如果现有 E2E 需要账号，使用已有 seed/admin 流程，不引入假业务数据作为真实业务数据。
3. 测试应能点击语言切换器，从 English 切换到中文，再切回 English。
4. 每个关键页面至少断言：
   - 英文 locale 下存在英文主文案。
   - 英文 locale 下不存在中文主状态名。
   - 中文 locale 下存在中文主文案。
   - 中文 locale 下不存在英文主状态名。
5. 增加通用断言，禁止普通用户可见状态 label 出现双语模式：
   - `/已拆完\\s*\\(UNLOADED\\)/`
   - `/已送库\\s*\\(LOADED\\)/`
   - `/Unloaded\\s*\\/\\s*已拆完/`
   - `/Delivered to destination\\s*\\/\\s*已送库/`
6. 如果必须展示 enum code，测试应定位到专门的 audit/debug 区，不应作为主要状态 label。

建议测试命令：
pnpm --filter web lint
pnpm --filter web typecheck
pnpm --filter web test
pnpm --filter web build
docker compose -f infra/docker/compose.local.yml up -d --build
pnpm --filter web test:e2e
docker compose -f infra/docker/compose.local.yml ps

手工验证步骤：
1. 打开 `http://127.0.0.1/`。
2. 确认默认语言。
3. 切换到中文，打开必须覆盖的页面。
4. 确认 container 状态中文分别显示 `已拆完`、`装车中`、`已送库`。
5. 确认 pallet/load job loaded 仍显示装车语义，不被改成送库语义。
6. 切回 English，确认页面主文案和状态恢复为英文。
7. 刷新浏览器，确认 locale 持久化。

验收标准：
1. 自动化测试覆盖语言切换和关键状态矩阵。
2. 没有普通用户可见的双语状态 label。
3. 中英文切换不会让页面保留上一语言的主状态/按钮/标题文本。
4. container `LOADED` 和 pallet/load job `Loaded` 的中文含义分开。
5. Docker full-stack smoke 通过。

完成输出：
1. 列出新增/修改的测试文件。
2. 列出覆盖的页面和状态矩阵。
3. 列出测试命令和结果。
4. 明确结论：
   - `web i18n locale switch regression complete`
   - 或列出 blocker / remaining task。
