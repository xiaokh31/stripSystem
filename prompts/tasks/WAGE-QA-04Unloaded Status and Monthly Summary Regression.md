执行 WAGE-QA-04：Unloaded Status and Monthly Summary Regression。

必须读取：
- AGENTS.md
- prompts/agents/business-logic-agent.md
- docs/product/02-work-hours-and-unloading-wage-settlement.md
- prompts/tasks/UNLOAD-WAGE-08Container Unloaded Status Lifecycle.md
- prompts/tasks/UNLOAD-WAGE-09Monthly Unloading Data Summary API Export.md
- prompts/tasks/UNLOAD-WAGE-10Monthly Unloading Data Summary UI.md
- prompts/tasks/WAGE-QA-03Temporary Unloader Directory Regression.md
- CONTEXT.md
- .codex/skills/qa-regression/SKILL.md
- .codex/skills/bestar-domain/SKILL.md
- .codex/skills/nestjs-prisma-api/SKILL.md
- .codex/skills/nextjs-pwa-ui/SKILL.md

前置任务：
- UNLOAD-WAGE-08
- UNLOAD-WAGE-09
- UNLOAD-WAGE-10

任务范围：
1. 回归验证 `UNLOADED` / `已拆完` 柜子状态。
2. 回归验证每月拆柜数据总结和 Excel 导出。
3. 确认新增状态不破坏 loading scan、load job、inventory、拆柜工资结算。
4. 不新增业务功能，除非是修复阻塞验收的小缺陷。

必须验证：
1. `LABELS_GENERATED` 柜子点击 `标记已拆完` 后变为 `UNLOADED`。
2. `UNLOADED` 柜子能继续进入 loading workflow。
3. loading scan 仍然能把柜子推进到 `LOADING_IN_PROGRESS` / `LOADED`。
4. 办公室手动操作不能直接设置 container `LOADED`。
5. 已经是 `LOADING_IN_PROGRESS` 或 `LOADED` 的柜子保存拆柜完成不会降级。
6. 月度拆柜总结包含 `UNLOADED`、`LOADING_IN_PROGRESS`、`LOADED`。
7. 月度拆柜总结排除未标记已拆完的 `LABELS_GENERATED`。
8. 已拆完状态但缺 completion date 的柜子进入 review warning。
9. Excel 导出结构参考 `samples/workform/Bestar_work_form.xlsx` 的 `6月拆柜数据` sheet。
10. 导出文件有 generated file 记录和浏览器安全下载链接。
11. 拆柜工资结算仍按原规则生成，不把“拆柜数据总结”当成工资结算。
12. 权限符合要求：`OFFICE` 可做拆柜数据总结，但默认不能生成拆柜工资结算。

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
4. 列出手工验证：从 `LABELS_GENERATED` 标记 `已拆完` 后状态变更。
5. 列出导出 workbook 的字段/格式验证结果。
6. 明确结论：
   - `unloaded status and monthly unloading summary complete`
   - 或列出 blocker / remaining task。
