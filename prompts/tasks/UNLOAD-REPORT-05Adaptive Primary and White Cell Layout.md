# 执行 UNLOAD-REPORT-05：Adaptive Primary and White Cell Layout

## 优先级与执行状态

- 优先级：P0。当前报告在目的仓未超过主行容量时就占用白色追加行，不符合办公室
  对模板布局的使用方式，也会使少量目的仓报告看起来被错误压缩。
- Task-Status: CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING
- 前置任务：先完成
  `UNLOAD-REPORT-04Current Report and Label Replacement Regression.md`，确保重复生成
  只替换唯一 current 报告；本 Task 的新布局必须通过 current slot 下载和验证。
- 本 Task 接续 `UNLOAD-REPORT-03` 尚未关闭的 Microsoft Excel/实际打印门禁，并
  supersede 03 对“所有 16 行始终按物理顺序直接填充”的错误解释。
- 只执行本 Task。达到终态后更新本文件、03/04 状态、Task Index、完成度报告、
  专用验证报告和 `HANDOFF.md`，不得在同一 Session 自动开始 POD。

## 用户澄清

“拆柜报告中所有单元格都可用”的真实含义是：

1. 正常情况下先使用模板中的黑色/深色主单元格。
2. 只有目的仓数量超过深色主单元格容量时，才重新调整本页目的仓布局。
3. 扩展布局中才使用夹在深色行之间的白色单元格。
4. 不能从第一个目的仓开始就把深色行和白色行当成普通连续行交替填充。

模板实际结构：

- 深色/灰色主行（用户称“黑色部分”）：
  `4, 6, 8, 10, 12, 14, 16, 18`，容量 8。
- 白色追加行：
  `5, 7, 9, 11, 13, 15, 17, 19`，额外容量 8。
- 单个 worksheet 最大总容量：16。

## 已确认的当前回归

`UNLOAD-REPORT-03` 把两组行排序为 `4..19` 后无条件写入。
其最终 `report-8` 证据显示 8 个目的仓被写入 `4..11` 行，因而同时占用了 4 个
白色追加行。该输出虽然目的仓顺序守恒，但不符合本次明确的模板使用规则。

## 最终业务规则

### 1. 每页自适应布局模式

每个 populated worksheet 根据**该页实际目的仓数量**独立选择布局：

1. `0` 个目的仓：
   - 保留一个模板 worksheet；
   - 所有深色主行和白色追加行均为空；
   - 不伪造目的仓或数量。
2. `1–8` 个目的仓：`PRIMARY_ONLY`
   - 按业务顺序写入深色主行
     `4, 6, 8, 10, 12, 14, 16, 18`；
   - 白色追加行 `5, 7, 9, 11, 13, 15, 17, 19` 保持空白；
   - 不为了“连续显示”提前占用白色行。
3. `9–16` 个目的仓：`EXPANDED`
   - 该页整体切换为扩展布局；
   - 按纸面自上而下顺序写入 `4, 5, 6, 7, ... 19`；
   - 深色行和白色行都成为目的仓业务行；
   - 目的仓的视觉顺序必须是 `1, 2, 3, ...`，严禁出现
     `1, 9, 2, 10, ...`。
4. “重新调整”指在生成该 worksheet 时先确定模式，再选择完整 row map；不得先写
   主行、发现溢出后以追加逻辑造成错序、重复、残留或样式漂移。

### 2. 分页规则

1. 单页最大容量仍为 16；不能恢复按估算行高提前分页。
2. 全部 plans 先按每页最多 16 条稳定分组，每页再按该页数量选择上述模式。
3. 必须覆盖并固定以下边界：
   - `1/8`：一页，全部只在深色主行；
   - `9/16`：一页，深色+白色扩展布局；
   - `17`：`16 EXPANDED + 1 PRIMARY_ONLY`；
   - `24`：`16 EXPANDED + 8 PRIMARY_ONLY`；
   - `25`：`16 EXPANDED + 9 EXPANDED`；
   - `32`：`16 EXPANDED + 16 EXPANDED`；
   - `33`：`16 + 16 + 1`，最后一页 `PRIMARY_ONLY`。
4. `0–16` 仍为一个 populated worksheet/一张 A4 landscape；第 17 条才创建
   `Sheet2`。

### 3. 单元格映射与模板保护

1. 两种模式必须同时驱动以下列，不能只调整 `N/O/P`：
   - `C`：pallet/destination mirror；
   - `N`：DEST；
   - `O`：PLT；
   - `P`：CTN。
2. 同一业务 plan 的 `C/N/O/P` 必须位于同一物理行；`C == N`。
3. 未使用行必须清空本次生成可能留下的值，同时保留模板原始：
   - fill、font、border、alignment；
   - row height 基线；
   - editability；
   - print area 和页面设置。
4. 深色主行继续保持模板深色/灰色样式，白色追加行继续保持白色样式。不得把所有
   行统一涂色、隐藏白色行、merge 行或复制深色样式覆盖白色行。
5. Header、Total、Palletizing Standards 和人工填写区域不能被改作额外目的仓行。
6. 原模板只读，修复前后 SHA-256 不变。

### 4. 顺序、守恒和失败安全

1. page planner、writer、saved-workbook validator 和独立 package inspector 必须
   使用同一业务规则但不能共享一个可能同时出错的硬编码结果。
2. validator 必须按每页选定模式检查：
   - expected physical rows；
   - 未使用行确实为空；
   - 展平后的 destination/pallet/carton 与输入逐项相等；
   - 重复 destination 仍按 ordinal 分别保留；
   - 每页 total 和 global total 正确。
3. 模式、row map、保存后物理行或数量任一不一致时，使用
   `REPORT_DESTINATION_CONSERVATION_FAILED` 或新增的等价 stable code fail
   closed；不得生成可下载伪成功文件。
4. 失败生成必须遵循 04 的 current-file contract：当前成功报告、SHA、下载和文件
   区域不变，本次 staging 被清理。
5. 不能用集合、只看非空文本总数或 writer 与 validator 共用同一错误 row list 来
   伪造守恒。

## 必须读取与使用

- `AGENTS.md`、`HANDOFF.md`
- `prompts/agents/business-logic-agent.md`
- `prompts/tasks/UNLOAD-REPORT-03Print Margin and Destination Preservation Regression.md`
- `prompts/tasks/UNLOAD-REPORT-04Current Report and Label Replacement Regression.md`
- `docs/reports/unload-report-03-print-margin-destination-preservation-verification.md`
- `.codex/skills/bestar-handoff/SKILL.md`
- `.codex/skills/unloading-report-generator/SKILL.md`
- `.codex/skills/nestjs-prisma-api/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- `.codex/skills/docker-local-deploy/SKILL.md`
- `apps/worker-python/src/worker_python/reports/cell_map.py`
- `apps/worker-python/src/worker_python/reports/excel_report_writer.py`
- `apps/worker-python/tests/unit/test_excel_report_writer.py`
- `apps/web/e2e/report-package-inspector.py`
- `scripts/verify-unload-report-03.sh`
- `samples/templates/卸柜报告-En.xlsx`
- `test-results/unload-report-03/20260729T070000Z-final` 只作历史诊断；不得改名冒充
  新证据

## 修改前只读诊断

1. 用原模板和 03 最终工件输出 rows `4..19` 的：
   - fill/style identity；
   - `C/N/O/P` 值；
   - row height；
   - hidden/merged/protected 状态。
2. 保存 `report-8` 当前错误证据：它使用 `4..11`，包含白色行。
3. 对照模板说明为什么主行是 `4/6/.../18`、追加行为 `5/7/.../19`；不要仅根据
   变量名推断。
4. 检查现有 test 是否把“8 个目的仓连续占用 4..11”错误断言为通过，并列出需要
   替换的测试。
5. 若最新真实业务报告可提供，在受控环境只记录脱敏 row/style 摘要；不得提交客户
   原始内容。

## 实现范围

1. 在 `cell_map.py` 暴露明确的 primary/additional/expanded row maps 和单一
   `rows_for_page_count(count)` 或等价纯函数。
2. page planner 返回每页 plans 以及明确 layout mode/row assignments；不要让
   writer 根据长度再次独立猜测。
3. `_write_destination_rows`、row-height calculation、saved validator、manifest
   evidence 和 package inspector 使用 mode-aware assignments。
4. manifest/API evidence增加非本地化、非客户内容的布局信息，例如：
   `layoutModes`、每页 expected/written count；不得返回完整目的仓清单。
5. 清除或改写 03 中把 `DESTINATION_ROWS = sorted(primary + additional)` 当作所有
   情况唯一写入顺序的注释和测试。
6. 不改变 report current-file replacement、generated-file audit、API permission、
   async job、下载和 storage containment；这些由 04 提供。

## Strict i18n 硬门禁

1. Worker/API 只返回 stable code、enum、`labelKey` 和安全 raw layout metadata，
   不返回供普通 UI 直接显示的英文句子。
2. 若新增布局失败/review 提示，所有 visible copy、error、retry、tooltip、
   aria/title 和 screen-reader text 必须同时进入 typed `en` / `zh-CN` catalog。
3. English 页面只显示英文，中文页面只显示中文；生成、失败、刷新、hydration 和
   locale switch 时不能双语同时显示或闪现另一语言。
4. DEST、柜号、文件名和模板英文内容属于业务数据，不翻译。
5. 即使 Web 无新增文案，也必须通过 catalog parity、unmanaged-string、
   stable-code mapping 和 no-flash gate。

## 必须新增/修改的自动化

### Worker/package

1. 精确断言 `0/1/2/8/9/10/16/17/24/25/32/33` 的 page count、layout mode 和
   physical rows。
2. `8`：值只在 `4/6/8/10/12/14/16/18`；全部白色行为空。
3. `9`：值按顺序在 `4..12`；证明第 2 个目的仓位于第 5 行，而不是第 6 行，也不
   出现 `1,9,2,10`。
4. `16`：`4..19` 全部使用；`17/24/25/33` 的最后一页模式符合本任务规则。
5. 重复目的仓、长英文、CJK、multiline、long token、missing destination 和末行
   长文本在两种模式下均守恒。
6. 故意写入错误白色行、错 mode、错 physical row、残留未使用行、`C != N` 和保存
   后 mutation 必须 fail closed。
7. 每种模式逐行检查 fill/style/border/height/editability；模板 SHA 不变。

### API/full-stack/current file

1. 经 nginx 使用真实结构 fixture 生成 `8` 和 `9` 目的仓报告，从 04 的唯一 current
   slot 下载 bytes，独立读取 physical rows。
2. 先成功生成旧 current，再故意触发布局守恒失败；旧 current SHA/bytes/slot
   不变，无第二个 current 或半成品。
3. 重新生成 8 -> 9 -> 8，文件区域始终一份当前报告，每次下载的 row mode 与最新
   输入一致；托盘面单 slot 不受影响。

### PDF/PNG 与 Microsoft Excel

1. 新建唯一 `UNLOAD-REPORT-05` artifact directory；同时渲染模板、8、9、16、
   17、24、25 和真实结构 API 下载报告。
2. 为每页生成 full-page 和 destination-table 原分辨率 PNG：
   - 8 条只在深色主行有值；
   - 9–16 条按纸面顺序使用白色行；
   - 无错序、重叠、裁切、残留或样式污染。
3. 保留 03 的 A4 landscape、左侧 whitespace、单 sheet 单页、完整 Standards 和
   目的仓/托数/箱数可见门禁。
4. Agent 必须逐张查看截图，不能只依赖 OCR/像素脚本。

## Docker-only 验证

所有 Worker、Node、Prisma、LibreOffice、PDF、Playwright、test 和 build 命令必须
在 Docker/Compose 中运行。不得在宿主安装或修复 pnpm、Jest、Python venv 或
LibreOffice。

```bash
docker compose -f infra/docker/compose.local.yml up -d --build
docker compose -f infra/docker/compose.local.yml exec -T worker-python uv run pytest tests/unit/test_excel_report_writer.py
docker compose -f infra/docker/compose.local.yml exec -T worker-python uv run pytest
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api lint
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api typecheck
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api test --runInBand
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api test:e2e --runInBand
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web lint
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web typecheck
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web test
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web build
scripts/healthcheck.sh
git diff --check
```

必须新增 05 专用 package/full-stack/visual runner，不能只复跑未包含 mode-aware row
断言的旧 03 runner。

## Microsoft Excel 与实际打印验收

仓库自动化完成后，在办公室 Windows/Microsoft Excel 使用 04 的唯一 current 报告：

1. 打开 8 目的仓报告，确认只使用深色主行，白色行保持空白可用。
2. 重新生成 9 目的仓报告，确认同一 current slot 被替换，页面切换为深色+白色
   扩展布局，业务顺序为 1–9。
3. 使用 16 条确认所有合法行可用且仍为一个 worksheet/一张 A4 landscape。
4. 完成逐目的仓、PLT、CTN、total、Print Preview、Print to PDF、左侧白边、
   Standards 和办公室实际纸张打印签字。
5. 不执行 AutoFit，不手动修改 margin、scale、print area、fill 或 row mapping。

当前环境缺少 Microsoft Excel/目标打印机时，必须先完成所有自动化，再准确结束为
`CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING`；不得停止实现，也不得标记
`DONE`。

## 验收标准

1. 每页 `1–8` 个目的仓只使用深色主行；白色追加行全部为空且保持模板样式/可用性。
2. 每页 `9–16` 个目的仓才切换扩展布局，按物理行自上而下使用深色和白色行，业务
   顺序无缺失、重复或 `1,9,2,10` 错序。
3. 17+ 以 16 为容量分页，每页按自身数量选择模式；不按高度提前分页。
4. `C/N/O/P` 同行守恒、totals/manifest/validator/current download 正确；失败保留
   旧 current。
5. 模板样式、编辑能力、A4、左侧留白、Standards、row height、generated-file、
   audit、i18n 和 04 唯一 current contract 不回归。
6. Worker/API/Web/full-stack/package/PDF/PNG、strict i18n/no-flash、healthcheck、
   migration status 和 diff check 全部通过。
7. Microsoft Excel 与实际打印通过后才可 `DONE`；否则保持准确的 external
   verification pending。

## 明确非目标

- 不增加第 17 个单页目的仓槽位，不占用 Header/Total/Standards。
- 不改变目的仓聚合、托盘计算、库存、扫码、面单、柜子状态或工资规则。
- 不把所有行统一成深色或白色，不重新设计模板品牌与字段。
- 不回退 04 的唯一 current 文件规则，也不在普通文件区域显示历史报告。
- 不借本 Task 开始 POD、parser learning、Dashboard 或 wage 开发。

## 当前环境完成证据（2026-07-30）

仓库实现和当前环境自动化已完成。权威验证报告：

`docs/reports/unload-report-05-adaptive-primary-white-layout-verification.md`

最终成功 artifact：

`test-results/unload-report-05/20260730T022108Z-42114`

已验证：

- `0/1/2/8/9/10/16/17/24/25/32/33` 页数、mode 和 physical rows；
- primary/expanded 两种模式的样式、空闲行、row height、编辑能力和 `C/N/O/P`
  同行守恒；
- 重复目的仓、长英文、CJK、multiline、long token、missing destination 和末行
  长文本；
- 错 mode、错 physical row、错误白行、残留、`C != N`、保存后 mutation 和极端
  layout review fail closed；
- 真实 nginx/API/BullMQ/Chromium `8 -> 9 -> 8` current slot 替换、布局失败和人为
  守恒失败保留旧 current；
- 专用 package/PDF/PNG/OCR/几何 runner、模板 SHA、审计和精确 cleanup；
- Worker `235 passed`（writer 专项 `57 passed`）、API `388 unit + 129 E2E`、
  Web `284`、lint/typecheck/build、38 migrations up to date、healthcheck 和
  `git diff --check`。

Agent 已逐张原尺寸查看模板、8、9、16、17、24、25 和真实 API 8/9 的 24 张
full-page / destination-table PNG；未见错序、重叠、裁切、残留、样式污染或
Standards 缺失。36 张非模板生成页均为 A4 landscape，左侧 whitespace 与模板
`22.225mm` 基线的 delta 均为 `0.0mm`。

当前环境缺少 Microsoft Excel 和办公室目标打印机，因此唯一剩余项是本 Task
“Microsoft Excel 与实际打印验收”一节列出的 8/9/16 current report、Print
Preview、Print to PDF、左侧白边、Standards 和实际纸张打印签字。在该外部矩阵
完成前，本 Task 必须保持
`CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING`，不得标记 `DONE`，也不得用旧
03 `report-8` 补签。
