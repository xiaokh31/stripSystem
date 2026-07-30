# UNLOAD-REPORT-04 Current Report and Label Replacement 验证报告

## 结论

`UNLOAD-REPORT-04` 在 2026-07-29/30 的当前环境完成仓库实现和自动化
Definition of Done。普通柜子文件区域现在固定为“当前拆柜报告”和“当前托盘面单”
两个业务槽位；同一柜号、同一目标文件类型最多一条 `GENERATED` current 记录。
成功重生成会创建新的不可变 current 记录并把旧记录标为 `SUPERSEDED`，失败、
并发和重试不会覆盖上一份成功 bytes。

本 Task 不修改拆柜报告深色/白色目的仓行布局，也不代替 Windows Microsoft Excel、
Print to PDF 或办公室实际打印验收。上述仓库布局工作已由后续
`UNLOAD-REPORT-05` 单独完成；其 Microsoft Excel/实际打印仍为外部门禁。

## 修复前诊断

- 主库只读基线中，目标类型共有 31 条 `EXCEL_REPORT/GENERATED` 和 142 条
  `PALLET_LABEL_PDF/GENERATED`；按柜号和文件类型分组的重复 current 组为 0。
- 数据库原先没有目标类型的 partial unique/current 约束。
- 报告每次新增 `generated_files` 行，普通 list API 返回全部历史；Web 只排序，
  因而重生成后追加显示。
- 面单曾写固定 PDF 路径，失败分支可能更新最近成功记录，无法证明数据库提交前的
  bytes 守恒。

## 实现结果

### 数据库与审计

- 新增 `generated_file_replacements` 不可变替换审计，记录 old -> new、actor、
  file type、时间和 reason code。
- 新增 PostgreSQL partial unique index，只约束
  `EXCEL_REPORT`/`PALLET_LABEL_PDF` 且 `status = 'GENERATED'` 的
  `(container_id, file_type)`。
- 报告和面单统一通过 current-artifact 服务，在事务锁内 supersede 旧 current、
  新建不可变 current 并写替换审计；历史 async job 不会漂移到新 bytes。
- 两个 migration 已在现有库和空库从零执行；最终主库共 38 个 migration，
  `prisma migrate status` 为 up to date。

### Storage、失败守恒与下载

- 报告和面单 Worker 都只写柜号下的唯一 UUID attempt directory。
- Worker 输出先经过扩展名、storage containment、报告守恒/layout 或面单 QR
  payload 校验，再在数据库事务中激活。
- Worker、QR、守恒、数据库激活失败均创建独立 `FAILED` 审计记录并清理本次
  staging；旧 current 状态、SHA、下载 bytes 和另一个业务槽位不变。
- 旧成功 bytes 保留在其不可变 UUID 路径，记录改为 `SUPERSEDED`；普通 list API
  不返回历史或失败记录，普通旧 file ID 下载以稳定
  `GENERATED_FILE_SUPERSEDED` fail closed。
- public DTO 只返回安全文件名和业务元数据，不返回绝对 storage path、Worker
  exception 或内部 error message。

### 既有重复数据 repair

- `repair-current-generated-files` 默认 dry-run，`--apply` 才写库。
- 只处理报告和面单，逐项验证 realpath containment、符号链接、可读性、SHA 和
  shared path；按稳定的时间/ID 顺序选择最近可验证成功版本。
- 专用重复 fixture 的 dry-run 和 apply 均选中
  `report04-repair-winner`，把旧记录改为 `SUPERSEDED`，写入
  `VERIFIED_STORAGE_REPAIR` replacement audit；repair 后重复 current 组为 0。
- 全部候选无效时槽位保持为空并输出 stable finding，不伪造 current。
- 生产维护的备份、停写、dry-run、逐组 winner 核对、apply、migration、验证和
  回滚步骤见
  `docs/runbooks/current-generated-artifact-production-repair.md`。当前工具会处理
  dry-run 列出的全部重复组；任一 winner 未获确认时不得执行 `--apply`。

### Web 与 i18n

- 柜子详情固定渲染两个槽位；未生成时显示本地化 empty state，不伪造下载。
- refresh 始终从服务端 current state 重取，不在客户端 append。
- 已 supersede 的旧选择链接解析到同类型 current 槽位并显示本地化替换说明；
  不形成 404 循环或跨类型跳转。
- 新增文案和 stable code 均进入 typed `en`/`zh-CN` catalog；direct load、
  refresh、语言切换、light/dark、desktop/mobile 和真实浏览器 200% zoom
  均通过。

## 专用 full-stack 证据

专用 runner：

```text
scripts/verify-unload-report-04.sh
```

成功 artifact：

```text
test-results/unload-report-04/20260730T002842Z-36190
```

关键结果：

- 真实 Excel upload/import、nginx、API、BullMQ 和 Worker 全链路通过。
- 报告生成两次、面单生成两次后 `slotCount = 2`。
- 随后并发提交两次报告和两次面单，数据库和 UI 最终仍恰好两个 current。
- 当前报告和面单下载 SHA 均与各自最后一次成功 generation 对应；首次和第二次
  SHA 不同，证明实际替换 bytes，而非只改 UI。
- async job 的 `generatedFileId` 指向各自 generation，旧 ID 不漂移。
- 旧 report file ID 普通下载被稳定拒绝，旧页面选择链接落到新 current 行。
- migration fixture、repair dry-run/apply、partial unique index、重复 current
  SQL 计数、empty database migration 和双层 cleanup 全部通过。
- 12 张截图覆盖 en/zh-CN × light/dark × desktop/mobile/真实 200% zoom。
  原尺寸逐图检查确认两个 current 行、语言纯净、控件可读，无重复卡片、遮挡或
  页面级横向 overflow；截图结论同时由 DOM、API 和数据库计数断言支撑。

## 回归与全量门禁

- API build、lint、typecheck 通过。
- API unit：49 suites，387/387 通过。
- API E2E：21 suites，129/129 通过。
- Task 聚焦 API：报告/面单 21/21 通过。
- Web lint、typecheck、production build 通过；unit 284/284 通过。
- Worker pytest：207/207 通过。
- `scripts/verify-unload-report-03.sh` 通过，artifact：
  `test-results/unload-report-03/20260730T011452Z`。
  0/1/8/9/16 条仍为一张 A4 landscape，17 为两张，32 为两张，33 为三张；
  failure/conservation/success/admin residual 均为 0，
  `storage_restored=true`、`generated_files_restored=true`。
- `scripts/healthcheck.sh` 和 `git diff --check` 通过。

## 历史与 cleanup 策略

“普通 UI 不显示”不等于删除。成功历史 bytes 和元数据保留为受控
`SUPERSEDED` 审计；失败记录保留稳定 code、actor 和时间，但已清理的半成品不提供
普通下载。import delete 仍按 import/container 精确删除 current、历史和失败记录及
其受控 storage 文件，不触及原始上传范围外的数据。

Task03 runner 同步改为在删库前从内部数据库捕获本次 import/container 的全部
generated-file storage paths，再经 allowlist containment 逐条清理，因此兼容
Task04 的 current、`SUPERSEDED` 和 `FAILED` 多行历史，且不重新向 public DTO 暴露
绝对路径。

## UNLOAD-REPORT-05 handoff

`UNLOAD-REPORT-05Adaptive Primary and White Cell Layout.md` 已在后续 fresh
supervisor Session 完成仓库实现和当前环境自动化，状态为
`CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING`。其真实 current
`8 -> 9 -> 8` 回归继续证明本 Task 的唯一 slot 和失败保留合同未回归。详细证据见
`docs/reports/unload-report-05-adaptive-primary-white-layout-verification.md`。

剩余办公室外部验收应：

1. 保留本 Task 的唯一 current、替换审计、staging、失败守恒和旧 URL 行为。
2. 只修改每页 1–8 深色主行、9–16 扩展到白色行、17+ 每页独立选择布局的规则。
3. 使用 05 新生成的 current 报告完成 Windows Microsoft Excel、Print to PDF 和
   办公室实际打印；不得复用旧 `report-8` 作为最终证据。

## 生产关闭（2026-07-30）

生产既有重复 current 数据已按
`docs/runbooks/current-generated-artifact-production-repair.md` 完成配对备份、
dry-run、逐组 winner 核对、repair apply、失败 migration resolve/deploy、零重复
复核和全栈健康检查。数据库 current 唯一索引及 replacement audit 均存在，API、
Web、worker、nginx、PostgreSQL 和 Redis 全部健康。

业务方随后确认办公室文件槽位检查通过：目标柜号只显示当前业务文件，历史报告不再
作为 current 显示，当前报告可正常使用。04 保持 `DONE`。
