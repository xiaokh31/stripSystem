# 执行 UNLOAD-REPORT-02：Adaptive Cell Height and Printed Notes Regression

## 优先级与状态

- 优先级：P0，拆柜报告屏幕和打印内容裁切会造成现场信息缺失。
- Task-Status: CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING
- 前置任务：`UNLOAD-REPORT-01` 保持历史完成证据，但其“无已知裁切问题”结论
  已被 2026-07-25 现场反馈推翻。
- 本 Task 是新的可见内容/打印回归，不得重跑或简单恢复 01 的旧结论。
- 只执行本 Task。达到终态后更新 Task、Index、完成度报告和 `HANDOFF.md`。

## 对应现场反馈

1. 生成拆柜报告后，单元格内容较多时行高没有随内容增长，文字显示不全。
2. 报表底部备注/Palletizing Standards 在工作表普通视图中现在可以显示完整，
   但打印或 Print to PDF 后仍然显示不全。

## 产品结论

修复必须同时解决“工作表可见”和“打印可见”。不能只设置 `wrap_text`、只增大
固定行高、只改变缩放比例、只检查 XML 中存在文字，或只在 Agent 当前的
LibreOffice 中看起来正常。

每个 populated worksheet 继续对应一张 A4 landscape 打印页。若长内容使当前页
在最低可读版式下无法容纳全部业务行，必须减少该 worksheet 的业务行数量并将剩余
目的仓放入下一张复制 worksheet；不得裁切、重叠、缩小到不可读或侵入底部备注区域。

## 必须读取与使用

- `AGENTS.md`、`HANDOFF.md`
- `prompts/agents/business-logic-agent.md`
- `prompts/tasks/UNLOAD-REPORT-01Palletizing Standards Rich Text Print Clipping Regression.md`
- `.codex/skills/bestar-handoff/SKILL.md`
- `.codex/skills/unloading-report-generator/SKILL.md`
- `.codex/skills/unloading-excel-parser/SKILL.md`
- `.codex/skills/nestjs-prisma-api/SKILL.md`
- `.codex/skills/docker-local-deploy/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- `apps/worker-python/src/worker_python/reports/excel_report_writer.py`
- `apps/worker-python/src/worker_python/reports/cell_map.py`
- `apps/worker-python/tests/unit/test_excel_report_writer.py`
- report Worker/API/full-stack/visual scripts and tests
- `samples/templates/卸柜报告-En.xlsx`
- `samples/reports/EGSU9302760卸柜报告-En.xlsx`
- `samples/unloading-plans/CAAU8011090 UNLOADING PLAN.xlsx`
- 最新可取得的现场失败生成文件；若含客户数据，先明确脱敏，不得写入 Task/HANDOFF

## 先做只读复现和版式清单

修改前输出脱敏诊断：

1. 记录模板 SHA-256、sheet、used range、merged ranges、row heights、column
   widths、字体/字号/alignment、page setup、print area、page margins 和
   manual page breaks。
2. 对所有由 writer 写入的可见 cell 建立 inventory，不能只检查 `C/N` 两列。
3. 区分：
   - 普通单元格；
   - 合并单元格；
   - explicit newline；
   - ASCII/CJK/数字/长无空格 token；
   - rich text；
   - 底部备注/Palletizing Standards。
4. 用当前生产 writer 生成至少四种可重复失败/边界工件：
   - 长英文目的仓/地址；
   - 长中文目的仓；
   - 多行换行内容；
   - 16 行容量边界，其中末行也是长内容。
5. 在 Docker LibreOffice 中导出 PDF 并查看全页及相关 crop，记录裁切发生在
   worksheet height、merged cell、print area、page break、scale 还是 Office
   renderer 差异。不得先猜原因再改。

## 实现要求

### 内容感知行高

1. 抽出可测试的 row-layout calculator，输入至少包含：
   - cell visible value；
   - effective printable width（合并范围使用合并总宽度并扣除 margin/padding）；
   - 实际字体/字号/bold；
   - wrap/indent/rotation；
   - explicit newline；
   - ASCII、CJK、空格和长 token。
2. 行高从模板原始高度开始，只增不减，并设置有解释的上下限。
3. 一行多个可见 cell 时取全部 cell 所需高度的最大值。
4. Excel 对 merged cell 不可靠自动适配；合并内容必须显式计算，不得依赖
   `bestFit` 或打开 Excel 后人工 AutoFit。
5. 目的仓主行和白色追加行使用同一算法。超过单行安全上限时必须保留全部文字，
   通过分页/下一 worksheet 解决，不截断字符串。
6. 不改变业务值、托数、箱数、合计、目的仓顺序或现有 16 槽 no-data-loss 语义。

### 底部备注和打印分页

1. 保留 `Palletizing Standards` 的 rich text run、完整文本、字体、换行和 merge；
   不把正文硬编码到 Python。
2. 显式保证底部备注区域在 print area 内，并为实际 rich text 计算/保留足够高度。
3. 统一 page setup contract：
   - A4 landscape；
   - 一页宽；
   - 每个 populated worksheet 一页高；
   - 可读 scale/fit contract；
   - print area 覆盖完整业务表和备注；
   - 不产生意外 manual page break。
4. 若增长后的业务行会挤压备注或产生第二打印页，layout planner 必须在写入前减少
   本 sheet 的目的仓数量并复制下一 worksheet。每张 sheet 都保留完整 header、
   total 和 Standards。
5. 第 17 个及更多目的仓继续安全分页；长内容可能提前分页，这是防裁切行为，不是
   数据丢失。
6. 不通过缩小字体、删除换行、缩短备注、隐藏行列或修改原模板来达成单页。

### 模板和生成记录

1. 原模板只读，修复前后 SHA-256 完全一致。
2. 生成文件仍通过现有 generated-file、storage、download 和 audit 记录。
3. Writer/API 失败必须返回稳定 code 和结构化 details，不能吞异常或留下
   SUCCESS 空文件。
4. 历史生成报告不批量改写；新生成/明确重新生成的版本使用新算法。

## Strict i18n 硬门禁

1. 本 Task 若不新增 Web 文案，也必须跑现有 catalog parity/unmanaged-string gate。
2. 新增生成失败、内容过长、分页或打印提示时，Worker/API 只返回 stable code、
   field/sheet/row details，不返回普通 UI 直接显示的英文句子。
3. Web visible error、action、tooltip、aria/title、empty state 必须同步加入 typed
   `en` / `zh-CN` catalog。
4. 生成的英文模板内容属于模板业务内容，不得因中文 UI 被拼接中文；UI system
   copy 仍只显示当前一种语言。
5. 不恢复 DOM translator、source-string reverse translation 或 raw code display。

## 自动化与视觉门禁

### Worker/package

1. 覆盖 ASCII、CJK、multiline、长 token、merged width、不同字号和同一行多 cell。
2. 断言生成 row height 是 deterministic，模板高度不缩小。
3. 断言 16 条普通短内容仍一 sheet；长末行不会裁切；超出 printable height 时
   提前分页且所有目的仓按顺序只出现一次。
4. 逐 sheet 比较 rich text、merge、format、print area、page setup 和 totals。
5. 生成 package 可由 openpyxl 和 LibreOffice 打开，无 repair warning。

### Docker LibreOffice

1. 真实 CAAU fixture、API 下载文件和四个长内容边界工件全部导出 PDF。
2. 每个 populated worksheet 对应一张 A4 landscape 页。
3. PDF text extraction 证明最后一个长内容和 Standards 最后一句均存在。
4. 渲染全页和裁切区域 PNG；Agent 必须用图片工具逐张按原分辨率查看。
5. 视觉断言：长内容、托数/箱数、total、完整 Standards、最后一行均清晰，
   不重叠、不越界、不跨到不可见页。

### Full stack

1. 从真实结构 fixture 经 nginx 上传、parse、generate、list、download。
2. 对 API 下载的 bytes 重跑 package/PDF/PNG 门禁。
3. 核对 generated-file status/MIME/SHA/size/storage containment/audit actor。
4. fixture、账号、DB、storage 使用唯一前缀并在成功/故意失败后精确清理。

### Microsoft Excel 外部验收

在办公室 Windows/Microsoft Excel：

1. 打开真实 API 下载文件，不手动 AutoFit 或改缩放。
2. 普通视图逐 sheet 检查所有长内容。
3. Print Preview 逐页确认底部备注、最后一句和最后一条目的仓完整。
4. Microsoft Print to PDF，并与预览/原文件逐页核对。
5. 若当前 Agent 没有 Microsoft Excel，必须先完成所有自动化实现，再以
   `CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING` 结束；不得把缺 Excel 当成
   提前停止实现的理由，也不得伪报 `DONE`。

## Docker-only 命令

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

必须另执行/新增一个可重复的 Docker report visual runner。不得在宿主运行 Python、
`uv`、LibreOffice、pnpm 或临时安装依赖。

## 验收标准

1. 所有 writer 写入的长可见内容在普通视图完整显示，不只修复某个固定 cell。
2. merged cell、CJK、多行和长无空格文本得到确定性正确行高。
3. 每个 populated worksheet 打印为一张 A4 landscape 页，底部备注和最后一句完整。
4. 内容过高时安全提前分页，不裁切、不丢目的仓、不破坏顺序/合计。
5. 原模板 SHA、rich text、untouched cells、generated-file/audit/download 不回归。
6. Docker Worker/API/Web/full-stack/package/PDF/PNG、i18n、cleanup、healthcheck 和
   `git diff --check` 全部通过。
7. Agent 提供 API 下载 `.xlsx`、PDF、全页/裁切 PNG 路径和逐图结论。
8. Microsoft Excel Print Preview/Print to PDF 通过后才可 `DONE`；否则只能是准确的
   external verification pending 状态。

## 2026-07-26 执行结果

仓库实现和当前环境全部自动化已完成。content-aware row-layout calculator、
printable-height layout planner、稳定 `REPORT_CONTENT_TOO_TALL` 错误、完整 rich text、
逐页 A4 landscape contract、真实 API 下载链路和失败安全精确清理均已交付。没有
schema 变更或新 migration。

验证结果：

- Worker 聚焦 19 passed；全量 192 passed。
- API lint/typecheck/build、382 unit、129 E2E、36 migrations up to date。
- Web lint/typecheck/build、283 tests（含 strict i18n hard gate）。
- `REPORT_VISUAL_RUN_ID=20260726T074500Z-final
  scripts/verify-unload-report-02.sh` 通过。
- 11 个 PDF 页面均为 A4 landscape 且与 populated worksheet 一一对应。
- 全部 33 张全页/业务表/Standards PNG 已按原分辨率逐张检查，无裁切、重叠、
  越界或数据丢失。
- 模板 SHA-256 修复前后均为
  `31a613e86a76447bfcbb308f1a23f6072dd1a5381f1992fbc0757a2735c92027`。
- 最终 API 下载工件：
  `test-results/unload-report-02/20260726T074500Z-final/source/api-downloaded-report.xlsx`。
- 完整证据见
  `docs/reports/unload-report-02-adaptive-layout-verification.md`。

唯一剩余项是在办公室 Windows/Microsoft Excel 打开上述 API 下载文件，不使用
AutoFit 或修改 print settings，完成逐 sheet 普通视图、Print Preview 和 Microsoft
Print to PDF 核对及业务签字。外部验收通过前不得改为 `DONE`。
