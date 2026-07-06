执行 WAGE-QA-03：Temporary Unloader Directory Regression。

变更说明：
- 本任务只覆盖临时拆柜工人目录变更。
- 新增 `UNLOADED` / `已拆完` 柜子状态和每月拆柜数据总结后，最终回归应继续执行
  `prompts/tasks/WAGE-QA-04Unloaded Status and Monthly Summary Regression.md`。

必须读取：
- AGENTS.md
- prompts/agents/business-logic-agent.md
- docs/product/02-work-hours-and-unloading-wage-settlement.md
- docs/architecture/09-account-role-permission-management.md
- prompts/tasks/UNLOAD-WAGE-06Temporary Unloader Directory API.md
- prompts/tasks/UNLOAD-WAGE-07Temporary Unloader Selector UI.md
- prompts/tasks/WAGE-QA-02Full Wage Module End-to-End Regression.md
- CONTEXT.md
- .codex/skills/qa-regression/SKILL.md
- .codex/skills/auth-rbac/SKILL.md
- .codex/skills/bestar-domain/SKILL.md
- .codex/skills/nestjs-prisma-api/SKILL.md
- .codex/skills/nextjs-pwa-ui/SKILL.md

前置任务：
- UNLOAD-WAGE-06
- UNLOAD-WAGE-07

任务范围：
1. 对临时拆柜工人目录变更做完整回归。
2. 确认系统不再要求拆柜临时工拥有员工账号。
3. 覆盖创建临时工、selector 选择、柜子详情保存、美转加关联、月结、权限和旧数据兼容。
4. 不新增业务功能，除非发现小缺陷必须修复才能通过验收。

必须验证：
1. `WAREHOUSE_MANAGER` 可以创建临时拆柜工人目录记录。
2. 创建临时工不需要 email、password、login account、`WAREHOUSE` role。
3. `GET /api/unloading-wage/workers` 返回 active 临时工目录。
4. 柜子详情“增加拆柜人”后，仍然通过 selector 选择临时工。
5. 保存拆柜人提交目录 id，并在后端快照 worker code / worker name。
6. 同一条海柜或同一组美转加不能重复选择同一临时工。
7. 停用临时工不再出现在新 selector 中。
8. 停用或改名后，历史柜子和历史月结仍显示保存时 snapshot。
9. 旧 user-backed assignment 或 legacy worker name 仍可读，不破坏已有 settlement。
10. 美转加关联柜任一详情页都显示一致 trailer number、关联柜号、拆柜状态和临时工列表。
11. 月结仍按海柜 CAD 300 / 柜、美转加 CAD 360 / 组计算。
12. 多拆柜人均分或按已实现的手工金额/比例规则计算。
13. `HR_MANAGER`、普通 `OFFICE`、普通 `WAREHOUSE` 默认不能维护临时工目录、编辑拆柜工资或生成 unloading wage settlement。

自动化测试要求：
1. API unit/e2e 覆盖临时工目录 CRUD、权限、停用、重复选择、旧数据兼容。
2. Web unit 覆盖 selector、新增临时工、legacy snapshot、重复校验。
3. Playwright/e2e 如存在 wage smoke，应覆盖临时工无需系统账号的主路径。
4. Docker full-stack smoke 使用 nginx 路径：
   - Web: `http://127.0.0.1/`
   - API: `http://127.0.0.1/api`

建议命令：
pnpm --filter api lint
pnpm --filter api typecheck
pnpm --filter api test
pnpm --filter api test:e2e
pnpm --filter web lint
pnpm --filter web typecheck
pnpm --filter web test
pnpm --filter web build
cd apps/worker-python && uv run pytest
docker compose -f infra/docker/compose.local.yml ps

验收输出：
1. 列出改动文件。
2. 列出测试命令和结果。
3. 列出 Docker full-stack 验证步骤和结果。
4. 列出 legacy user-backed assignment 的兼容验证结果。
5. 明确结论：
   - `temporary unloader directory complete`
   - 或列出 blocker / remaining task。
