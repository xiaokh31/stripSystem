# 执行 WAGE-HOURS-08：Parsed Attendance Wage Workbook Generation Regression

## 优先级与执行状态

- 优先级：P0。办公室已能解析月度考勤，但无法生成工资工时表，核心月结流程被阻断。
- Task-Status: CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING
- 前置任务：`FILE-UPLOAD-01Unicode Original Filename Integrity Regression.md` 必须
  `DONE`；WAGE-HOURS-01 至 07 的计算、格式、审计删除和文件可见性继续作为基线。
- 本 Task 是新现场回归，不得重跑或改写 WAGE-HOURS-01 至 07 的完成证据。
- 只执行本 Task。达到终态后更新本文件、Task Index、完成度报告、专项验证报告和
  `HANDOFF.md`；不得在同一 Session 自动开始 PUBLIC-DEPLOY-04。

## 用户报告

工时表导入后可以解析，但无法生成工时工资表。

## 2026-08-01 用户产品澄清：真实成品不是模板

1. `samples/wage/20260601-0630_wageRecords.xls` 是办公室提供的**真实历史工资工时成品**，
   只可作为版式、公式、样式、Sheet、行列尺寸、打印设置和输出合同的只读参考；它不是
   运行时模板。先前代码和 Task 把它直接称为 template 的假设已被用户明确否定。
2. 必须从该真实成品创建一份独立工资表模板，并让后续所有工资表只从新模板生成。真实
   参考文件的 SHA 必须保持不变，不能继续由 API/Worker 直接读取作为生产模板。
3. 新模板不得包含历史日期、打卡时间、工时、工资结果或其他历史业务值。若模板需要保留
   员工 identity/Sheet mapping，这类信息仍视为个人数据，模板必须通过受控持久化路径供应，
   不得以未审计方式提交 Git；优先实现可提交的完全脱敏结构模板和运行时安全映射。
4. 生产更新后已出现 `WAGE_TEMPLATE_MISSING`。根因证据表明真实成品受 `samples/*` 忽略、
   不随 `git pull` 到生产机，而 Dockerfile 只会复制构建主机偶然已有的 `samples/`。本次
   必须同时关闭模板创建与生产供应缺口，不能通过复制到正在运行的容器临时修复。
5. 此澄清重新打开 WAGE-HOURS-08 的仓库实现与自动化门禁。旧的
   `CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING` 证据保留为历史基线，不再代表当前终态。

## 用户确认的真实样本

1. `samples/attendance_test/` 目录存放的是用户提供的**7月现场真实打卡记录样本**，
   不是 synthetic/mock fixture，也不是只供文件名测试的占位文件。
2. 本 Task 的原始红灯和最终 full-stack 回归必须使用该真实样本完成
   upload -> Parse -> Generate -> list -> download；6 月旧 fixture 或脱敏 synthetic
   fixture 只能作为补充基线，不能替代真实样本退出门禁。
3. 真实样本必须只读，修复前后 SHA-256 不变；不得改写、删除、覆盖或提交其派生工资
   文件。员工姓名、打卡时间和其他个人数据不得进入日志、截图、verification report、
   task report 摘要或 `HANDOFF.md`，证据仅记录脱敏 count/code/hash/period。
4. 视觉与可提交自动化使用结构等价的脱敏 fixture；真实样本只在受控 Docker runner
   内验证，并在结束时精确清理 DB/storage/test artifact，不清理源文件。

当前 Work Hours UI 通过异步 `WAGE_RECORD_GENERATION` job 调用 API，API 再以
persisted active attendance rows 调用 Python Worker 和
`samples/wage/20260601-0630_wageRecords.xls` 模板。现有测试主要覆盖 6 月基线；
`samples/attendance_test/*.xls` 提供了7月现场真实打卡记录样本，但包含员工数据，任何
日志、截图、报告和 handoff 必须只记录脱敏 count/code/hash。

不能仅把按钮改成成功、把 Worker error 降级或绕过真实模板。必须定位“Parse 成功、
Generate 失败”的实际终止阶段并完成可下载工作簿闭环。

## 业务成功定义

1. active attendance import 的 `parseStatus` 为 `PARSED` 或 `WARNING`、
   `errorCount=0` 且存在 active employee-day rows 时，HR_MANAGER/ADMIN 可以生成工资表。
2. 工资表期间来自解析后的真实月份；7 月输入生成的文件名、日期槽位和各 Sheet 内容
   不能继续伪装为 6 月数据。
3. 工时计算继续使用数据库中 active rows：奇数打卡 first/last、偶数打卡分段相加、
   fixed lunch 只扣一次；已删除行不得复活或进入生成结果。
4. 已可靠匹配模板 Sheet 的员工必须逐人写入完整月份。既有 unmatched/ambiguous
   employee/template warning 语义保持可复核，不能因一个 review warning 把已经有效的
   整份工作簿错误标为失败，也不能把实际 blocking error 冒充成功。
5. 生成成功后只在办公室页面显示 `WAGE_RECORD_XLS`；parsed JSON、task report 和技术
   artifact 继续后台留存但不得重新出现在 UI/DOM/download links。
6. 失败必须留下稳定 stage/code 和安全审计，不能生成可下载的损坏/半成品工资表；
   重试成功后可下载、SHA 正确、Microsoft Excel/LibreOffice 可打开。

## 必须读取与使用

- `AGENTS.md`、`HANDOFF.md`
- `prompts/agents/business-logic-agent.md`
- `docs/product/02-work-hours-and-unloading-wage-settlement.md`
- `docs/runbooks/work-hours-settlement-regression.md`
- `prompts/tasks/FILE-UPLOAD-01Unicode Original Filename Integrity Regression.md`
- `prompts/tasks/WAGE-HOURS-01Attendance Punch Parity Calculation Contract.md`
- `prompts/tasks/WAGE-HOURS-02Multi-Sheet Wage Workbook Formatting.md`
- `prompts/tasks/WAGE-HOURS-05Full Stack Workbook Visual Exit Gate.md`
- `prompts/tasks/WAGE-HOURS-06Office Wage File Download Visibility.md`
- `prompts/tasks/WAGE-HOURS-07Attendance Import Audited Deletion.md`
- `.codex/skills/bestar-handoff/SKILL.md`
- `.agents/skills/diagnosing-bugs/SKILL.md`
- `.codex/skills/nestjs-prisma-api/SKILL.md`
- `.codex/skills/nextjs-pwa-ui/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- `document-skills:xlsx`（创建/审计从真实 `.xls` 成品派生的新模板）
- `apps/api/src/attendance/**`
- `apps/api/src/async-jobs/**`
- `apps/worker-python/src/worker_python/wage/**`
- `apps/web/src/app/work-hours/**`
- `apps/web/src/components/wage/**`
- `apps/web/src/lib/i18n/**`
- `samples/wage/workAttendanceRecordForm_June.xls`
- `samples/wage/20260601-0630_wageRecords.xls`
- `samples/attendance_test/*.xls`：用户提供的7月现场真实打卡记录样本，只读用于
  原始红灯和最终 full-stack 回归

## 修改前红灯与根因证据

先建立 `WAGE-HOURS-08` 专用单命令 repro，再修改代码：

1. 经真实 nginx/API 上传 7 月现场样本、提交 Parse job、等待终态并证明 Parse 成功且
   active rows > 0；随后从 UI 使用的同一异步 endpoint 提交 Generate job。
2. 捕获并关联：attendance import id、data revision、async job status/stable error code、
   API generation stage、Worker exit/payload `task_status`、模板 readable/sha verdict、
   wage generated-file status/path containment/file existence。证据只保留 id/hash/count/code，
   不保留员工姓名、打卡时间或工资内容。
3. 同一输入再执行同步 generation endpoint 作为诊断对照，确定问题在 UI polling、
   BullMQ、API normalized rows、Worker、模板或 generated-file commit 的哪一边界；同步
   endpoint 不是最终替代方案。
4. 列出 3-5 个可证伪假设，逐一改变单一变量。至少检查 Unicode path、生产镜像中的
   template path/permissions、目标月份日期槽位、persisted JSON schema、Sheet matching、
   output overwrite/permissions、Worker timeout/stdout 和 job error propagation。
5. 把最小 repro 转为 failing regression test；修复后重新运行原始未缩减流程。删除
   所有 `[DEBUG-*]` instrumentation 和临时 artifact。

不得因为 6 月旧 fixture 能通过就判定现场问题不存在，也不得读取/展示生产账号 secret
或完整现场员工数据。

## 实现要求

### 0. 从真实成品创建独立模板并可靠供应

1. 先对真实成品做隐私安全结构清单：Sheet 类别、日期/工时输入格、公式、样式/XF、merge、
   ROW/COLINFO、print metadata 和特殊/调整 Sheet；报告只记录 count/hash/code，不记录姓名、
   Sheet 名或业务值。
2. 创建独立模板工件并证明其中不存在历史日期、打卡、工时、工资结果或未批准个人数据。
   模板生成必须可复现且有固定 SHA/版本；不得在每次生成工资表时重新读取真实历史成品。
3. 新模板必须支持当前及未来月份。员工 Sheet 不能依赖历史成品中固定的某月业务值；员工
   mapping/slot/Sheet 创建策略必须显式、可测试，容量不足或无法安全映射时 fail closed。
4. API/Worker 的默认 `WAGE_TEMPLATE_PATH` 必须指向新模板。生产 Compose 使用明确的只读、
   持久化供应方式；`git pull`、镜像重建和容器重建后仍存在。若模板因隐私不能进 Git，使用
   host-managed persistent path、备份和部署 preflight，不得依赖 image build context 中的
   ignored `samples/`。
5. 生产更新 preflight/startup 必须验证 exists、regular file、non-zero、approved SHA/version、
   legacy OLE/BIFF readable 和只读权限；失败必须在停机/业务生成前返回稳定安全错误。
6. 添加 clean tracked checkout/image regression，证明缺少开发机 ignored samples 时仍能获得
   新模板或在 preflight 明确阻断；禁止再次出现开发机通过、生产重建后缺模板。

### 1. Worker 与模板生成

1. 修复被证实的根因，不预设必须重写 generator。保留 legacy `.xls` OLE/BIFF 的逐格
   样式、formula、merge、print metadata 和原模板 SHA 不变合同。
2. persisted active rows contract 必须支持现场月份、员工 identity、日期、method、
   intervals、hours、warnings/errors；API 与 Worker schema/version 不一致时 fail closed
   并返回明确 stable code，不能抛裸 `ValueError`/stack trace。
3. 模板中的日期槽位按目标 period 正确匹配/更新；不允许只对 6 月 hardcode。输出名称
   使用实际 `periodStart-periodEnd`，同一次生成的 manifest、API record 和下载名一致。
4. 保留一对一可靠 employee id/name Sheet matching、短 token 和 special/adjustment Sheet
   保护。review warning 与 blocking error 必须分类明确：
   - warning 可生成时，工作簿状态成功并将 warning 供 HR 复核；
   - 影响文件完整性的 error 必须阻止成功记录和下载；
   - 不得静默丢失已匹配员工或把 0 written employee workbook 标为成功。
5. 输出先写 staging，再验证 file exists、non-zero、OLE/BIFF readable、period、Sheet
   inventory、written employee/day counts 和 manifest consistency；验证成功后才记录
   `GENERATED`。失败 staging 精确清理或标记失败，不能污染文件历史。

### 2. API、队列和幂等

1. 同步与异步 generation 使用同一 service contract。job processor 必须保存安全的
   generation stage/stable error code，UI polling 能取得真实原因，不能只得到 generic
   `background job failed`。
2. 生成前继续检查 import active、parse readiness、stored file、active rows 和 revision；
   Worker 返回后在 transaction/lock 中复核 deleted/revision，保持 WAGE-HOURS-04/07
   的 stale/supersede 语义。
3. `WageGeneratedFile` 的 bytes、SHA、size、status、actor、error code 与 async job ref
   必须一致。不存在的 failure path 不得伪造 SHA/size 或变成下载链接。
4. 并发 double-click/retry 不得产生两个 running job、互相覆盖文件或把失败 artifact
   设为 current success。沿用既有工资表历史策略，不借本 Task 改成拆柜报告的唯一
   current-slot 规则。
5. Worker timeout、invalid stdout、template missing/unreadable、normalized JSON invalid、
   save failure、post-save validation failure均有独立 stable code 和测试；API 不泄漏
   absolute path、stack、员工姓名或模板内部内容。

### 3. Work Hours UI

1. Generate 按钮只在后端 contract ready 时启用；提交后显示 bounded progress 并轮询
   单一 job，refresh/route change 后不重复提交。
2. job 失败时根据 stable code 显示本地化、可操作的阶段提示和 Retry；不能要求办公室
   人员查看 task report、parsed JSON、storage path 或开发日志。
3. 成功后刷新文件历史，并确认新 `WAGE_RECORD_XLS` 可通过受保护代理下载；不能只显示
   success toast 而列表无文件。
4. 继续执行 WAGE-HOURS-06 default-deny file allowlist。技术工件即使失败也不进入
   SSR、DOM、辅助功能树或普通下载链接。
5. 长中文文件名和英文错误文案在 390px、desktop、200% zoom 下不遮挡按钮或撑出页面。

## Strict i18n 硬门禁

1. 新增/修正的 generation stage、template/period/schema/save/validation/job/timeout、
   Retry、progress、success、download 和 empty state 文案全部进入 typed `en` / `zh-CN`
   catalog。
2. API/Worker 返回 stable code/enum、count/hash/period 和安全 raw metadata；Web 不能显示
   Worker English message、Python exception、raw code 或 stack trace。
3. 员工姓名、文件名和 Sheet name 是业务数据，不翻译；普通错误文案不得拼入员工姓名
   或其他个人数据。
4. English 只显示 English，中文只显示中文。中文 refresh、hydration、job poll、失败、
   Retry、成功和 locale switch 不得闪英文或双语并列。
5. catalog parity、unmanaged-string AST、stable-code mapping、SSR/no-flash 和 WAGE-HOURS-06
   technical artifact visibility tests 必须通过。

## 必须新增/更新的测试

### Worker

1. 6 月基线和 7 月现场结构均可从 persisted active rows 生成 readable `.xls`；期间、
   output filename、written employee/day count 和 manifest 一致。
2. 逐 Sheet 验证 touched cells 的 value/XF/style，未触及 Sheet、formula、adjustment row、
   merge、ROW/COLINFO、print metadata 和模板 SHA 不变。
3. odd/even/lunch、deleted row exclusion、warning-only、unmatched/ambiguous、0 matched、
   missing period、invalid schema、template missing/unreadable、save/validation failure。
4. 使用现场样本的测试输出只保留 count/hash/code；可提交和视觉 fixture 必须使用脱敏
   人名，不能复制真实员工/打卡内容到新 fixture 或 report。

### API / queue

1. upload -> async Parse success -> async Generate success -> protected download 的真实链路。
2. 同一现场样本同步/异步结果 contract 一致；job success 必须引用真实 GENERATED file，
   job failure 必须保留 stable stage/code 且无可下载半成品。
3. revision/delete race、double submit、worker timeout/crash/invalid JSON、DB transaction
   rollback、storage permission/containment 和 retry recovery。
4. HR_MANAGER/ADMIN 成功；无 `attendance.generate` 的 OFFICE/WAREHOUSE_MANAGER/
   WAREHOUSE 返回 403；actor audit 正确。

### Web / Excel visual

1. 真实 Chromium 从 `/work-hours` 完成上传、Parse、Generate、列表刷新和下载；不得通过
   直接 API 调用跳过 UI 主流程作为唯一证据。
2. en/zh-CN、light/dark、390/1366/1920、200% zoom、refresh/locale switch；console、
   pageerror、failed request、hydration、missing key、mixed language 和 overflow 为 0。
3. 对脱敏 6 月/7 月 output 做 LibreOffice PDF/PNG 逐 Sheet 检查；Agent 必须查看原分辨率
   高信号截图，不能只看 OCR/count。
4. 办公室 Windows/Microsoft Excel 打开 7 月生成文件，检查所有员工 Sheet、日期、工时、
   颜色、行高列宽、Print Preview 和下载文件名。当前环境无 Excel 时，先完成全部自动化，
   再准确返回 `CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING`。
5. runner 使用唯一前缀、shell trap/finally 和故意失败 cleanup 探针；测试 import、rows、
   files、jobs、users、storage artifact 精确清理，不删除现场样本或既有工资文件。

## Docker-only 验证

```bash
docker compose -f infra/docker/compose.local.yml up -d --build
docker compose -f infra/docker/compose.local.yml exec -T worker-python uv run pytest
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api lint
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api typecheck
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api test --runInBand
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api test:e2e --runInBand
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api prisma migrate status
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web lint
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web typecheck
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web test
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web build
scripts/healthcheck.sh
git diff --check
```

必须新增 `WAGE-HOURS-08` 专用 full-stack/package/visual runner，并沿用
WEB-DASHBOARD-09 的日期隔离和失败安全 cleanup；不得直接运行会把未来月份或工资记录
留在共享数据库的旧 E2E。

## 验收标准

1. 用户报告的现场 `.xls` 可 Parse，并通过 UI 异步流程成功生成、列出、下载真实工资表。
2. 7 月 period、文件名、各匹配员工 Sheet 和工时正确；6 月基线、odd/even/lunch、删除
   审计和多 Sheet 格式不回归。
3. warning 与 blocking error 分类正确；0 effective output、损坏/缺失 artifact 不得
   标为成功或下载。
4. API/job/Worker/generated-file 状态和 stable stage/code 一致，重试、并发、revision/
   delete race 与 storage failure 安全。
5. `/work-hours` 仍只显示工资表，失败提示双语、可操作且不泄漏技术/个人数据。
6. Docker Worker/API/Web、真实 nginx/BullMQ/Chromium、BIFF/LibreOffice、privacy、
   cleanup、healthcheck 和 diff check 通过。
7. 生成 `docs/reports/wage-hours-08-generation-regression-verification.md`；Microsoft Excel
   外部检查通过后 `DONE`，否则只能精确记录 external verification pending。

## 非目标

- 不改变工资费率、税、加班、假期或 payroll compliance。
- 不改变 WAGE-HOURS-01 的奇偶打卡与午休规则。
- 不物理删除考勤原件、已删除行、audit events、旧 generated records 或 jobs。
- 不把 task report/parsed JSON 暴露给办公室人员。
- 不借本 Task 重做模板品牌、卸柜工资、拆柜报告或 PUBLIC-DEPLOY。

## 当前环境完成证据（2026-08-01 MDT）

- 前置 `FILE-UPLOAD-01` 已为 `DONE`。旧配置把被 `samples/*` 忽略的真实历史工资成品
  误作运行时模板，开发机偶然存在该文件掩盖 clean checkout / production rebuild 的供应
  缺口。现在历史成品只作只读结构参考，API/Worker 不再读取它作为生产模板。
- 已创建确定性、完全脱敏的 tracked legacy BIFF 模板 `bestar-wage-template-v1`，固定 SHA
  `f9e11d6f2c6f45b0453f8346df2ff8347f2e6f5c8b7505a642367f1dade4206c`。隐私审计中
  历史日期、打卡、工时、工资结果、未批准个人数据和 metadata 均为 0；模板含 16 个
  通用员工槽位和 1 个受保护调整 Sheet。连续重建字节一致，超过容量 fail closed。
- Worker/API image build 和 API startup preflight 验证 approved path/version/SHA、OLE/BIFF
  可读和只读权限；两个镜像中的模板均为 `0444`。clean tracked context regression 在没有
  ignored samples 时成功构建、验证并清理 Worker/API 镜像，关闭 `WAGE_TEMPLATE_MISSING`
  生产供应缺口。
- 真实 7 月流程通过 UI upload -> async Parse -> refresh -> async Generate -> list ->
  protected download；465 active rows，blocking errors 0，生成/API 下载/Web 代理下载
  SHA 与 124928 bytes 完全一致。BIFF 审计验证 17 Sheets、15 个完整期间员工 Sheet、
  465 个日期单元格和 155 个正工时单元格。
- `scripts/run-wage-hours-08-e2e.sh verify` 通过 clean supply、故意失败 cleanup 探针、真实
  nginx/BullMQ/Chromium 成功流、同步诊断、隐私/BIFF 审计、精确零残留和脱敏 LibreOffice
  视觉门禁。模板/6 月/7 月各 17 Sheets、50 pages、normalized style differences 0；三张
  全页联系表和 24 张原分辨率高信号页面已检查。
- Docker 门禁通过：Worker Ruff + 243 pytest；API lint/typecheck、409 unit / 131 E2E；
  Web lint/typecheck、285 tests、production build；39 migrations up to date；最终 full-stack
  healthcheck 和 `git diff --check` 通过。本 Task 无 schema 变更，不需要 migration。
- 完整脱敏证据见 `docs/reports/wage-hours-08-generation-regression-verification.md`。
- 唯一剩余 gate：办公室 Windows/Microsoft Excel 通过真实 `/work-hours` 流程重新生成并
  下载同一获批 7 月样本，逐个员工 Sheet 检查日期、工时、颜色、行高列宽、Print
  Preview 和下载文件名。通过前状态只能是
  `CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING`。
- 本 Session 未启动 `PUBLIC-DEPLOY-04`。
