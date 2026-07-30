# 执行 UNLOAD-REPORT-04：Current Report and Label Replacement Regression

## 优先级与执行状态

- 优先级：P0。重复的拆柜报告/托盘面单会让办公室人员下载、打印或重打错误版本。
- Task-Status: DONE
- 前置任务：`UNLOAD-REPORT-03` 的报告内容、打印几何、目的仓守恒和失败保护实现必须保留。
- 本 Task 承接 `UNLOAD-REPORT-03` 的当前文件版本回归：2026-07-29 发现“成功重新
  生成后追加文件”，必须先完成本 Task。用户随后澄清的深色主行/白色追加行自适应
  布局由 `UNLOAD-REPORT-05` 单独实现；最终 Microsoft Excel/实际打印门禁也由 05
  使用本 Task 的唯一 current 文件关闭。
- 本 Task 达到 `DONE` 时，将 05 的 `Task-Status` 从
  `BLOCKED_BY_UNLOAD_REPORT_04` 更新为 `READY`，同步 Task Index、完成度报告和
  `HANDOFF.md`，但不得在同一 Session 启动 05。
- 只执行本 Task。达到终态后更新本文件、Task Index、完成度报告、验证报告和
  `HANDOFF.md`，不得在同一 Session 自动选择 POD 或其他 Task。

## 用户现场反馈

同一个柜号已经生成拆柜报告后，再次点击生成，文件区域没有替换原报告，而是继续
增加新的报告文件。办公室人员无法明确哪一份才是当前版本。

产品要求：

1. 重新生成成功后，新的拆柜报告替换原来的当前拆柜报告。
2. 重新生成成功后，新的托盘面单替换原来的当前托盘面单。
3. 柜子详情的文件区域固定为两个业务槽位：
   - 当前拆柜报告；
   - 当前托盘面单。
4. 每个槽位最多显示一份当前文件。两个文件都生成后，文件区域只能看到一份拆柜
   报告和一份托盘面单，不能显示历史成功文件、失败文件或技术工件。

## 产品口径

这里的“覆盖”定义为**当前业务文件版本替换**，不是删除审计历史：

- 办公室文件区域和普通下载入口只认每个柜号、每个业务文件类型的一份
  `GENERATED` 当前版本。
- 上一次成功版本必须标记为 `SUPERSEDED` 或进入等价的不可变历史状态；生成时间、
  生成者、SHA-256、大小、旧路径和替换关系仍可审计，但不能继续显示为当前文件。
- 若既有审计策略要求保留旧生成 bytes，可放在普通文件区域不可见的受控历史存储；
  不得让旧 URL、旧记录或共享路径误读为当前文件。不得删除原始上传清单。
- 生成失败不属于“当前文件”：失败 attempt/job 可以审计，但不能占用文件槽位、
  覆盖成功记录或破坏上一份成功 bytes。
- 首次生成前，对应槽位显示本地化的“尚未生成”状态或不显示下载按钮；不能伪造
  空文件。

## 当前已确认根因

开始实现前必须复核，不得跳过：

1. `ReportsService.generateReport()` 为每次调用创建新的 UUID attempt directory，
   `recordGeneratedReport()` 每次执行 `generatedFile.create()`。
2. `ReportsService.listFiles()` 返回该柜号的全部 generated-file records；Web 的
   `newestGeneratedFiles()` 只排序、不按类型选择当前版本，表格因此追加显示。
3. 现有 report unit test 明确断言
   `creates immutable generated-file history when regenerating`，该断言与新产品口径
   冲突，必须改为“历史可审计、当前槽位唯一”。
4. Label 当前通过 `upsertGeneratedFile()` 更新最近记录，但 Worker 直接写固定 PDF
   路径；失败分支也可能更新最近成功记录为 `FAILED`。必须证明失败生成不会先覆盖
   当前 PDF，也不会把当前成功记录改成失败。
5. Prisma 已有 `GeneratedFileStatus.SUPERSEDED`，但当前没有数据库级约束保证同一
   `(containerId, fileType)` 只有一个当前 `GENERATED` 报告或面单。

## 必须读取与使用

- `AGENTS.md`、`HANDOFF.md`
- `prompts/agents/business-logic-agent.md`
- `prompts/tasks/UNLOAD-REPORT-03Print Margin and Destination Preservation Regression.md`
- `docs/reports/unload-report-03-print-margin-destination-preservation-verification.md`
- `.codex/skills/bestar-handoff/SKILL.md`
- `.codex/skills/unloading-report-generator/SKILL.md`
- `.codex/skills/pallet-label-generator/SKILL.md`
- `.codex/skills/nestjs-prisma-api/SKILL.md`
- `.codex/skills/nextjs-pwa-ui/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- `.codex/skills/docker-local-deploy/SKILL.md`
- `apps/api/prisma/schema.prisma` 和现有 migrations
- `apps/api/src/reports/reports.service.ts`
- `apps/api/src/reports/reports.service.spec.ts`
- `apps/api/src/labels/labels.service.ts`
- `apps/api/src/labels/labels.service.spec.ts`
- `apps/api/src/async-jobs/async-jobs.processor.ts`
- generated-file controller/DTO/download、import deletion、correction/audit 相关代码与测试
- `apps/web/src/components/containers/container-generated-files.tsx`
- `apps/web/src/components/containers/container-files-flow.ts`
- `apps/web/tests/container-files-flow.test.ts`
- 相关 API E2E、Playwright、storage cleanup 和 full-stack runner

## 修改前只读诊断

1. 使用唯一测试柜号，依次执行：
   - 首次生成报告；
   - 第二次成功生成报告；
   - 首次生成面单；
   - 在允许重生成的状态下第二次成功生成面单；
   - 分别故意触发报告和面单失败。
2. 每一步记录脱敏证据：
   - generated-files 各状态/类型数量；
   - `list files` API 返回数量；
   - 文件区域实际行/槽位数量；
   - async job 的 `generatedFileId`；
   - 当前文件 SHA、路径和下载 SHA；
   - storage 中 attempt/current/history 文件数量。
3. 核对是否已有现场重复记录。只统计
   `EXCEL_REPORT`、`PALLET_LABEL_PDF`，不得把原始上传、parsed JSON、task report、
   correction、monthly summary、wage 或 POD 文件纳入本 Task 的“两个槽位”。
4. 明确 label Worker 在数据库事务失败、QR 校验失败或并发冲突前是否已覆盖固定
   PDF 路径。若会覆盖，必须先修复 staging/promotion 顺序，不能只改数据库查询。

## 任务范围

### 1. 每柜每类型唯一当前文件契约

1. 对 `EXCEL_REPORT` 和 `PALLET_LABEL_PDF` 建立统一 current-artifact 服务或等价
   深层模块；报告和面单不能继续各自实现冲突的 create/upsert 语义。
2. 数据库必须保证同一柜号、同一上述文件类型最多一个
   `status = GENERATED` 的当前记录。应使用 PostgreSQL 可并发证明的约束和事务，
   不能依赖前端过滤或“先查再写”的无锁判断。
3. 若 Prisma 无法直接声明条件唯一索引，migration 可使用受审查的 PostgreSQL
   partial unique index；必须同时验证现有库和空库 migrate。
4. 每次成功替换至少保留：
   - 新当前记录的 actor、时间、SHA-256、MIME、size、storage path；
   - 旧记录的 `SUPERSEDED` 状态和原有元数据；
   - 可追溯的 old -> new replacement relation 或等价审计事件；
   - 本次 async job 只关联本次产生的记录。
5. 不得通过更新同一行而让历史 async job、correction 或 audit reference 悄悄指向
   新 bytes。若选择复用同一 current row，必须另建不可变 generation/replacement
   event 并证明所有历史引用仍指向当时版本；优先复用现有 `SUPERSEDED` 语义。

### 2. 成功替换与失败守恒

1. 报告和面单都必须使用“隔离 staging -> 完整校验 -> 原子激活”的顺序：
   - Worker 只写本次唯一 staging 路径；
   - 完成既有 report conservation/layout 或 label QR/size 校验；
   - 对 `(containerId, fileType)` 加锁并在事务内激活新版本、supersede 旧版本；
   - 事务或激活失败时清理本次 staging，不改变旧当前记录/下载；
   - 成功后普通文件区域只返回新版本。
2. 不允许 Worker 在校验或数据库提交前直接改写当前 label PDF。报告现有 UUID
   attempt 和 03 的不完整文件清理必须保留。
3. 失败场景必须满足：
   - 旧当前记录仍为 `GENERATED`；
   - 旧文件 SHA 和下载 bytes 不变；
   - 文件区域数量不增加；
   - 失败 job/attempt 有 stable code 和 actor/time 审计；
   - 不遗留可下载半成品或 orphan staging。
4. 首次生成失败时，该类型仍为“尚未生成”，不能显示一条 `FAILED` 文件卡片。
5. 报告替换不能删除/替换面单；面单替换不能删除/替换报告。两个 current slot
   独立工作。
6. 保留 03 的业务规则：
   - 报告重新生成可使用最新保存数据；
   - 守恒/layout 失败保留旧报告；
   - 报告内容、目的仓、打印边距、0–16 单页规则不因文件版本修复产生额外回归。
   - 当前已知的“1–8 个目的仓过早占用白色追加行”不在本 Task 修改；不得把该行为
     固化为新 current-artifact contract，后续由 05 修复。
7. 保留 label 业务规则：
   - 已分配、已拆完、装车中、已送库或其他现有 in-use 状态继续拒绝不安全的托盘
     重建；
   - `PALLETS_ALREADY_IN_USE` 和 container lock 行为不回归；
   - “重打面单”只写重打审计并下载当前 PDF，不创建新 generated file，也不改变
     pallet identity、QR、库存或 current slot。

### 3. 文件列表与下载行为

1. 柜子详情普通文件 API/DTO 返回固定 current view：
   - 最多一条 `EXCEL_REPORT`；
   - 最多一条 `PALLET_LABEL_PDF`；
   - 只返回 `GENERATED` 当前记录；
   - 排序固定且不受历史记录数量影响。
2. 普通文件区域改为两个稳定业务槽位，不再展示“文件历史”表意。连续生成任意次数
   后仍最多两个槽位/两条当前文件。
3. `FAILED`、`SUPERSEDED`、`GENERATING`、parsed JSON、task report 和其他技术/
   审计工件不能出现在办公室该区域。它们不得被物理伪装成不存在；后台审计查询、
   import cleanup 和引用完整性仍需正常工作。
4. 当前下载必须返回最新 SHA/bytes 和稳定业务文件名。旧 superseded file ID 通过
   普通下载入口时必须 fail closed，返回 `GENERATED_FILE_SUPERSEDED` 或等价 stable
   code；不能下载旧 bytes，也不能因共享 canonical path 下载到新 bytes。
5. 选中记录、Dashboard/recent activity、async job 跳转若引用已 supersede 的旧
   generated file，必须落到柜子文件区域的对应 current slot，并显示本地化说明；
   不能形成 404 循环、重复卡片或跳到另一类型。
6. 文件列表 refresh 必须以服务端 current state 为准。不得用客户端数组 append
   生成结果，也不得让 stale router cache 暂时显示旧+新两条。

### 4. 既有重复数据修复

1. 提供可重复运行、默认 dry-run 的受控修复脚本或 migration companion：
   - 找出每个柜号/类型的多个 `GENERATED` 报告或面单；
   - 使用稳定排序和实际可读/SHA 匹配选择 current winner；
   - 其余成功记录标为 `SUPERSEDED` 并建立替换审计；
   - 失败/生成中记录保持审计语义，不得提升为 current；
   - 不处理其他 `GeneratedFileType`。
2. 若最新 metadata 指向 missing、越界或 SHA 不匹配文件，不能盲选。选择最近一个
   可验证成功版本并记录安全诊断；全部不可用时该槽位为空并输出 stable repair
   finding，不能伪造文件。
3. 脚本必须校验 storage-root containment、符号链接/路径穿越、共享路径和外部引用。
   不得广泛删除 storage，不得触及真实原始上传文件或非目标工件。
4. 修复后再创建/验证数据库唯一约束，输出仅含数量、ID 和 hash 的脱敏摘要；不得把
   客户内容、完整路径或凭据写入提交的报告。
5. import delete 仍须按既有规则清理该 import 的 current/history generated
   artifacts 和记录；不能因为新增 current 约束产生 orphan file 或 blocker 回归。

### 5. 并发、重试和恢复

1. 同一柜号同一类型两个并发成功请求最终只能有一个 current winner；另一个必须
   幂等返回同一结果或以 stable conflict/retry 结束，不能留下两个 `GENERATED`。
2. BullMQ retry、重复 delivery、进程在 Worker 完成后/DB commit 前/commit 后中断，
   都必须收敛为一个 current file，无重复卡片和半成品。
3. 报告与面单的锁粒度不能无必要互相阻塞，但不能破坏 label pallet replacement
   现有 container/destination/pallet row-lock 安全。
4. cleanup 失败必须可重试、可观测，不得回滚已经验证并激活的 current bytes，
   也不能向办公室暴露旧 current。使用 stable cleanup status/code，不把绝对路径或
   Worker 英文异常直接显示给用户。

## Strict i18n 硬门禁

1. API/Worker 只返回 stable code、enum、`labelKey` 和安全 raw details；不得向普通
   UI 返回可直接显示的英文错误句子、stack 或 storage path。
2. 文件区域、两个槽位标题、尚未生成、替换成功、生成失败、旧链接已替换、cleanup
   pending、按钮、tooltip、aria/title、empty state 和 screen-reader 文案全部进入
   typed `en` / `zh-CN` catalog。
3. 将新增的 replacement/superseded/concurrency/cleanup stable code 显式映射到
   locale catalog；unknown code 使用本地化通用 fallback，raw code 只可进入明确的
   技术诊断区域。
4. 删除或改写现有 “preserves each generation attempt in file history”、
   “File history refreshed” 等与新产品口径冲突的用户文案。
5. English 页面只显示英文 UI，中文页面只显示中文 UI。直接加载、刷新、hydration、
   生成成功、失败重试和切换语言时不得双语同时显示，也不得先闪另一种语言。
6. 柜号、文件名、SHA、模板英文内容属于业务/技术数据，不翻译；状态和操作说明必须
   本地化。
7. 即使最终没有新增可见错误，也必须通过 catalog parity、unmanaged-string、
   dynamic-code mapping 和 no-flash gate。

## 必须新增/修改的自动化

### API 与数据库

1. 首次报告生成：一个 current report；第二次成功生成：仍只有一个 current
   report，新 SHA 可下载，旧记录 superseded 且历史引用不漂移。
2. 首次/再次面单生成使用相同契约；证明失败不能覆盖固定 PDF 路径或成功记录。
3. 报告 + 面单都存在时，普通 list API 恰好返回两条；各自连续生成至少三次后仍为
   两条。
4. 第二次报告发生 conservation/layout/Worker/DB failure 时，旧报告 SHA、bytes、
   status、下载和文件区域不变；label 覆盖 QR mismatch、Worker failure、DB failure
   和并发 change。
5. 首次失败时普通列表为零条该类型，失败 attempt 只在审计/job 中可见。
6. 旧 superseded ID 普通下载被稳定拒绝，当前 ID 下载 SHA 与 DB 一致；验证 storage
   containment 和共享路径不会串版本。
7. 同类型并发、BullMQ retry/duplicate delivery、进程中断测试最终仅一个 current。
8. reprint 不新增 generated-file；`PALLETS_ALREADY_IN_USE` 和 report lifecycle
   行为保持。
9. 现有库 migration 先包含重复 current fixture 并正确收敛；空库 migration 从零
   完成；partial unique/current constraint 有直接 SQL/Prisma E2E 证据。
10. import deletion、correction/audit references、async job historical references
    和非目标 generated file types 回归通过。

### Web 与 E2E

1. 更新旧的“按创建时间显示全部历史”unit test，改为两个 current slot contract。
2. 使用真实 API/BullMQ 经 nginx：
   - 生成报告两次，DOM 只出现一个当前报告；
   - 生成面单两次，DOM 只出现一个当前面单；
   - 最终文件区域恰好两个 current slot，下载 SHA 对应最后一次成功；
   - 再次生成失败，两个 slot 和可下载 bytes 不变。
3. 覆盖 en/zh-CN direct load、refresh、locale switch、light/dark、desktop/mobile
   和真实 200% zoom；无混语、重复行、遮挡、页面级横向 overflow 或 stale flash。
4. 截图和 DOM 断言必须同时证明“每类型一份”，不能只证明第一个文件可见。
5. fixture 使用唯一前缀、双层 cleanup 和 residual audit；不得修改或删除真实柜子、
   真实文件、账号或 storage。

### 报告与面单生成物

1. 重新生成后的当前报告继续通过 03 的 destination conservation、0–16 单页、
   margin、Standards、package/PDF/PNG 门禁。
2. 当前面单继续满足 150mm x 100mm、25mm QR、唯一 pallet ID 和扫码可读性。
3. 模板和原始上传 SHA 不变；历史审计 artifact 的保留/访问策略必须在验证报告中
   明确，不能把“UI 不显示”写成“已经删除”。

## Docker-only 验证

所有 Node、Prisma、Worker、LibreOffice、PDF、Playwright、test 和 build 命令必须
在 Docker/Compose 中运行。不得在宿主安装或修复 pnpm、Jest、Python venv 或
LibreOffice。

```bash
docker compose -f infra/docker/compose.local.yml up -d --build
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api lint
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api typecheck
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api test --runInBand
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api test:e2e --runInBand
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api prisma migrate status
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web lint
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web typecheck
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web test
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web build
docker compose -f infra/docker/compose.local.yml exec -T worker-python uv run pytest
scripts/verify-unload-report-03.sh
scripts/healthcheck.sh
git diff --check
```

必须新增 `UNLOAD-REPORT-04` 专用 full-stack/concurrency/storage/i18n/visual runner，
记录唯一 artifact directory。不得仅运行 03 的报告版式脚本后宣称本 Task 完成。

## 本 Task 终态

本 Task 的业务目标是 current file replacement，不改 Excel row layout。数据库、
API、storage、BullMQ、Web、strict i18n 和 full-stack/visual 自动化全部通过后可
标记 `DONE`；不要在本 Task 对 03 的最终打印布局签字。

随后必须单独执行 `UNLOAD-REPORT-05`，使用本 Task 的唯一 current 报告完成深色/
白色行自适应布局以及 Windows/Microsoft Excel、Print to PDF 和办公室实际打印
外部门禁。

## 验收标准

1. 任意柜号的普通文件区域最多一份当前拆柜报告和一份当前托盘面单；两个都生成后
   始终恰好两份，连续成功重生成不会增加行或卡片。
2. 成功重生成以新 SHA/bytes 替换对应 current slot，另一个 slot 不受影响；旧成功
   版本进入审计历史且不再作为普通当前文件或普通下载。
3. 任一失败、并发、重试或进程中断不覆盖旧 current、不产生第二个 current、不
   泄漏半成品；数据库约束可证明该不变量。
4. 报告 03 除已登记给 05 的深色/白色行布局问题外，内容/打印契约、面单尺寸/QR、
   pallet identity、库存/扫码、container lifecycle、reprint 和原始上传保护均不
   因本 Task 回归。
5. 既有重复 current 数据已由受控 repair 收敛；非目标 generated files、历史引用
   和 import deletion 完整。
6. API/Web/Worker、现有库/空库 migration、full-stack、并发、storage、strict
   i18n/no-flash、视觉、healthcheck 和 diff check 全部通过。
7. 新验证报告记录修复前后数量、current winner 规则、replacement audit、失败守恒、
   download SHA、migration/repair、工件路径、逐图结论和 05 handoff。
8. 04 自动化 Definition of Done 全部通过后才可 `DONE`；不得跳过 05 并把 04 的
   current-file 证据当成最终 Excel 布局/打印验收。

## 明确非目标

- 不修改拆柜报告模板业务字段、目的仓聚合、托盘计算或深色/白色目的仓行布局；
  自适应布局只由后续 05 修改。
- 不修改面单尺寸、QR payload、pallet ID、扫码交易、库存或装车状态规则。
- 不删除原始上传 Excel、人工修正、parser evidence 或审计历史。
- 不在普通文件区域新增版本历史、恢复按钮或历史下载 UI。
- 不把前端去重、只显示数组第一项或 CSS 隐藏当成后端唯一 current 修复。
- 不借本 Task 开始 POD、parser learning、Dashboard 或 wage 开发。

## 完成证据（2026-07-30）

- 专用 full-stack/concurrency/storage/i18n/visual runner 已通过：
  `test-results/unload-report-04/20260730T002842Z-36190`。
- API build/lint/typecheck、387 unit、129 E2E；Web lint/typecheck/build、284
  unit；Worker 207 全部通过。
- 现有库与空库 migration、partial unique index、重复 current repair dry-run/apply、
  replacement audit、并发最终两个 current slot、旧 ID fail closed 和 12 张
  en/zh-CN/light/dark/desktop/mobile/200% zoom 截图均已验证。
- `UNLOAD-REPORT-03` 回归 runner 已通过：
  `test-results/unload-report-03/20260730T011452Z`；storage 和 generated-files
  digest 均精确恢复。
- 详细结论：
  `docs/reports/unload-report-04-current-artifact-replacement-verification.md`。
- 04 的 `DONE` 终态不变。后续 `UNLOAD-REPORT-05` 已在独立 fresh Session 完成
  自适应布局、当前环境全部自动化和办公室外部验收，并通过 04 current slot 的真实
  `8 -> 9 -> 8` 替换及失败保留回归；其状态为 `DONE`。验证报告：
  `docs/reports/unload-report-05-adaptive-primary-white-layout-verification.md`。
- 2026-07-30 生产既有重复 current 数据已按 runbook 完成配对备份、winner 核对、
  repair、失败迁移 resolve/deploy、零重复和全栈健康检查；业务方随后确认办公室
  current 文件槽位检查通过。04 的生产关闭证据完整。

## 生产既有重复记录操作入口

- 旧生产数据不能手工删除 generated-file 行或 storage 文件。
- 使用 `pnpm --filter api repair:current-generated-files` 的 Docker dry-run，
  逐组确认 `winnerId` 后才允许显式 `--apply`。
- 当前工具会处理 dry-run 中的全部重复组；出现无有效 winner、共享路径、SHA
  不一致或未获业务确认的 winner 时必须停止。
- 完整的备份、停写、dry-run、候选核对、apply、migration、验证和回滚步骤：
  `docs/runbooks/current-generated-artifact-production-repair.md`。
- 该操作只把旧版本标记为 `SUPERSEDED` 并退出普通文件区域；历史 bytes 继续保留
  审计，不属于可直接物理清除的垃圾文件。
