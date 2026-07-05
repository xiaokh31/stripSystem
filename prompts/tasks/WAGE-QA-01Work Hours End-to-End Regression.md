执行 WAGE-QA-01：Work Hours End-to-End Regression。

必须读取：
- AGENTS.md
- prompts/tasks/WAGE-P0-01Wage Fixtures + XLS Reader.md
- prompts/tasks/WAGE-P0-02Attendance Parser + Hours JSON.md
- prompts/tasks/WAGE-P0-03Wage Record Generator + Task Report.md
- prompts/tasks/WAGE-P1-01Attendance Schema + Upload API.md
- prompts/tasks/WAGE-P1-02Attendance Parse Persistence API.md
- prompts/tasks/WAGE-P1-03Wage Record Generation API.md
- prompts/tasks/WAGE-P2-01Work Hours Settlement Page.md
- prompts/tasks/WAGE-P2-02Work Hours Navigation Permissions I18n.md
- docs/product/02-work-hours-and-unloading-wage-settlement.md
- docs/fixtures.md
- .codex/skills/qa-regression/SKILL.md

前置任务：
- WAGE-P0-01
- WAGE-P0-02
- WAGE-P0-03
- WAGE-P1-01
- WAGE-P1-02
- WAGE-P1-03
- WAGE-P2-01
- WAGE-P2-02

任务范围：
1. 做 HR 工时结算端到端回归。
2. 验证 worker、API、Web、generated files、权限、下载链接。
3. 补充手工验证步骤。
4. 不新增业务功能。

验收清单：
1. `samples/wage/workAttendanceRecordForm_June.xls` 已登记 SHA-256。
2. Worker 能解析真实 `.xls` 并生成 parsed JSON。
3. Worker 能从模板生成 wage record `.xls`。
4. API 能上传、拒绝重复、解析、返回 rows、生成 wage record、下载 generated files。
5. Web `/work-hours` 能上传、解析、展示 rows、生成和下载 wage record。
6. `.xlsx` 上传被拒绝。
7. Parser warnings/errors 能在 API/Web 可见。
8. 权限缺失时 API 返回 403，Web 不暴露无权限动作。
9. 生成文件记录有 SHA-256、file size、mime type、storage path。
10. 原始文件和模板文件没有被修改。

需要补充：
1. 如果没有 runbook，新增或更新手工验证文档。
2. 如果已有端到端脚本，加入 wage 流程。
3. 如果没有脚本，至少提供可执行手工步骤和命令清单。

测试命令：
cd apps/worker-python && uv run pytest
pnpm --filter api lint
pnpm --filter api typecheck
pnpm --filter api test
pnpm --filter api test:e2e
pnpm --filter web lint
pnpm --filter web typecheck
pnpm --filter web test
pnpm --filter web build
