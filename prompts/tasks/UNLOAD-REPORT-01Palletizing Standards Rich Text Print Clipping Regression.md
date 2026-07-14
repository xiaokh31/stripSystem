# 执行 UNLOAD-REPORT-01：Palletizing Standards Rich Text Print Clipping Regression

## 优先级

- P0 现场报表与打印回归，立即执行。
- 生成的拆柜报告中 `Palletizing Standards` 显示和打印不完整，影响仓库现场操作标准，不得仅按“文件可下载”验收。

## 现场问题

以 `samples/templates/卸柜报告-En.xlsx` 生成拆柜报告后，主体数据可以写入，但底部
`Palletizing Standards` 区域与模板显示效果不同：Excel 中内容显示不全，打印后同样显示不全。

目标不是重新设计模板，而是让每份生成报告完整保留模板该区域的文字、字体 runs、换行、合并区域和打印效果。

## 已确认根因

2026-07-12 已对模板和 `storage/reports/SMCU1234567卸柜报告-En.xlsx` 做 package-level 对比：

1. 两者都保留 `C21:I25` merge、相同行高/列宽、A4 landscape、78% scale 和相同 margins。
2. 模板 `xl/sharedStrings.xml` 中的 `C21` 是 rich text：
   - `Palletizing Standards：` 标题为 11pt、bold、宋体；
   - 正文为 10pt、bold，并按内容混用 Arial/宋体和多个显式换行；
   - 最后一行以 `when stored.` 结束。
3. 当前生成文件把 `C21` 保存为单一 `<is><t>...</t></is>`，rich text `<r>/<rPr>` 全部丢失；整段继承
   cell style 的 11pt 宋体粗体，导致相同区域内正文占用更大并被裁切。
4. 当前 openpyxl 3.1.5 使用 `load_workbook(template_path, rich_text=True)` 后保存的验证文件可保留 10pt/11pt
   rich runs。优先使用该最小修复，不要先修改模板尺寸或打印比例掩盖问题。

## 必须读取与使用

- `AGENTS.md`、`CONTEXT.md`
- `prompts/agents/business-logic-agent.md`
- `.codex/skills/unloading-report-generator/SKILL.md`
- `.codex/skills/unloading-excel-parser/SKILL.md`
- `.codex/skills/docker-local-deploy/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- `apps/worker-python/src/worker_python/reports/excel_report_writer.py`
- `apps/worker-python/src/worker_python/reports/cell_map.py`
- `apps/worker-python/tests/unit/test_excel_report_writer.py`
- `apps/worker-python/tests/integration/test_batch_cli.py`
- `apps/worker-python/src/worker_python/cli.py`
- `apps/worker-python/src/worker_python/batch.py`
- `samples/templates/卸柜报告-En.xlsx`
- `samples/reports/EGSU9302760卸柜报告-En.xlsx`
- `samples/unloading-plans/CAAU8011090 UNLOADING PLAN.xlsx`
- API report generation/download endpoint、worker invocation 和 generated-file tests
- `infra/docker/compose.local.yml`
- `infra/docker/worker-python.Dockerfile`
- `docs/runbooks/local-deployment.md`

## 执行约束

1. 使用最新 business-agent profile，通过 `scripts/run-business-agent.sh` 新建会话执行。
2. Python、Worker、API、LibreOffice 和打印渲染检查全部在 Docker 中运行；禁止在宿主机直接运行 `uv`、
   Python、LibreOffice 或临时安装 Office 依赖。
3. 修改前列出预计修改文件、验收标准和测试命令。
4. 原始模板不可修改；修复前后都记录模板 SHA-256，并断言完全一致。
5. 不删除或覆盖用户现有 `storage/reports`、generated file 记录或原始上传文件；测试产物写入专用临时/测试目录。
6. 不顺便改写模板中的现有英文、拼写、标点、业务标准或其他区域版式。本任务只修复模板保真和打印裁切。

## 实现要求

### 1. 保留模板 rich text

1. 修复 `excel_report_writer.py` 的模板加载方式，使未被业务写入的 rich text cells 在保存后仍保留所有 runs。
2. 优先采用 openpyxl 3.1.5 已支持的 `rich_text=True`；不要用字符串硬编码重建 `C21`，也不要把模板正文复制到代码。
3. 修复必须对模板中的所有 rich text cells 生效，而不是只对坐标 `C21` 做脆弱特判。
4. Header、destination、pallet/carton 和 total 的现有写入逻辑保持不变。
5. 输出仍必须是标准、可由 Microsoft Excel 和 LibreOffice 打开的 `.xlsx`，不能转换成仅打印用 PDF 代替原报告。

### 2. 保持打印版式

生成文件必须继续匹配模板：

- worksheet `Sheet1`；
- used range `B1:P25`；
- merged range `C21:I25`；
- rows 21-25 高度；
- columns C-I 宽度；
- A4 (`paperSize=9`)；
- landscape；
- `scale=78`；
- `fitToPage` 和 page margins；
- 单页打印布局。

除非打印渲染证明确有另一个独立模板缺陷，否则不得改变上述设置，也不得通过扩大整个报表、缩小所有字体、
新增任意 print area 或把 Standards 移到第二页来规避 rich text 丢失。

### 3. Package-level 回归

新增测试从模板和生成文件的 XLSX package/worksheet 中读取 Standards cell，验证：

1. 生成文件仍包含 rich text `<r>` 与 run properties `<rPr>`，不是单一扁平 `<t>`。
2. 标题 11pt、正文 10pt；Arial/宋体 runs、bold、显式换行和完整文本与模板等价。
3. 最后一条标准完整保留，并以 `when stored.` 结束。
4. 不要求 shared string 与 inline string 的存储位置完全相同，但 normalized text/run style sequence 必须等价。
5. merge、row heights、column widths、page setup、margins 和 worksheet dimensions 与模板一致。
6. 修改 header/destination/total 后 rich text 仍保留，证明业务写入不会再次触发扁平化。

测试读取 generated workbook 时必须显式使用 `rich_text=True`，并可辅以 `zipfile` XML 断言；只比较
`worksheet["C21"].value` 的纯字符串不足以发现本回归。

## 强制打印视觉验证

### Docker 打印渲染

1. 使用真实 `CAAU8011090 UNLOADING PLAN.xlsx` fixture 经当前 parser/pallet/report pipeline 生成报告。
2. 在专用 Docker LibreOffice/Calc 视觉测试容器中，将原模板和生成报告以相同设置导出为 PDF。
3. 不为此永久增大 production API/Web image；可增加 profile-gated `report-visual-test` service 或等价测试容器。
4. PDF/PNG 产物写到工作区可查看的测试 artifact 目录；不得只留在 `--rm` 容器内部。
5. 验证模板和生成报告均为一张 A4 landscape 页面，Standards 区域不跨页、不出页面边界。
6. 将两份 PDF 的 Standards 区域渲染为原始分辨率 PNG，并使用图片查看工具逐张检查。
7. 视觉检查必须确认：标题、1.8M、2.0M、YEG1/YYC6 和完整第 3 条均可见，最后的 `when stored.` 未裁切。
8. 可使用 PDF text extraction/OCR 辅助断言，但不得用文本提取替代视觉检查；PDF 中存在 text object 不代表打印时没有裁切。

### Microsoft Excel 打印验收

在可用的办公室 Windows/Microsoft Excel 环境中执行最终 Print Preview：

1. 打开通过真实 API 下载的生成报告，而不是手工修改后的副本。
2. 保持 workbook 自带 print settings，不手动缩放修复。
3. 确认单页 A4 landscape 预览中 `Palletizing Standards` 全部可见。
4. 执行一次 Microsoft Print to PDF 或真实打印机打印，并核对最后一行。
5. 若当前执行环境没有 Microsoft Excel，只能标记 `Code Complete / Excel Print Verification Pending`，不得标记完整 Done。

## Full-stack 回归

1. 通过 Docker full stack 使用真实 fixture 导入、解析、生成并下载拆柜报告。
2. 从下载的 `.xlsx` 再执行 package-level 和打印渲染检查，不能只验证直接调用 writer 的临时文件。
3. 确认 generated file 状态、下载、SHA-256、文件大小、audit actor 和 storage path 仍正常。
4. 确认模板原文件、原始上传文件和历史 generated reports 未被修改。
5. 报告生成失败时保持现有 stable error contract；不得吞掉 parser/report error。

## i18n 硬门禁

本任务不需要新增 Web 可见文案。若新增错误、警告、状态或视觉测试入口：

1. Worker/API 只返回 stable code、结构化 details 和内部诊断，不返回拼接的双语 UI 文案。
2. Web 用户可见 message、button、tooltip、aria-label 必须同步进入 `en` / `zh-CN` catalog。
3. English 模板不得被自动混入中文，中文 UI 也不得显示 raw error code。
4. 不恢复 DOM translator、source-string reverse translation 或双语同时显示。

## 自动化命令

所有项目命令经 Docker Compose 执行，至少包含以下等价检查：

```bash
docker compose -f infra/docker/compose.local.yml up -d --build
docker compose -f infra/docker/compose.local.yml exec -T worker-python uv run pytest tests/unit/test_excel_report_writer.py
docker compose -f infra/docker/compose.local.yml exec -T worker-python uv run pytest tests/integration/test_batch_cli.py
docker compose -f infra/docker/compose.local.yml exec -T worker-python uv run pytest
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api typecheck
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api test:e2e
scripts/healthcheck.sh
git diff --check
```

此外必须执行专用 Docker report visual command，生成模板/报告 PDF 和 PNG。最终报告需写出准确命令，不能以
“LibreOffice 未安装”跳过；若缺少测试容器，本任务负责补齐可重复入口。

## 验收标准

1. 生成报告的 Standards rich text run sequence 与模板等价，正文不再继承错误的 11pt 单一字体。
2. `C21:I25` 的完整文字在 Excel 普通视图、LibreOffice PDF 和打印预览中全部可见。
3. PDF 为单页 A4 landscape，最后的 `when stored.` 清晰可见且未裁切。
4. 模板 SHA-256 不变；merge、row/column dimensions、page setup 和其他模板格式不回归。
5. Header、destination、pallet/carton、total 和 generated-file audit/download 不回归。
6. Worker unit/integration/full suite、API typecheck/E2E、full-stack health、package checks 和 `git diff --check` 全部通过。
7. i18n 规则通过，没有新增 hardcoded/bilingual 用户文案。
8. 提供真实生成 `.xlsx`、PDF、Standards crop PNG 的 artifact 路径和逐图视觉结论。
9. Microsoft Excel Print Preview/Print to PDF 通过后才可标记完整 Done。

## 不得关闭任务的情况

- 只增加 row height、改变 scale 或缩小字体，没有保留模板 rich text runs。
- 只检查 cell 纯文本值或文件可以打开。
- 只跑 unit tests，没有走真实 Worker/API 下载链路。
- 只生成 PDF/PNG但 Agent 没有逐张查看。
- Standards 最后一行仍被裁切，或报告变成两页。
- 模板本身被修改。
- Microsoft Excel 打印验证缺失却标记 Done。
- 因 Docker/LibreOffice 环境缺失而跳过打印验证。

## 完成输出

1. 根因和修复方式。
2. 修改文件列表。
3. 模板修复前后 SHA-256。
4. rich text/package/page setup 对比结果。
5. Docker 测试命令和结果。
6. 真实 API 下载报告、PDF、PNG artifact 的绝对路径。
7. Agent 逐图视觉检查结论和 Microsoft Excel 打印验收结果。
8. i18n 检查结果。
9. 已知限制；无则明确写“无已知 Palletizing Standards 显示或打印裁切问题”。
10. 更新任务索引和 `docs/reports/project-completion-status.html`；全部门禁通过前保持 Open/Partial。

## 2026-07-13 执行结果

- 状态：`Blocked / Business Decision Required`。rich-text 修复和除整本单页外的自动化均已完成，但当前真实 fixture 与既有 overflow 业务规则无法同时满足本 Task 的严格单页要求；不得标记 Code Complete 或仅剩 Excel 验收。
- 根因与修复：openpyxl 默认加载会把未写入的模板 rich text 扁平化；report writer 使用 `load_workbook(..., rich_text=True)`，对模板中所有 rich-text cell 保真，不硬编码 `C21`，不修改尺寸、字体、缩放或模板正文。
- Package 回归：生成文件保留 `<r>/<rPr>`；normalized run text/style 与模板等价，包含 11pt 标题、10pt Arial/宋体正文、bold、显式换行和末尾 `when stored.`。`B1:P25`、`C21:I25` merge、rows 21-25、columns C-I、A4 landscape、78% scale、fitToPage、margins 与 print area 均保持一致；header/destination/total 写入后仍保真。
- 模板 SHA-256：修复前后均为 `31a613e86a76447bfcbb308f1a23f6072dd1a5381f1992fbc0757a2735c92027`。
- 真实链路：`CAAU8011090 UNLOADING PLAN.xlsx` 已经 Worker batch 生成；full-stack Chromium E2E 使用仅改变柜号的真实结构副本完成登录、上传、解析、生成、列举和 API 下载，并核对 generated-file status、MIME、SHA-256、size、storage path 与 audit actor。API 下载文件的每个 populated worksheet 均与模板做完整 run property 和版式等价比较；本次上传原件 SHA、所有既有 original/report artifact SHA 和历史 generated-file DB 记录均保持不变。
- Docker 打印：模板为 1 populated worksheet/1 A4 landscape 页；当前真实 fixture 有 9 个目的仓，而模板只有 8 个 destination slots，HEAD 中已验收的 no-data-loss overflow 规则因此生成 2 populated worksheets/2 页。严格视觉脚本会完成 PDF/PNG 输出后返回 `UNLOAD-REPORT-01 single-page acceptance failed`，没有把“每 worksheet 一页”偷换成整本单页通过。
- 视觉结论：以原始分辨率逐张检查模板 1 张全页+crop、Worker 2 页全页+crop、API 下载 2 页全页+crop，共 10 张；每张标题、1.8M、2.0M、YEG1/YYC6、完整第 3 条和末尾 `when stored.` 均清晰可见，无跨页、越界或裁切。
- 最终 artifact：`/Volumes/xfl/logistics/stripSystem/test-results/unload-report-01/20260713T250000Z/`；真实 API 下载 workbook 为 `source/api-downloaded-report.xlsx`，PDF 位于 `pdf/`，全页和 Standards crop 位于 `png/`，storage/DB/template 不变证据位于该目录的 verification/snapshot 文件。
- 自动化：Worker focused unit/integration 16 passed、Worker full suite 124 passed、API typecheck、API E2E 15 suites/92 tests、Web lint/typecheck/189 unit tests/production build、专用 Chromium 1 passed；一键 Docker 的 Worker/API/package/storage/audit/渲染子门禁通过，最终严格整本单页门禁按预期以 2 worksheets/2 pages 返回非零。
- i18n：未新增 Web 用户可见文案、双语拼接、raw code 或翻译绕过；新增内容仅为测试、内部脚本和文档。
- 已知限制：无已知 Palletizing Standards 显示或打印裁切问题。真实 CAAU 整本为 2 页，违反本 Task “报告变成两页不得关闭”；需要不可推断的业务决定：A）保留 no-data-loss overflow，并把验收修订为每个 worksheet 单页；或 B）授权重新设计模板/报表数据布局以实现整本单页。作出决定并完成对应仓库工作后，才执行 Microsoft Excel Print Preview/Print to PDF。

## 2026-07-13 业务决定 A

- 业务方已明确选择 A：保留 no-data-loss overflow，验收语义修订为“每个 populated worksheet 各占一张 A4 landscape 页面”；当单个 worksheet 容量耗尽时允许生成后续 worksheet，不得丢弃目的仓。
- 目的仓超过当前映射行时，必须先使用拆柜报告业务表格中现有的白色可写单元格；只有这些可写位置也用尽后才创建后续 worksheet。不得写入标题、合计、`Palletizing Standards` 或其他非业务输入区域。
- 目的仓显示必须自适应行高并保留换行，长目的仓文字不得被裁切、覆盖相邻业务数据或侵入 `C21:I25` Standards 区域。
- 真实 `CAAU8011090 UNLOADING PLAN.xlsx` 的所有目的仓必须完整写入；Docker LibreOffice 和后续 Microsoft Excel 验收按“每个 populated worksheet 单页”检查，不再要求整个多 worksheet workbook 只能有一页。

## 2026-07-13 决定 A 实施结果

- 状态：`Code Complete / Excel Print Verification Pending`。仓库实现、当前环境自动化和逐图检查全部完成，仅剩办公室 Windows/Microsoft Excel 外部打印验收。
- 容量与分页：集中 cell map 保留既有偶数行 4/6/8/10/12/14/16/18，再使用白色业务行 5/7/9/11/13/15/17/19；第 17 个目的仓才创建 `Sheet2`，不写标题、合计或 `C21:I25`。真实 CAAU 的第 9 个目的仓 `贵司卡尔加里仓` 写入 `N5/O5/P5`，全部 9 个目的仓位于一个 populated worksheet。
- 长文字：目的仓继续保留 `wrap_text`，显式换行参与行数估算，主槽位和白色槽位均自适应行高；测试覆盖长英文地址和 `YYC4\nDoor A`。
- rich text/package：每个 populated worksheet 的 Standards run sequence 与模板等价，保留 `<r>/<rPr>`、11pt 标题、10pt Arial/宋体正文、bold、显式换行和末尾 `when stored.`；`B1:P25`、`C21:I25`、rows 21-25、columns C-I、A4 landscape、78% scale、fitToPage、margins 和 print area 不回归。
- 模板 SHA-256：修复前后均为 `31a613e86a76447bfcbb308f1a23f6072dd1a5381f1992fbc0757a2735c92027`。
- 真实链路：Worker batch 与 full-stack Chromium 完成真实结构 CAAU 上传、解析、生成、列举和 API 下载；generated-file status/MIME/SHA/size/storage/audit actor、上传原件 SHA、既有 original/report artifact 和历史 generated-file DB 记录不变检查全部通过。
- 自动化：Worker focused 19 passed、Worker full 127 passed；API typecheck 与 15 suites/92 E2E passed；Web lint/typecheck 与 189 tests passed；API/Web production build、full-stack health、Compose config、脚本语法、package/视觉门禁和 `git diff --check` passed。合成边界工件证实 16 个目的仓含末行三行文本仍为 1 worksheet/1 page，第 17 个目的仓为 2 worksheets/2 pages。i18n 未新增用户可见文案，Web localization tests 包含在 189 项中。
- 视觉工件：`/Volumes/xfl/logistics/stripSystem/test-results/unload-report-01/20260714T050519Z/`。模板、Worker 报告、API 下载和 16 目的仓边界工件各为 1 个 populated worksheet/1 张 A4 landscape PDF，17 目的仓溢出工件为 2 worksheets/2 pages；6 张全页和 6 张 Standards crop 已按原始分辨率逐张查看，长目的仓、合计、标题、1.8M、2.0M、YEG1/YYC6、完整第 3 条和末尾 `when stored.` 均清晰，无裁切、越界或跨 worksheet 拆页。真实 API 下载文件为 `source/api-downloaded-report.xlsx`。
- 外部验收：在办公室 Windows/Microsoft Excel 中打开上述 API 下载文件，保持 workbook 自带 print settings，不手动缩放，完成 Print Preview 和 Microsoft Print to PDF，并逐页核对 `when stored.`。通过前不得标记 Done。
- 已知限制：无已知 Palletizing Standards 显示或打印裁切问题；仅 Microsoft Excel 外部打印验收待完成。
