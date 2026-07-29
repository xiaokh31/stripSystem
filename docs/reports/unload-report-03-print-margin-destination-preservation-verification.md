# UNLOAD-REPORT-03 Print Margin and Destination Preservation Verification

## 状态

`CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING`

仓库实现和当前环境可自动化的 Definition of Done 已完成。当前环境没有 Windows
Microsoft Excel 和办公室目标打印机，因此只有本文末尾列出的 Excel/实际打印外部
门禁尚未执行；完成这些门禁前不得把 Task 标记为 `DONE`。

## 诊断结论

- 最新现场失败原件未提供，本次没有伪称复现用户那一份具体文件。
- 现有真实结构 fixture 从 parser、persisted destinations、pallet plans、Worker
  workbook 到 API 下载文件均为 9 条；诊断基线未在该 fixture 上发现目的仓丢失。
- 02 的 page planner 对 16 条正常长度数据按估算高度提前生成 4 个 worksheet，确认
  其分页策略违反“先用完 16 个合法槽位”的产品规则。
- 02 固定缩放输出的左侧可见业务边缘为 18.415mm，模板为 22.225mm，向纸边偏移
  3.810mm，超过 `-2mm` 容差。
- 单一 fit-to-page contract（清除 stale scale，`fitToWidth=1`、
  `fitToHeight=1`、`fitToPage=true`、print area `A1:P25`）恢复模板留白。
- 原分辨率检查还发现旧 cell-map 读取顺序会使纸面显示 1、9、2、10……；最终实现
  改为第 4–19 行自上而下使用，并让独立 package inspector 按物理打印顺序核对，
  避免 writer 与 validator 使用同一错误顺序而伪通过。

## 实现与安全契约

- `DESTINATION_ROWS` 的 16 个灰/白业务槽位全部可用，`0–16` 条只生成一个
  worksheet；17、32、33 条严格为 `16+1`、`16+16`、`16+16+1`。
- canonical identity 包含 ordinal、destination（缺失时使用既有明确 placeholder）、
  `finalPallets` 和 `totalCartons`；保存后重新打开最终 workbook，从 `N/O/P` 和
  `C == N` 反算 written rows、ordered digest、每页 total 与 global total。
- `writtenDestinationCount` 来自保存后验证。planning/write/save/reopen 任一不一致
  返回 `REPORT_DESTINATION_CONSERVATION_FAILED`；极端不可读长文本返回
  `REPORT_LAYOUT_REVIEW_REQUIRED`。
- Worker 使用临时文件和原子替换；API 每次生成使用独立 attempt directory。失败只
  新增 `FAILED` generated-file 证据，不覆盖上一份成功文件、SHA 或下载内容。
- manifest/API evidence 只保存 expected count、written count 和 ordered digest，
  不把目的仓清单复制到日志或本文。
- Web 对 conservation/layout stable code 提供 en/zh-CN typed mapping，unknown code
  使用本地化 fallback，不显示 raw code、Worker message、stack 或 storage path。
- 未修改 Prisma schema，不需要 migration。

## 最终自动化证据

最终唯一有效运行：

`test-results/unload-report-03/20260729T070000Z-final`

独立 nginx 守恒故障注入运行：

`test-results/unload-report-03-conservation/20260729T070000Z-final`

真实结构 API 下载证据：

- expected destination count：9
- saved/downloaded written destination count：9
- ordered digest：
  `4c8b9bd5746d06847d20081778ec43ce35a1f3606dd9b63330bed6f87825e679`
- worksheet count：1
- `C == N`、template layout、page contract：全部通过
- generated-file status/MIME/SHA/size/storage containment/actor、original upload
  SHA 和下载权限：通过

负向和清理证据：

- 真实极端文本经 nginx 返回 `REPORT_LAYOUT_REVIEW_REQUIRED`，
  stage `planning.layout-review`。
- Docker 进程级测试 fixture 让同柜号第一份报告真实成功、第二次生成返回
  `REPORT_DESTINATION_CONSERVATION_FAILED`，stage `reopen.row`；旧成功下载保持
  不变，失败 attempt 有独立 `FAILED` 记录且无不完整文件。注入只修改临时 API
  容器中的 `uv` 包装器，随后精确恢复；生产 Worker/API 没有故障开关。
- intentional exit、layout、conservation 和 success fixtures 均精确清理：
  `failure_probe_residual=0`、`conservation_probe_residual=0`、
  `success_residual=0`、`admin_residual=0`。
- storage 和 generated-files 前后 digest 恢复一致。
- 模板 SHA-256 前后均为
  `31a613e86a76447bfcbb308f1a23f6072dd1a5381f1992fbc0757a2735c92027`。

## 分页、几何与逐图结论

固定 200 DPI 渲染共检查 20 张 generated pages：

- 模板左侧 whitespace：22.225mm
- 所有 generated pages：22.225mm
- delta 范围：0.000mm 至 0.000mm
- `-2mm` 容差：20/20 通过
- 所有页面均为 A4 landscape；每个 populated worksheet 恰好一张 PDF 页，无空白
  打印页。

分页结果：

| Case | Worksheets / pages |
| --- | --- |
| 0 / 1 / 8 / 9 / 16 | 1 |
| 17 | 2 (`16+1`) |
| 32 | 2 (`16+16`) |
| 33 | 3 (`16+16+1`) |

使用图片工具按原分辨率查看了模板、真实结构 Worker、API 下载、9/16/17/32/33、
重复目的仓、长英文、CJK、multiline、长 token、末行长内容的全页、左边缘、
DEST/PLT/CTN 和 Standards 高信号 crops。结论：

- 左侧边框与模板留白一致，无贴边或裁边；
- 目的仓按纸面自上而下顺序出现，重复名称的三条 PLT/CTN 分别保留；
- 17/32/33 没有跳项、重复或跨页混排；
- 长文本保持换行且没有覆盖 total、表头或 Standards；
- Standards、边框、total 和未使用业务槽位完整，无重叠或打印空白页。

## Docker 验证

- Worker focused：29 passed
- Worker full：207 passed
- API lint、typecheck、build：通过
- API unit：383 passed / 49 suites
- API E2E：129 passed / 21 suites
- Web lint、typecheck、production build：通过
- Web unit：284 passed
- `scripts/verify-unload-report-03.sh`：故意退出探针、正常 nginx full-stack、
  layout failure、conservation failure、Worker/package/PDF/PNG、清理和残留审计通过
- `scripts/healthcheck.sh`：通过
- Prisma migrate status：全部 migrations 已应用
- `git diff --check`：通过

## 外部 Microsoft Excel / 实际打印门禁

在办公室 Windows/Microsoft Excel 使用最终 API 下载文件，不执行 AutoFit，不手动
修改 margins、scale、print area 或 borderless 设置：

1. 记录 Excel 版本、A4 纸张和默认 printer profile；普通视图逐 sheet 核对脱敏
   expected list 与每条 DEST/PLT/CTN/total。
2. 使用 `<=16` 条正常业务数据确认只有一个 populated worksheet，Print Preview
   只有一张 A4 landscape，16 个槽位全部可用且没有提前分页。
3. 逐页确认左侧白边、所有边框、目的仓和完整 Standards 可见。
4. Microsoft Print to PDF 后复跑目的仓逐项和 left-whitespace machine check。
5. 使用办公室实际打印配置打印模板与生成报告，并排确认左侧留白，由办公室人员
   记录结论。

外部记录不得包含账号、凭据、客户原始明细或未脱敏个人信息。上述门禁全部通过后，
才可把 UNLOAD-REPORT-03 更新为 `DONE`。
