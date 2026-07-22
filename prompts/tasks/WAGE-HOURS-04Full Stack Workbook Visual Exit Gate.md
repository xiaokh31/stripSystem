# 执行 WAGE-HOURS-04：Full Stack Workbook Visual Exit Gate

## 优先级与前置任务

- 优先级：P1 工时结算修正关闭门禁。
- 前置任务：`WAGE-HOURS-01`、`WAGE-HOURS-02`、`WAGE-HOURS-03` 全部达到受监督终态。
- 本任务以真实 Docker/nginx/PostgreSQL/Worker/LibreOffice 关闭线路；发现缺陷必须直接修复并重跑，不得只输出清单。

## 必须读取与使用

- `AGENTS.md`、`HANDOFF.md`、`CONTEXT.md`
- `prompts/agents/business-logic-agent.md`
- `docs/product/02-work-hours-and-unloading-wage-settlement.md`
- `docs/runbooks/work-hours-settlement-regression.md`
- `WAGE-HOURS-01/02/03` Task、execution result、changed files 和 tests
- `.codex/skills/bestar-handoff/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- `.codex/skills/nestjs-prisma-api/SKILL.md`
- `.codex/skills/nextjs-pwa-ui/SKILL.md`
- spreadsheet skill/instructions available to the Agent
- `infra/docker/report-visual-test.Dockerfile` 和现有 LibreOffice visual harness pattern
- Worker/API/Web attendance tests、`apps/web/e2e/work-hours.spec.ts`

## 关闭目标

使用真实 `samples/wage/workAttendanceRecordForm_June.xls` 从上传、Parse、PostgreSQL round trip、员工整月复核、Generate、
API 下载到 LibreOffice 渲染完整走通，并证明计算规则、所有 Sheet 格式、尺寸、RBAC、i18n 和历史审计均无回归。

## 必须验证的业务矩阵

1. 真实 fixture 仍解析 13 employees / 390 employee-day rows；所有员工完整月份可在 UI 到达。
2. zero/one/two/three/four/six punch fixtures 精确验证 odd first-last、even pair sum、lunch only once、rounding 和 intervals。
3. warnings-only import 可 Generate；parser errors 仍不能生成。
4. repeated Parse rebuild rows 幂等；parser version/method/intervals 经 DB/API 保持。
5. HR manager 可上传/Parse/Generate/download，read-only 只能查看，Warehouse manager attendance API 403。
6. duplicate SHA、原始文件保存、template SHA、generated file SHA/size/MIME/generatedBy/history 和 storage-safe download 保持。
7. 对 real API 下载的 `.xls` 做全 Sheet 结构检查：sheet count/order、eligible/special classification、employee one-to-one match、adjustment row、values、styles、merges、dimensions 和 print metadata。

## Excel/LibreOffice 视觉门禁

1. 基于现有 `report-visual-test` Docker image/pattern 增加 wage-specific harness；不要把 wage 逻辑硬塞进 unloading report 脚本。
2. 最终证据目录使用 `test-results/wage-hours-04/`，至少保存：
   - original template copy/hash inventory
   - Worker generated wage record
   - real API downloaded wage record
   - normalized all-sheet structure/style report
   - LibreOffice PDF/PNG render 和 visual summary
3. `xlrd(formatting_info=True)` 或等效 BIFF reader 对每个 Sheet 比较 normalized fill/font/border/alignment/number format，不能只抽查第一个 Sheet或只比 XF id。
4. LibreOffice 打开 Worker/API 两份产物，转换并渲染；逐张查看所有 eligible employee sheets。最终高信号截图可合并 contact sheet，但必须能检查第二、第三、中间和最后 Sheet。
5. 视觉检查内容：template colors、border continuity、time number format、TOTAL row、长 ASCII/CJK wrapping、row height、column width、无内容裁切、无异常空白、无 special sheet 数据覆盖。
6. 视觉 harness 必须在 Docker 内运行；不得依赖本机 Microsoft Excel 才让自动化通过。可把办公室 Excel 实测列为额外人工复核，但不是停止实现的理由。

## I18n 100% 关闭门禁

1. `en` / `zh-CN` 员工 selector、summary、method/warning/issues、actions、empty/error/generated-file states 全 catalog parity。
2. English 页面无中文 UI；中文页面无 English fallback、raw method/warning code、raw key 或双语 label。
3. SSR first frame、hydration、refresh、employee switch、locale switch、desktop/mobile/200% zoom 均保持单语。
4. 员工姓名、工号、department、文件名、SHA、MIME、parser version 等 raw data 只做窄范围 exception，不得掩盖相邻 UI 漏翻译。
5. console missing translation、hydration warning、pageerror 和 failed request 为 0；不得削弱 AST gate。

## 自动化与视觉范围

- Worker full suite，尤其 wage parser/generator/CLI。
- API lint/typecheck/unit/e2e、migration from empty/current DB、attendance RBAC/parse/generate/download。
- Web lint/typecheck/unit/production build。
- Docker Chromium work-hours spec 至少覆盖 390 mobile、1366 desktop、200% zoom 及 en/zh-CN；无 page-level overflow。
- 如修改 shared i18n/status/API client，运行 locale-switch 与相关回归，不重跑无关 Native/卸柜视觉矩阵。
- 清理本任务创建的临时账号、attendance imports、generated DB records 和非证据 storage；保留的 evidence 必须 gitignored 且在输出说明。

## 建议 Docker 命令

```bash
docker compose -f infra/docker/compose.local.yml up -d --build
docker compose -f infra/docker/compose.local.yml exec -T worker-python uv run pytest
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api lint
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api typecheck
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api test --runInBand
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api test:e2e --runInBand
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web lint
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web typecheck
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web test
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web build
docker compose -f infra/docker/compose.local.yml --profile e2e build e2e-web
docker compose -f infra/docker/compose.local.yml --profile e2e run --rm e2e-web e2e/work-hours.spec.ts --project=chromium
docker compose -f infra/docker/compose.local.yml --profile report-visual build report-visual-test
scripts/healthcheck.sh
git diff --check
```

实现后的 wage visual harness 命令必须补入 Task 执行结果和 runbook。

## 验收标准

1. 用户三个需求逐项由真实 API、DB、浏览器和下载工件证明，不只靠 unit mock。
2. 所有 eligible Sheet 格式正确；特殊 Sheet/adjustment row 未被覆盖；尺寸可读且 deterministic。
3. 全部员工整月记录可达，奇偶算法与 API/Workbook 一致。
4. strict i18n、RBAC、历史文件、SHA/storage/audit、duplicate Parse/Generate 行为无回归。
5. 所有最终截图由 Agent 按原始分辨率查看；browser/LibreOffice errors 为 0。
6. 自动化、production build、healthcheck、migration status 和 diff check 通过。
7. 产品规范、Task Index、completion report、regression runbook 和 `HANDOFF.md` 更新为真实终态。

## 完成输出

- 按 Standards / Spec 两轴给出结论和实际修复缺陷。
- 列出精确命令、测试数量、migration、临时数据清理、证据绝对路径和逐图结论。
- 无剩余限制则明确写“无 WAGE-HOURS 范围内已知限制”；否则只列真实外部门禁，不得以进度报告提前停止。
