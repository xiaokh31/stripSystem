执行 UNLOAD-WAGE-03：Monthly Unloading Wage Settlement API。

必须读取：
- AGENTS.md
- prompts/agents/business-logic-agent.md
- prompts/tasks/UNLOAD-WAGE-01Container Detail Unloading Wage API.md
- docs/product/02-work-hours-and-unloading-wage-settlement.md
- CONTEXT.md
- .codex/skills/bestar-domain/SKILL.md
- .codex/skills/nestjs-prisma-api/SKILL.md
- apps/api/prisma/schema.prisma

前置任务：
- UNLOAD-WAGE-01

任务范围：
1. 实现月度拆柜工资结算 API。
2. 从 container detail 保存的拆柜工资数据生成结算。
3. 生成结算 JSON 和 HTML task report。
4. 不做 Web UI。

API 建议：
- `POST /api/unloading-wage-settlements`
- `GET /api/unloading-wage-settlements`
- `GET /api/unloading-wage-settlements/:id`
- `GET /api/unloading-wage-settlements/:id/files/:fileId/download`

业务要求：
1. settlement month 根据拆柜完成日期计算。
2. 只包含已标记 `已拆完` 的记录。
3. 海柜：
   - 一个 container number 是一个 paid unit
   - CAD 300
4. 美转加：
   - 一个 trailer association 是一个 paid unit
   - 多个关联柜号合计 CAD 360
   - 不能按每个关联柜号重复计费
5. 多个拆柜人默认均分金额。
6. 如果存在手工金额或比例字段，则按手工分配；否则均分。
7. 结算结果必须按 worker 汇总：
   - worker name
   - paid unit count
   - total amount
   - detail lines
8. 结算明细必须显示：
   - 海柜 container number 或美转加 trailer number
   - 美转加关联柜号
   - 完成日期
   - rate
   - 拆柜人
   - worker amount
9. 生成结算必须 snapshot rate、关联柜号、拆柜人和金额，后续修改不能静默改历史结算。
10. 重新生成同月结算时，旧结算必须 superseded 或标记不可作为当前版本。
11. 生成文件必须记录，不能只返回内存数据。

验收标准：
1. 能为指定月份生成结算。
2. 未已拆完记录不会进入结算。
3. 海柜按 CAD 300 / 柜计算。
4. 美转加多柜关联只按 CAD 360 / 组计算。
5. 多拆柜人均分逻辑正确。
6. 结算 JSON 和 HTML task report 可下载。
7. 修改已结算拆柜数据后，相关结算需要复核或 superseded。
8. 测试通过。

测试命令：
pnpm --filter api lint
pnpm --filter api typecheck
pnpm --filter api test
pnpm --filter api test:e2e
