执行 UNLOAD-WAGE-04：Monthly Unloading Wage Settlement UI。

必须读取：
- AGENTS.md
- prompts/tasks/UNLOAD-WAGE-03Monthly Unloading Wage Settlement API.md
- docs/product/02-work-hours-and-unloading-wage-settlement.md
- CONTEXT.md
- .codex/skills/bestar-domain/SKILL.md
- .codex/skills/nextjs-pwa-ui/SKILL.md

前置任务：
- UNLOAD-WAGE-01
- UNLOAD-WAGE-02
- UNLOAD-WAGE-03

任务范围：
1. 实现拆柜工资结算页面。
2. 从真实 API 生成和展示月度结算。
3. 显示每个人工资和当月拆了哪些柜子。
4. 不做移动端。
5. 不做银行付款导出。

页面建议：
- `/unloading-wage`

页面要求：
1. 支持按月份筛选。
2. 有生成当月结算动作。
3. 显示 worker 汇总：
   - worker name
   - paid unit count
   - wage amount
   - review status
4. 显示当月明细：
   - 海柜 container number 或美转加 trailer number
   - 美转加关联柜号
   - 完成日期
   - rate
   - 拆柜人
   - worker amount
5. 提供结算 JSON / HTML task report 下载链接。
6. 如果没有已拆完记录，显示明确空状态。
7. 如果存在需要复核的旧结算，显示 warning。
8. 页面数据必须来自 API，不能前端自行拼工资总额作为真相。

验收标准：
1. 可选择月份并生成结算。
2. 能看到每个人工资。
3. 能看到当月拆了哪些柜子。
4. 美转加关联柜号在明细中显示完整。
5. 下载链接可用。
6. 空状态、错误状态、需要复核状态可见。
7. 测试通过。

测试命令：
pnpm --filter web lint
pnpm --filter web typecheck
pnpm --filter web test
