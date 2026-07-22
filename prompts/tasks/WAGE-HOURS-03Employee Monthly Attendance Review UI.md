# 执行 WAGE-HOURS-03：Employee Monthly Attendance Review UI

## 优先级与前置任务

- 优先级：P1 HR 工时复核体验。
- 前置任务：`WAGE-HOURS-01`、`WAGE-HOURS-02` 均达到受监督终态。
- 本任务实现页面和 focused Web/API contract tests；完整下载工作簿视觉退出门禁由 `WAGE-HOURS-04` 执行。

## 对应用户原始需求

本 Task 完整负责用户第 1 条修改：**“在已解析员工工时行中，按人名显示当月的所有打卡记录。”**
任务编号 `03` 表示技术执行依赖顺序，不表示它对应用户第 3 条需求。

交付结果必须让人事经理先按员工姓名定位人员，再看到该员工当月全部日期、每个日期的全部打卡时间和计算结果；
不得只显示存在打卡的日期，也不得因当前全局 `100` 行上限隐藏后续员工。

## 必须读取与使用

- `AGENTS.md`、`HANDOFF.md`、`CONTEXT.md`
- `prompts/agents/business-logic-agent.md`
- `docs/product/02-work-hours-and-unloading-wage-settlement.md`
- `prompts/tasks/WAGE-P2-01Work Hours Settlement Page.md`
- `prompts/tasks/WAGE-P2-05Full Web I18n Copy Coverage.md`
- `prompts/tasks/WAGE-HOURS-01Attendance Punch Parity Calculation Contract.md`
- `.codex/skills/frontend-design/SKILL.md`
- `.codex/skills/nextjs-pwa-ui/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- `apps/web/src/app/work-hours/page.tsx`
- `apps/web/src/components/wage/attendance-flow.ts`
- `apps/web/src/lib/api-client.ts`
- Web i18n catalog/translator/status helpers、wage tests 和 `apps/web/e2e/work-hours.spec.ts`

## 已确认现状

1. 当前 `AttendanceRowsTable` 把所有员工按日期平铺，并硬编码 `rows.slice(0, 100)`。
2. 真实 fixture 有 13 名员工、每人 30 行、共 390 行；后面的员工和月份记录无法从当前页面全部到达。
3. Parse API 已返回全部 rows；本任务不应为了 UI 分组制造 mock 数据或前端工资计算。
4. `WAGE-HOURS-01` 会提供 calculation method/interval metadata；页面只显示 API 持久化结果。

## 页面业务要求

1. 在 `Parsed employee-day rows` 区域按稳定员工 identity 分组：优先 `employeeId`，缺失时使用 normalized name + department fallback；同名不同工号不得合并。
2. 员工姓名是主显示/选择标签，工号与部门为辅助信息。无姓名时使用本地化 unknown employee 文案并保留工号。
3. 提供适合实际月结的 employee selector/index；可以使用可访问的 select、combobox 或 accordion，但必须满足：
   - 用户可直接找到并切换任意员工；
   - 当前员工显示当月全部 employee-day rows，不是只显示有打卡的日期；
   - 不再存在全局前 100 行截断；
   - rows 按 work date 升序并使用稳定 key。
4. 员工摘要至少显示 worked days、review days、total calculated hours 和当前显示 row count，全部来自 API rows 聚合，不重算业务工时。
5. 月度明细显示 date、全部 punches、gross、lunch、hours、localized calculation method、localized warnings/errors。
6. odd first/last fallback 必须明显但不错误显示为“无法计算”；one-punch zero-hour 仍显示 warning。
7. 切换员工不得触发 mutation、重新 Parse、丢失选中的 attendance import 或清空 generated files。
8. 320/390 mobile、768 tablet、1366/1920 desktop 与 200% zoom 下无 page-level overflow/遮挡；明细表可在自己的 bounded scroller 内横向滚动。
9. 长姓名、长 department、30/31 天、空月份行和多个 issues 不得撑坏布局；不要用截断隐藏业务内容而不提供完整可访问文本。

## I18n 100% 硬门禁

1. 新增 employee selector、summary、calculation method、warning、empty state、tooltip、title、aria-label 和 live status 全部进入 typed `en` / `zh-CN` catalog。
2. `NO_PUNCHES`、`FIRST_LAST_FALLBACK`、`PAIRED_INTERVALS`、warning code 和 parser version 不能作为可见 raw label；必须通过窄范围 helper 映射。
3. 员工姓名、工号、department raw source data 不翻译；不得误判为 English fallback。
4. English 页面不显示中文 UI；中文页面不显示 English UI、raw key、raw enum 或双语拼接。
5. SSR HTML、首帧、hydration、refresh、locale switch 和 employee switch 保持目标单语；不得使用 DOM 翻译 walker。
6. API 继续返回 stable code/raw data，不新增 locale 参数或 localized API sentence。

## 权限与行为保持

- `HR_MANAGER` / `ADMIN` 行为和 attendance permissions 保持。
- read-only attendance user 可以查看/切换全部员工，但仍看不到 upload/parse/generate mutation actions。
- `WAREHOUSE_MANAGER`、普通 `OFFICE`/`WAREHOUSE` 的既有 403/导航边界不变。
- 上传、duplicate SHA、Parse、Generate、download/history 和 refresh-from-API 行为不变。

## 测试要求

1. 把 grouping/sorting/summary/calculation-label 逻辑放入可测试 helper，覆盖 duplicate name/different id、missing name/id、31-day rows、issues 和 stable order。
2. render/static tests 证明不再有 `slice(0,100)`，每个 employee 的完整月可达，所有 visible labels 经过 translator。
3. 更新 focused Playwright，至少选择 real fixture 中两个相距较远的员工并分别验证完整 30 行；验证真实三打卡 odd fallback 行和普通偶数行。
4. Playwright 覆盖 en/zh-CN、desktop/mobile、真实 200% zoom、read-only user、无 console/hydration/missing translation error。
5. 不用 synthetic Web mock 代替真实 API/fixture 主路径；合成数据只用于 unit edge cases。

## 非目标

- 不增加员工账号或把 attendance employee 绑定到 `User`。
- 不允许页面重新计算或覆盖 Worker hours。
- 不修改 Excel 样式算法、拆柜工资、Dashboard 或 Native。
- 不对整个 Office Shell 做视觉重设计。

## Docker 验证

```bash
docker compose -f infra/docker/compose.local.yml up -d --build web nginx
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web lint
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web typecheck
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web test
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web build
docker compose -f infra/docker/compose.local.yml --profile e2e build e2e-web
docker compose -f infra/docker/compose.local.yml --profile e2e run --rm e2e-web e2e/work-hours.spec.ts --project=chromium
scripts/healthcheck.sh
git diff --check
```

## 验收标准

1. 13 名真实员工均能按姓名/identity 选择，每人完整 30 行可达，共 390 行不因 UI 截断丢失。
2. odd/even method、punches、gross/lunch/net 和 issues 与 API 一致，Web 不自行计算。
3. read-only/RBAC、upload/parse/generate/download 原行为无回归。
4. strict i18n、SSR/no-flash、移动/桌面/200% zoom、无 page overflow 和 accessibility tests 通过。
5. Docker Web checks、focused Chromium、healthcheck 与 diff check 通过。
6. `HANDOFF.md` 记录截图/测试和下一项 `WAGE-HOURS-04`。

## 完成输出

- 列出 UI 结构、identity/grouping 规则、i18n keys、测试数量与截图路径。
- 更新本 Task、Task Index、完成度报告和 `HANDOFF.md`。
