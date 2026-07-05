执行 WAGE-P1-02：Attendance Parse Persistence API。

必须读取：
- AGENTS.md
- prompts/agents/business-logic-agent.md
- docs/product/02-work-hours-and-unloading-wage-settlement.md
- prompts/tasks/WAGE-P1-01Attendance Schema + Upload API.md
- .codex/skills/nestjs-prisma-api/SKILL.md
- apps/api/prisma/schema.prisma
- apps/worker-python/src/worker_python/wage/

前置任务：
- WAGE-P1-01

任务范围：
1. 将 WAGE-P0 attendance parser 接入 API。
2. 持久化 parsed attendance rows。
3. 记录 parsed JSON 和 HTML task report 生成文件。
4. 不生成 wage record workbook。
5. 不做 Web UI。

说明：
- 如果代码已经存在，本任务改为复核并补齐缺口。
- 不要重写已满足验收的实现。

业务要求：
1. `POST /api/attendance-imports/:id/parse` 从保存的原始 `.xls` 文件读取。
2. Parser output 必须持久化：
   - parser version
   - settlement month
   - period start / end
   - employee count
   - day count
   - warnings/errors
   - raw metadata
3. 每个 employee-day row 必须持久化：
   - employee id/name
   - department
   - work date
   - punch times
   - paired gross hours
   - lunch hours
   - calculated hours
   - first/last punch
   - raw_json
   - warnings/errors
4. 解析失败必须显式更新 parse status 和 error message。
5. 解析失败不能伪造成成功，也不能清掉原始文件。
6. parsed JSON 和 task report 必须记录为 generated file。
7. 重复 parse 应有清晰策略：重建 rows 或拒绝；不能产生重复 row。
8. 权限必须使用 attendance parse/read。

API：
- `POST /api/attendance-imports/:id/parse`
- `GET /api/attendance-imports/:id/parse-result`
- `GET /api/attendance-imports/:id/files`
- `GET /api/attendance-imports/:id/files/:fileId/download`

验收标准：
1. 可解析真实打卡表并落库 attendance rows。
2. 解析后的 row count、employee count、period 与 worker output 一致。
3. warnings/errors 可通过 API 返回。
4. parsed JSON 和 task report 可下载。
5. 重复 parse 不创建重复 rows。
6. parser 异常有明确 API 错误和 DB 状态。
7. 测试通过。

测试命令：
pnpm --filter api prisma generate
pnpm --filter api lint
pnpm --filter api typecheck
pnpm --filter api test
pnpm --filter api test:e2e
cd apps/worker-python && uv run pytest
