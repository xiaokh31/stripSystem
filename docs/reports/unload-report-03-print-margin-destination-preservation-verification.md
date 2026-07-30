# UNLOAD-REPORT-03 Print Margin and Destination Preservation Verification

## 状态

`SUPERSEDED_BY_UNLOAD_REPORT_04_AND_05`

本文记录的报告内容、目的仓守恒、分页和打印几何自动化仍有效。2026-07-29
用户发现同一柜号成功重新生成报告后，普通文件区域会追加历史报告，而不是替换当前
报告；随后又澄清白色追加行只应在每页目的仓超过 8 个时启用。两项问题使原“只剩
Excel/打印外部门禁”的终态失效，现分别由 `UNLOAD-REPORT-04` 和
`UNLOAD-REPORT-05` 承接。04 已于 2026-07-30 完成唯一 current 文件、失败守恒和
历史审计；05 已完成自适应主行/白行布局及当前环境全部自动化，状态为
`CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING`。03 的 Excel/实际打印门禁必须
使用 05 生成的新当前报告文件完成；不得先把 03 标记为 `DONE`。

## 2026-07-29 后续回归通知

- 修复前 `ReportsService` 每次成功生成都会创建新的 UUID attempt directory 和新的
  `GeneratedFile`；普通 `listFiles` 返回全部历史记录，Web 只排序不选择每类型
  current，因此文件区域出现多份报告。
- 修复前 label 路径和 generated-file upsert 也没有与报告共享同一套“每柜每类型唯一
  当前文件、失败不覆盖”的数据库约束。
- 新产品口径要求普通文件区域最多一份当前拆柜报告和一份当前托盘面单；成功重生成
  替换对应 current slot，失败保留旧 current，历史仍可审计但不显示为当前。
- 权威修复任务：
  `prompts/tasks/UNLOAD-REPORT-04Current Report and Label Replacement Regression.md`。
  该 Task 已 `DONE`，验证报告为
  `docs/reports/unload-report-04-current-artifact-replacement-verification.md`。

## 2026-07-29 主行/白色行布局澄清

- 模板深色/灰色主行为 `4/6/8/10/12/14/16/18`，白色追加行为
  `5/7/9/11/13/15/17/19`。
- 本报告的 `report-8` 自动化工件把 8 条目的仓写入 `4..11`，因此提前使用了白色
  行。该工件仍可证明旧实现的守恒和打印几何，但不能作为最终业务布局通过证据。
- 正确规则为：每页 `1–8` 条只写深色主行；`9–16` 条才切换为 `4..19` 的纸面
  连续扩展布局；17+ 以 16 为容量分页，随后每页独立选择模式。
- 权威修复任务
  `prompts/tasks/UNLOAD-REPORT-05Adaptive Primary and White Cell Layout.md`
  已完成当前环境实现与自动化。最终 Microsoft Excel/实际打印必须按
  `docs/reports/unload-report-05-adaptive-primary-white-layout-verification.md`
  使用 05 新工件，不得使用本报告的 `report-8` 作为签字依据。

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
- 原分辨率检查还发现旧 cell-map 读取顺序会使纸面显示 1、9、2、10……；03 实现
  改为第 4–19 行自上而下使用，解决了扩展布局错序，但把该映射错误应用到了
  `1–8` 条主行模式。05 必须保留扩展模式纸面顺序，同时恢复少量目的仓只用深色
  主行。

## 实现与安全契约

- 03 已证明 16 个灰/白业务槽位可容纳在一个 worksheet，17、32、33 条可按
  `16+1`、`16+16`、`16+16+1` 分页；但 05 必须增加 mode-aware row map：
  每页 `1–8` 只用深色主行，`9–16` 才使用全部 16 行。
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
