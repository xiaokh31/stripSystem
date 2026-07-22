# 执行 WAGE-HOURS-01：Attendance Punch Parity Calculation Contract

## 优先级与前置任务

- 优先级：P0 工时结算计算规则修正。
- 前置任务：既有 `WAGE-P0-01` 至 `WAGE-P2-05`、`WAGE-QA-01/02/05` 已完成，不得重跑或改写历史证据。
- 本任务完成后再执行 `WAGE-HOURS-02`，不得把 01-04 放在同一个 business-agent Session。
- 当前 worktree 可能含其他已完成但未提交的改动；先核对并保留，不得回退。

## 必须读取与使用

- `AGENTS.md`、`HANDOFF.md`、`CONTEXT.md`
- `prompts/agents/business-logic-agent.md`
- `docs/product/02-work-hours-and-unloading-wage-settlement.md`
- `prompts/tasks/WAGE-P0-02Attendance Parser + Hours JSON.md`
- `prompts/tasks/WAGE-P1-02Attendance Parse Persistence API.md`
- `.codex/skills/bestar-domain/SKILL.md`
- `.codex/skills/nestjs-prisma-api/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- `apps/worker-python/src/worker_python/wage/attendance.py`
- `apps/api/src/attendance/worker-attendance.service.ts`
- `apps/api/src/attendance/attendance.service.ts`
- `apps/api/src/attendance/dto/attendance-response.dto.ts`
- `apps/api/prisma/schema.prisma` 及现有 attendance migration
- Worker/API attendance unit 与 E2E tests

## 已确认现状

1. 当前 `wage-attendance-v1` 对奇数次打卡把 `calculatedHours` 设为 `null` 并只给 `ODD_PUNCH_COUNT` warning。
2. 当前偶数次打卡按相邻两两配对求和，然后固定扣一次 `0.5` 小时午休。
3. 真实六月 fixture 有 25 个一打卡日、1 个三打卡日、93 个两打卡日和 271 个零打卡日。
4. `AttendanceRow` 尚未以结构化字段保存计算方法和区间；`pairedGrossHours` 是既有兼容字段。

## 业务计算契约

1. 先过滤并规范有效 `HH:mm`，按时间升序计算；原始值和 row number 继续保存在 raw evidence。
2. `0` 次打卡：gross `0`、lunch `0`、calculated `0`，保留 missing-punch warning。
3. 奇数次打卡：
   - gross 使用首次至末次的一个区间。
   - 1 次打卡的首末相同，所以 gross/lunch/calculated 均为 `0`。
   - 3、5、7... 次同样只以首末为 gross 边界，中间时间保留在 raw punches 供审计。
   - 必须返回可计算结果，同时保留稳定 odd fallback warning；不得继续返回 `null` 或阻止 warnings-only 生成。
4. 偶数次打卡：按 `(1,2)`、`(3,4)`... 分段计算并汇总 gross；不得误算为简单首末差。
5. 现有午休规则本次不变：至少有两个打卡边界时，在 gross 汇总后固定扣一次 `0.5` 小时；不得每一段重复扣除。
6. `calculatedHours = max(grossHours - lunchHours, 0)`，以分钟计算后按现有两位小数规则输出，避免每段先舍入造成累计误差。
7. `pairedGrossHours` 为兼容字段，继续返回本次方法得到的 gross；新增代码不得让现有 API/Web 立即断裂。

## 数据与版本契约

1. Parser version 升级到明确的新版本，parsed JSON 和 task report assumptions 同步新规则。
2. Worker employee-day 输出增加稳定代码和结构化区间：
   - `calculationMethod`: `NO_PUNCHES`、`FIRST_LAST_FALLBACK` 或 `PAIRED_INTERVALS`
   - `workIntervals`: `{ start, end, minutes, hours }[]`
3. Attendance persistence 必须让 method/intervals 经 Worker -> API -> PostgreSQL -> parse-result round trip 后不丢失。
4. 推荐在 `AttendanceRow` 增加 first-class calculation method 和 JSON intervals，并提供 migration；历史行可使用明确的
   `LEGACY_UNKNOWN`/nullable 兼容值，重新 Parse 后由现有 rebuild strategy 写成新版本。
5. 历史 generated files 不改写；重新 Parse/Generate 产生新的可审计结果。
6. row key、原文件保存、SHA-256 去重、RBAC、generated-file history 和原始 raw JSON 行为保持不变。

## I18n 100% 硬门禁

- Worker/API 只返回稳定 method/warning code、原始时间和数值，不返回按 locale 变化的业务句子。
- 如本任务触及 Web type/helper，可先增加 typed stable code；可见 label 由 `WAGE-HOURS-03` 完整接入 `en` / `zh-CN`。
- 新增 API error 必须是 stable code + structured details；不得把中英双语句子拼在一个字段。
- 现有 i18n AST/catalog gate 不得削弱、跳过或增加 broad allowlist。

## 必须测试的边界

- 0 punches -> gross/lunch/net = `0/0/0` + missing warning。
- 1 punch `08:00` -> `0/0/0` + odd fallback warning。
- 2 punches `08:00,17:00` -> gross `9.00`、lunch `0.50`、net `8.50`。
- 3 punches `09:00,17:09,17:10` -> first/last gross `8.17`、lunch `0.50`、net `7.67`，并保留全部 3 个 punches。
- 4 punches `08:00,12:00,13:00,17:30` -> paired gross `8.50`、只扣一次 lunch、net `8.00`。
- 6 punches、重复时间、输入顺序打乱和跨越非法/无法解析时间的既有 warning/error 行为。
- 真实 fixture 仍有 13 employees / 390 employee-day rows，三打卡日不再是 `calculatedHours=null`。
- API 重复 Parse 不产生重复 rows，method/intervals round trip 与 parser version 正确。

## 非目标

- 不修改工资 Excel 的样式/尺寸，留给 `WAGE-HOURS-02`。
- 不重做 `/work-hours` 布局，留给 `WAGE-HOURS-03`。
- 不增加加班、税务、假日、夜班、跨午夜或新的午休政策。
- 不修改拆柜工资、库存、扫码、Native 或容器业务。

## Docker 验证

所有命令必须在 Docker 中执行，不得运行宿主 `pnpm`、`uv`、Jest 或 Prisma：

```bash
docker compose -f infra/docker/compose.local.yml up -d --build api worker-python
docker compose -f infra/docker/compose.local.yml exec -T worker-python uv run pytest tests/unit/test_wage_attendance.py tests/integration/test_wage_p0_cli.py
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api lint
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api typecheck
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api test --runInBand
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api test:e2e --runInBand
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api prisma migrate status
git diff --check
```

测试路径以容器内 `/workspace/apps/worker-python` workdir 为准，可调整参数但必须记录准确命令与数量。

## 验收标准

1. 奇偶规则、午休一次、rounding 和 warning 契约全部由 unit tests 精确锁定。
2. 真实三打卡 fixture 行有可计算结果；一打卡行仍可审计且不会产生虚假正工时。
3. 新 method/intervals 可从真实 API parse-result 读取，重新 Parse 幂等。
4. migration 可在空库及现有数据库 deploy，Prisma generated client 同步且没有手改 generated code。
5. warnings-only import 仍可进入生成条件；parser errors 仍阻止生成。
6. Docker Worker/API checks 与 `git diff --check` 通过，`HANDOFF.md` 记录真实状态。

## 完成输出

- 写明精确公式、parser version、migration、兼容策略、真实 fixture 前后差异和测试数量。
- 更新本 Task 执行结果、Task Index、完成度报告和 `HANDOFF.md`。
- 终态后下一项只能是 `WAGE-HOURS-02`。

## 执行结果（2026-07-21 MDT）

- 状态：`DONE`。
- Parser version：`wage-attendance-v2`。
- 精确公式：先过滤合法 `HH:mm` 并按分钟升序排列。零次打卡没有区间；奇数次打卡仅使用
  `[first, last]`；偶数次打卡使用相邻的 `(1,2)`、`(3,4)`... 区间。令 `M` 为所有所选区间分钟数之和，
  `L = 30` 当有效打卡数至少为 2，否则 `L = 0`；输出
  `grossHours = round(M / 60, 2)`、`lunchHours = L / 60`、
  `calculatedHours = round(max(M - L, 0) / 60, 2)`。舍入只在分钟汇总后进行。
- Worker employee-day JSON 新增稳定 `calculationMethod` 和结构化 `workIntervals`；兼容字段
  `pairedGrossHours` 继续返回本次方法的 gross。0/1/2/3/4/6 次打卡、重复时间、乱序、非法时间过滤、
  fixed lunch 只扣一次及汇总后舍入均有精确测试。
- Prisma migration：
  `apps/api/prisma/migrations/20260722010000_attendance_calculation_metadata/migration.sql`。新增
  `AttendanceCalculationMethod` enum 和非空 `work_intervals` JSON；历史行使用
  `LEGACY_UNKNOWN`/`[]`，重新 Parse 由既有 rebuild transaction 写成 v2 method/intervals，历史 generated files
  不改写。
- 真实 fixture 的 v1 打卡数分布为：0 次 271 行、1 次 25 行、2 次 93 行、3 次 1 行，共 13 employees / 390
  employee-day rows。v2 实际 PostgreSQL 分布为 `NO_PUNCHES=271`、
  `FIRST_LAST_FALLBACK=26`、`PAIRED_INTERVALS=93`；三打卡
  `09:00,17:09,17:10` 从 `calculatedHours=null` 改为 gross/lunch/net `8.17/0.50/7.67`，区间 490 分钟；
  一打卡仍为 `0/0/0` 并保留 odd fallback warning。
- 真实 API 上传/Parse/parse-result/PostgreSQL round trip 已验证；重复 Parse 后仍为 390 rows / 390 distinct row
  keys，parser version、method 和 intervals 不丢失。测试用临时 HR 用户和空数据库均已删除。
- Docker 验证：Worker 定向测试 14 passed；API unit 41 suites / 327 tests passed；API E2E 21 suites /
  121 tests passed；API lint、typecheck、Prisma 33 migrations status、现有库 deploy、空库全量 deploy、
  `scripts/healthcheck.sh` 和 `git diff --check` 均通过。
- 下一项只能是 `WAGE-HOURS-02Multi-Sheet Wage Workbook Formatting.md`，不得在本 Session 启动。
