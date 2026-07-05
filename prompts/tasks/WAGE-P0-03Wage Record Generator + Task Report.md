执行 WAGE-P0-03：Wage Record Generator and Task Report。

必须读取：
- AGENTS.md
- prompts/agents/business-logic-agent.md
- prompts/tasks/WAGE-P0-02Attendance Parser + Hours JSON.md
- docs/product/02-work-hours-and-unloading-wage-settlement.md
- docs/fixtures.md

前置任务：
- WAGE-P0-02

任务范围：
1. 使用 `samples/wage/20260601-0630_wageRecords.xls` 作为工资工时表模板。
2. 从 attendance parsed JSON 生成工资记录 `.xls`。
3. 生成 HTML task report。
4. 记录生成文件。
5. 不做 API。
6. 不做 Web。

业务要求：
1. 必须复制模板后写入，不能修改原模板。
2. 输出文件必须保存在 worker 输出目录。
3. 生成文件 manifest 必须记录路径、SHA-256、文件大小和类型。
4. HTML task report 必须显示：
   - 输入文件名
   - SHA-256
   - parse status
   - employee count
   - total calculated hours
   - warnings
   - errors
   - generated wage record path
5. 如果模板字段无法确认，必须以 warning 明示，不允许静默写错位置。
6. 不实现真实薪资审批；生成文件是 HR 复核用工时表。

验收标准：
1. 能从真实 attendance fixture 生成工资记录文件。
2. 模板文件未被修改。
3. 生成文件可打开或至少通过 workbook reader 校验。
4. HTML task report 包含 warning/error 汇总。
5. 生成文件被记录。
6. 测试通过。

测试命令：
cd apps/worker-python && uv run pytest
