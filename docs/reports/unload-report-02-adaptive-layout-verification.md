# UNLOAD-REPORT-02 Adaptive Layout Verification

## 2026-07-28 外部验收失败通知

办公室实际生成/打印确认：

1. 打印页左侧原有白色留边消失；
2. 生成报告存在目的仓缺失。
3. 正常报告必须保留模板完整 16 槽可用容量，未用槽位保持空白；`0–16` 条应保持
   一个 populated worksheet/一张 A4，不能按估算高度提前分页。

因此，本报告下方 2026-07-26 的 `CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING`
结论只保留为历史 Docker/LibreOffice 证据，不能再用于关闭 02。现有证据虽然证明
package 中保留 `pageMargins.left`、LibreOffice 工件可见且测试输入数量与结果对象
数量相同，但没有程序化比较模板与生成页的实际左侧 whitespace，也没有从保存后
工作簿逐项反算 `N/O/P` 目的仓、托数和箱数守恒；02 的 height-based early
pagination 也不符合最新容量优先业务规则。

权威修复任务：
`prompts/tasks/UNLOAD-REPORT-03Print Margin and Destination Preservation Regression.md`。
02 已被 03 替代，不得只补外部签字后标记 `DONE`。

验证日期：2026-07-26 MDT

## 结论

UNLOAD-REPORT-02 已完成仓库实现和当前环境可自动化的 Definition of Done，状态为
`CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING`。生成器现在根据实际可见内容、
合并宽度、字体、字号、粗体、换行、缩进和字符类型确定行高；模板行高只增不减。
当目的仓内容的打印高度超过单张工作表预算时，生成器会在写入前提前分页，保留原有
顺序、业务值、托数、箱数、合计和每页完整 `Palletizing Standards`。

模板未修改，修复前后 SHA-256 都是
`31a613e86a76447bfcbb308f1a23f6072dd1a5381f1992fbc0757a2735c92027`。
本 Task 没有 schema 变更，因此没有新增 migration。

## 实现摘要

- 新增独立且可测试的 row-layout calculator，覆盖 ASCII、CJK、全角字符、数字、
  空格、显式换行、长无空格 token、rich-text run、merged width、字号和粗体。
- 对 writer 写入的所有可见单元格计算所需高度；同一行采用最大需求值。
- 保持既有 16 槽语义，但同时使用 printable-height budget 规划每张工作表；长内容
  可触发少于 16 条的提前分页。
- `Palletizing Standards` 继续来自模板，保留 24 个 rich-text run、字体、换行和
  `C21:I25` merge；五行明确分配计算高度并采用顶部对齐，避免 fit-to-page 后下移裁切。
- 每个 populated worksheet 固定 A4 landscape、fit width/height 1、78% scale、
  print area `B1:P25`，不产生手工分页符。
- 单个内容超过安全上限时返回稳定错误码 `REPORT_CONTENT_TOO_TALL` 和结构化 details，
  不生成伪成功空文件。

## 自动化证据

- Worker 聚焦测试：19 passed。
- Worker 全量测试：192 passed。
- API：lint、typecheck、build 通过；49 suites / 382 unit 和
  21 suites / 129 E2E 通过。
- Web：lint、typecheck、production build 通过；283 tests 通过，其中包含现有
  typed catalog parity 和 unmanaged-string hard gate。
- Prisma：36 migrations，database schema up to date。
- 全链路 runner：
  `REPORT_VISUAL_RUN_ID=20260726T074500Z-final scripts/verify-unload-report-02.sh`
  通过。
- 全链路经 nginx 使用真实 `CAAU8011090 UNLOADING PLAN.xlsx` 完成 upload、parse、
  generate、list、download；下载文件 MIME、SHA、size、generated-file、storage
  containment、audit actor 和原始上传 SHA 均通过。
- 故意失败探针到达预期 checkpoint；失败和成功路径的临时用户、数据库记录、storage
  文件及 generated-file digest 均精确恢复，残留为 0。

## PDF/PNG 视觉证据

最终证据根目录：

`test-results/unload-report-02/20260726T074500Z-final/`

主要工件：

- API 下载 Excel：
  `source/api-downloaded-report.xlsx`
- Worker 真实 CAAU Excel：
  `source/worker-generated-report.xlsx`
- PDF：`pdf/`
- 全页、业务表和 Standards crop PNG：`png/`
- package/生成记录证据：`source/api-verification.json`
- 页数、页面尺寸和路径清单：`visual-verification.txt`
- 清理、actor、原始上传和模板 SHA 证据：
  `cleanup-verification.txt`、`database-audit-verification.txt`、
  `original-upload-verification.txt`、`template-sha256.txt`

Docker LibreOffice 共渲染 11 个页面：API 下载 1 页、Worker CAAU 1 页、模板 1 页、
16 槽长末行边界 1 页、长英文 1 页、长中文 1 页、显式多行 1 页、打印高度溢出
4 页。每页均为 A4 landscape，页数与 populated worksheet 一致。

Agent 已按原分辨率检查全部 33 张 PNG（每页全页、业务表 crop、Standards crop）。
长内容、最后一个目的仓、PLT、CTN、合计及 Standards 最后一句均完整清晰；没有重叠、
越界、裁切或不可见的额外页。`height-overflow` 保持全部 16 个目的仓且按顺序只出现
一次，并安全分为 4 页。

## Microsoft Excel 外部验收

当前环境没有 Microsoft Excel，以下是唯一剩余验收：

1. 在办公室 Windows/Microsoft Excel 打开最终 API 下载文件
   `test-results/unload-report-02/20260726T074500Z-final/source/api-downloaded-report.xlsx`，
   不执行 AutoFit，也不改变缩放或打印设置。
2. 普通视图逐 sheet 检查所有目的仓、PLT、CTN、合计和完整 Standards。
3. Print Preview 逐页确认每个 populated worksheet 恰好一张 A4 landscape，
   最后一条目的仓和 Standards 最后一句完整。
4. 使用 Microsoft Print to PDF 导出，再逐页与预览和原文件核对并记录业务签字。

在上述外部验收通过前，本 Task 不得标记 `DONE`。
