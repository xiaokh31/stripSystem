执行 UNLOAD-WAGE-09：Monthly Unloading Data Summary API Export。

必须读取：
- AGENTS.md
- prompts/agents/business-logic-agent.md
- docs/product/02-work-hours-and-unloading-wage-settlement.md
- prompts/tasks/UNLOAD-WAGE-08Container Unloaded Status Lifecycle.md
- CONTEXT.md
- .codex/skills/bestar-domain/SKILL.md
- .codex/skills/nestjs-prisma-api/SKILL.md
- .codex/skills/unloading-report-generator/SKILL.md
- apps/api/prisma/schema.prisma
- apps/api/src/reports/
- apps/api/src/unloading-wage/
- samples/workform/Bestar_work_form.xlsx

前置任务：
- UNLOAD-WAGE-08

任务范围：
1. 实现每月拆柜数据总结 API。
2. 实现每月拆柜数据 Excel 导出。
3. 导出表参考 `samples/workform/Bestar_work_form.xlsx` 的 `6月拆柜数据` sheet。
4. 生成的导出文件必须记录为 generated file，并提供下载。
5. 不做 Web UI；UI 由 UNLOAD-WAGE-10 执行。
6. 不做拆柜工人工资结算；这是运营数据总结，不是 wage settlement。

业务要求：
1. 总结对象是 selected month 内所有已拆完柜子。
2. 已拆完状态集合包括：
   - `UNLOADED`
   - `LOADING_IN_PROGRESS`
   - `LOADED`
3. 月份归属优先使用 unloading completed date。
4. 如果柜子状态已经是上述已拆完状态，但缺少 unloading completed date，不要静默塞进某个月；必须返回 warning/review item。
5. 导出内容要能给办公室复核拆柜数据，而不是只输出工资金额。
6. `6月拆柜数据` sheet 格式观察：
   - 没有标准表头，是按柜子分组的明细表
   - A 列是序号/柜号，例如 `1、BEAU5946301`
   - B 列是日期+业务标签，例如 `6.1海柜` / `6.1美转加`
   - C 列是 destination/service line
   - D 列是数量、件数、托数或混合文本
   - E 列是参考号、预约号、shipment、备注或 raw note
   - F 列常见预约/拆柜时间
   - G/H 列可存拆分数量、差异、操作备注
7. 数据来源优先使用结构化 container/destination 数据；如果某些参考号/时间只存在 raw_json，需要从 raw_json 中保留或输出 warning。
8. 导出不能修改原始 `samples/workform/Bestar_work_form.xlsx`。
9. 每次导出生成独立文件，不能静默覆盖历史。

建议 API：
- `GET /api/unloading-summary?month=YYYY-MM`
  - 返回 summary rows、review warnings、source container count、generated file links
- `POST /api/unloading-summary/exports`
  - body: `{ "month": "2026-06" }`
  - 生成 Excel workbook
- `GET /api/unloading-summary/exports/:fileId/download`
  - 浏览器安全下载路径

验收标准：
1. API 能按月份返回所有 `UNLOADED`、`LOADING_IN_PROGRESS`、`LOADED` 且 completion date 在该月的柜子。
2. `LABELS_GENERATED` 且未标记已拆完的柜子不进入总结。
3. 已拆完状态但缺少 completion date 的柜子出现在 warnings/review items。
4. 导出 Excel 能按柜子分组显示明细，结构接近 `6月拆柜数据` sheet。
5. 导出文件被记录，有 sha、mime、size、storage path 和下载链接。
6. API 权限允许 `OFFICE`、`WAREHOUSE_MANAGER`、`ADMIN` 使用；普通 `WAREHOUSE` 默认不可导出。
7. API unit/e2e 覆盖状态过滤、月份过滤、warning、导出文件记录。

测试命令：
pnpm --filter api lint
pnpm --filter api typecheck
pnpm --filter api test
pnpm --filter api test:e2e
cd apps/worker-python && uv run pytest
