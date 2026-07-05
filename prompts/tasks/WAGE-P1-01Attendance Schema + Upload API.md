执行 WAGE-P1-01：Attendance Schema and Upload API。

必须读取：
- AGENTS.md
- prompts/agents/business-logic-agent.md
- docs/product/02-work-hours-and-unloading-wage-settlement.md
- prompts/tasks/WAGE-P0-01Wage Fixtures + XLS Reader.md
- .codex/skills/nestjs-prisma-api/SKILL.md
- apps/api/prisma/schema.prisma

前置任务：
- WAGE-P0-01
- WAGE-P0-02
- WAGE-P0-03

任务范围：
1. 为 HR 工时结算建立 attendance persistence 和 upload API。
2. 上传真实 `.xls` 打卡记录并保存原始文件。
3. 不做 Web UI。
4. 不做工资记录生成 API。

说明：
- 如果代码已经存在，本任务改为复核并补齐缺口。
- 不要重写已满足验收的实现。

业务要求：
1. 只接受 legacy `.xls` attendance workbook。
2. 原始上传文件必须保存在持久 storage。
3. 必须计算 SHA-256 并检测重复。
4. 重复上传必须返回明确 duplicate/conflict，不覆盖首个原始文件。
5. 数据库必须能记录：
   - original filename
   - stored path
   - file SHA-256
   - file size
   - import status
   - parse status
   - imported by user
   - warning/error counts
6. 上传接口不得调用 parser。
7. 上传失败时不得返回成功。
8. 权限必须使用 attendance create/read 权限，不能只靠前端隐藏。

API：
- `POST /api/attendance-imports`
- `GET /api/attendance-imports`
- `GET /api/attendance-imports/:id`

验收标准：
1. 可上传 `samples/wage/workAttendanceRecordForm_June.xls`。
2. 原始文件字节被保存，SHA-256 与 fixture manifest 一致。
3. 重复上传同一内容会被拒绝或清晰返回已有 import state。
4. 非 `.xls` 上传会被拒绝。
5. API list/detail 能返回 import status 和 parse status。
6. 权限测试覆盖无权限访问。
7. Prisma migration 存在并可部署。
8. 测试通过。

测试命令：
pnpm --filter api prisma generate
pnpm --filter api lint
pnpm --filter api typecheck
pnpm --filter api test
pnpm --filter api test:e2e
