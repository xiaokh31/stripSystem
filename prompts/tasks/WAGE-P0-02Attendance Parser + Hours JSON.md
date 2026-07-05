执行 WAGE-P0-02：Attendance Parser and Hours JSON。

必须读取：
- AGENTS.md
- prompts/agents/business-logic-agent.md
- prompts/tasks/WAGE-P0-01Wage Fixtures + XLS Reader.md
- docs/product/02-work-hours-and-unloading-wage-settlement.md
- docs/fixtures.md

前置任务：
- WAGE-P0-01

任务范围：
1. 为 `samples/wage/workAttendanceRecordForm_June.xls` 做 attendance detector。
2. 解析员工打卡记录并输出 parsed JSON。
3. 计算每位员工每天的工作时长。
4. 不生成工资 Excel。
5. 不做 API。
6. 不做 Web。

业务要求：
1. Parser 输出必须包含：
   - employee identifier/name
   - department if present
   - work date
   - punch times
   - calculated work duration
   - raw row data
   - warnings
   - errors
   - parser_version
2. 未知列必须保存在 raw row data。
3. 缺少员工、日期或可用打卡时间必须产生 warning/error。
4. 奇数个打卡时间不能静默计算，必须标记人工复核。
5. 默认计算假设：按时间顺序两两配对，汇总每对时间差。
6. 不实现税务、扣款、假期、加班或法定节假日规则。
7. 输出 JSON 必须可复现，不能依赖前端状态。

验收标准：
1. Detector 能识别真实打卡表。
2. Unsupported workbook 返回明确错误。
3. Parsed JSON 覆盖所有可解析员工/日期记录。
4. 工作时长计算有单元测试。
5. warning/error 不被吞掉。
6. 测试通过。

测试命令：
cd apps/worker-python && uv run pytest
