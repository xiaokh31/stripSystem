执行 UNLOAD-WAGE-12：Monthly Unloading Summary Blank Export Regression。

必须读取：
- AGENTS.md
- prompts/agents/business-logic-agent.md
- docs/product/02-work-hours-and-unloading-wage-settlement.md
- prompts/tasks/UNLOAD-WAGE-09Monthly Unloading Data Summary API Export.md
- prompts/tasks/UNLOAD-WAGE-10Monthly Unloading Data Summary UI.md
- prompts/tasks/WAGE-QA-04Unloaded Status and Monthly Summary Regression.md
- prompts/tasks/UNLOAD-WAGE-11Restore Loading Completed Status Regression.md
- CONTEXT.md
- .codex/skills/bestar-domain/SKILL.md
- .codex/skills/nestjs-prisma-api/SKILL.md
- .codex/skills/nextjs-pwa-ui/SKILL.md
- .codex/skills/qa-regression/SKILL.md
- apps/api/prisma/schema.prisma
- apps/api/src/unloading-summary/
- apps/api/src/unloading-wage/
- apps/web/src/app/unloading-summary/
- apps/web/src/components/reports/unloading-summary-*
- apps/worker-python/src/worker_python/unloading_summary/
- samples/workform/Bestar_work_form.xlsx

前置任务：
- UNLOAD-WAGE-09
- UNLOAD-WAGE-10
- WAGE-QA-04
- UNLOAD-WAGE-11

现场问题：
1. 月度拆柜报告汇总已能生成文件，但用户发现生成结果是空白。
2. 本地 full-stack 数据库中已经存在已拆完口径的柜子：
   - `UNLOADED`: 6
   - `LOADING_IN_PROGRESS`: 6
   - `LOADED`: 6
3. 本地库中这些柜子的 summary source completion month 只有 `2026-06`：
   - `pay_containers.completed_at = 2026-06-18 20:30:00`
   - `2026-06` 有 18 个 eligible completed containers
4. 但当前页面按系统日期默认 `2026-07`，并且已经生成过一个
   `storage/unloading_summary/2026-07/.../monthly-unloading-summary-2026-07-20260710004426.xlsx`。
   该 workbook 的 `7月拆柜数据` sheet 只有空单元格，`Review` sheet 只有表头。
5. 这导致用户看到“系统里有已拆完柜子，但导出的拆柜汇总是空白”的 false-success 体验。

根因方向：
1. `GET /api/unloading-summary?month=YYYY-MM` 当前从 `pay_containers.completed_at`
   按月查询，再回连 source containers。
2. `/unloading-summary` 没有显式 month 参数时默认当前系统月份。
3. 当当前月份没有 rows 但其他月份有已拆完数据时，页面没有提示可用完成月份。
4. `POST /api/unloading-summary/exports` 允许 0-row summary 生成成功，worker 也会写出空 workbook，
   导致用户以为报告生成成功但内容缺失。
5. 如果存在 `UNLOADED` / `LOADING_IN_PROGRESS` / `LOADED` 但没有 recorded unloading completion date
   的柜子，当前逻辑只能进入 review item，不会进入任何月份。这个规则是正确的，但 UI/API 必须把原因说清楚。

业务规则边界：
1. 不要为了让当前月有数据而静默用 `containers.updated_at`、`created_at` 或扫描时间替代
   unloading completion date。
2. 月份归属仍以 recorded unloading completion date 为准。
3. 如果真实业务希望某个柜子进入 `2026-07`，应修正该柜子的 unloading completion date 来源或录入值，
   不能在 summary 层偷换日期规则。
4. 月度拆柜数据总结是运营汇总，不是拆柜工资结算；修复后仍不得改变 `/unloading-wage`
   工资结算规则。
5. 已拆完口径仍为：
   - `UNLOADED`
   - `LOADING_IN_PROGRESS`
   - `LOADED`
6. `LABELS_GENERATED` 仍不得进入 completed unloading summary。
7. `LOADED` 仍显示为 `已送库`，不能被改名为 `已拆完`。

修复范围：
1. API 增加 summary month metadata。
   - 返回可用完成月份列表，例如 `availableMonths`：
     - month
     - completedContainerCount
     - rowCount
     - status counts if cheap to compute
   - 返回 selected month 是否有数据。
   - 返回 completed status but missing completion date 的 review count。
2. API 或 Web 默认月份逻辑改进。
   - 如果 URL 没有显式 `month`，并且当前月份没有 rows 但存在其他可用完成月份，
     默认打开最近一个有 completed unloading rows 的月份。
   - 如果 URL 显式指定了空月份，则尊重用户选择，但必须显示清楚 empty state 和可用月份快捷入口。
3. 空导出防护。
   - 默认不允许为 0-row selected month 生成“成功”的拆柜数据 workbook。
   - API 应返回明确错误，例如 `UNLOADING_SUMMARY_NO_ROWS_FOR_MONTH`，并带上 available months。
   - Web export 按钮在已加载 summary rowCount 为 0 时禁用或二次确认；推荐禁用并展示原因。
   - 如果未来业务确实需要空月报，必须新增显式 `allowEmpty` 参数和清楚文案，本任务不默认开放。
4. Worker workbook 兜底。
   - 即使 worker 被传入 0 rows，也不能生成只有空白业务 sheet 的 false-success workbook。
   - 推荐返回 warning/error 给 API；如果必须生成，业务 sheet 和 Review sheet 都要写入“selected month has no completed unloading rows”的可见说明。
5. 当前本地数据回归。
   - 在当前 full-stack 数据下，打开 `/unloading-summary` 无 month 参数时不应默认导出空白 `2026-07`。
   - 页面应能引导到 `2026-06`，并显示 18 个已拆完口径柜子。
   - 显式选择 `2026-07` 时应显示空状态和 `2026-06` 可用月份提示，不能生成无业务行的成功导出。

建议实现：
1. 在 `UnloadingSummaryService` 中抽出 month discovery 查询。
   - 只统计 current status 属于 completed unloading status set 的 source containers。
   - month 仍来自 recorded unloading completion date。
   - 不要求 settlement 已生成；`COMPLETED` / `SETTLED` pay container 都应可作为 completed source。
2. `GET /api/unloading-summary` 可继续要求 `month`，但需要新增 metadata；或者新增
   `GET /api/unloading-summary/months` 给页面先取最近可用月份。
3. Web server page 如果 search params 没有 month：
   - 先取 available months。
   - 有可用月份则 redirect 或使用 latest available month 加载 summary。
   - 没有可用月份再使用当前月并显示空状态。
4. Export panel 不应脱离当前 summary 状态盲目 POST；需要知道 rowCount。
5. 测试 fixture 需要覆盖：
   - 当前系统月份是 `2026-07`，但只有 `2026-06` 有 completed rows。
   - 显式 `2026-07` 返回 0 rows + available month hint。
   - export `2026-07` 被拒绝且不创建 generated_file。
   - export `2026-06` 生成 xlsx 且业务 sheet 有行。

验收标准：
1. 默认打开 `/unloading-summary` 时，如果当前月份无 rows 但历史最近月份有 rows，
   页面展示最近可用 completed month，而不是生成当前月空报表。
2. 当前本地 full-stack 数据中，页面能引导到 `2026-06` 并显示 18 个已拆完口径柜子。
3. 显式选择 `2026-07` 时，页面显示“该月份没有已拆完明细行”以及可用月份 `2026-06`。
4. 0-row month 默认不能成功创建 `MONTHLY_UNLOADING_SUMMARY_XLSX` generated file。
5. 非空月份导出 workbook 的 `6月拆柜数据` sheet 有业务行，不是空白 sheet。
6. Review sheet 对 missing completion date、missing reference、missing appointment 等继续可见。
7. `UNLOADED`、`LOADING_IN_PROGRESS`、`LOADED` 三种状态仍都能进入 summary。
8. `LABELS_GENERATED` 仍被排除。
9. `LOADED` / `已送库` 的 loading completed 含义不被改变。
10. API/Web 文案需要接入 i18n，不要新增中英文同时显示的可见双语文案。

测试命令：
pnpm --filter api lint
pnpm --filter api typecheck
pnpm --filter api test -- unloading-summary
pnpm --filter api test:e2e -- unloading-summary
pnpm --filter web lint
pnpm --filter web typecheck
pnpm --filter web test -- unloading-summary
pnpm --filter web build
cd apps/worker-python && uv run pytest tests/unit/test_unloading_summary_excel_writer.py tests/integration/test_unloading_summary_cli.py
docker compose -f infra/docker/compose.local.yml ps
scripts/healthcheck.sh

手工验证：
1. 启动 Docker full-stack。
2. 用有 `unloading_summary.read/export` 权限的账号打开 `/unloading-summary`，不带 month 参数。
3. 确认页面自动显示最近可用完成月份，例如当前本地库应为 `2026-06`。
4. 确认 summary rows 显示 18 个已拆完口径柜子：
   - `UNLOADED`
   - `LOADING_IN_PROGRESS`
   - `LOADED`
5. 导出 `2026-06`，下载 workbook，确认业务 sheet 有明细行。
6. 手动选择 `2026-07`，确认页面显示空状态和可用月份提示。
7. 尝试导出 `2026-07`，确认不会生成成功的空白 workbook。

完成输出：
1. changed files
2. tests run
3. 当前本地 full-stack 的 `availableMonths` / rowCount 验证结果
4. 导出 workbook 的业务 sheet 行数验证结果
5. known limitations
6. next recommended task
