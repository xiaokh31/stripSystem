执行 WAGE-P0-01：Wage Fixtures and XLS Reader。

必须读取：
- AGENTS.md
- prompts/agents/business-logic-agent.md
- docs/product/02-work-hours-and-unloading-wage-settlement.md
- docs/fixtures.md

任务范围：
1. 登记 `samples/wage` 下真实工资相关 `.xls` 样例。
2. 明确 worker 对 legacy Excel `.xls` 的读取能力。
3. 不做 API。
4. 不做 Web。
5. 不计算工资。

输入样例：
- `samples/wage/workAttendanceRecordForm_June.xls`
- `samples/wage/20260601-0630_wageRecords.xls`

业务要求：
1. 原始 `.xls` 文件必须保留，不能转换后替代原文件。
2. 每个样例必须记录 byte size 和 SHA-256。
3. 重复 SHA-256 必须可检测。
4. 如果当前 Python 依赖不能读取 `.xls`，必须显式补依赖或记录阻塞原因，不能假装 `.xlsx` 逻辑可用。
5. 读取能力测试只验证可以打开 workbook、列出 sheet、读取关键单元格或行，不做业务计算。
6. 不允许把构造数据当成真实样例。

验收标准：
1. `docs/fixtures.md` 包含 wage fixture manifest，或已存在时校验内容正确。
2. worker 测试覆盖两个真实 `.xls` 样例的存在、SHA-256 唯一和可读取性。
3. `.xls` 读取失败时测试给出明确错误。
4. 没有修改原始样例文件。
5. 测试通过。

测试命令：
cd apps/worker-python && uv run pytest
