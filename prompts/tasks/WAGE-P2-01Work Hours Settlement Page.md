执行 WAGE-P2-01：Work Hours Settlement Page。

必须读取：
- AGENTS.md
- prompts/tasks/WAGE-P1-03Wage Record Generation API.md
- docs/product/02-work-hours-and-unloading-wage-settlement.md
- .codex/skills/nextjs-pwa-ui/SKILL.md
- .codex/skills/bestar-domain/SKILL.md

前置任务：
- WAGE-P1-01
- WAGE-P1-02
- WAGE-P1-03

任务范围：
1. 实现 HR 工时结算页面。
2. 调用真实 attendance API 上传、解析、查看、生成、下载。
3. 不做拆柜工资页面。
4. 不做移动端。

说明：
- 如果代码已经存在，本任务改为复核并补齐缺口。
- 不要引入 mock business data。

页面建议：
- `/work-hours`

页面要求：
1. 支持上传一个 monthly `.xls` attendance workbook。
2. 只允许 `.xls`，`.xlsx` 要在前端给出明确错误。
3. 显示 attendance imports 列表：
   - filename
   - SHA-256
   - import status
   - parse status
   - period
   - employee/day counts
   - warning/error counts
4. 支持选择一个 import 查看 parse result。
5. 支持触发 parse。
6. 显示 employee-day rows：
   - employee name/id
   - department
   - work date
   - punch times
   - calculated hours
   - warnings/errors
7. 支持生成 wage record workbook。
8. 显示 generated file 列表和下载链接。
9. 所有 mutation 后必须 refresh from API。
10. API 错误、duplicate upload、parse failure、generation failure 必须可见。

验收标准：
1. HR 可以从 `/work-hours` 上传真实 `.xls`。
2. 上传后列表显示真实 API 返回数据。
3. 可触发 parse，并看到解析行。
4. 可生成 wage record，并看到下载链接。
5. 页面刷新后状态仍存在。
6. 不使用 mock business data。
7. 测试通过。

测试命令：
pnpm --filter web lint
pnpm --filter web typecheck
pnpm --filter web test
pnpm --filter web build
