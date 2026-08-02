# WAGE-HOURS-08 工资工作簿生成回归验证

日期：2026-08-01 MDT  
结论：`CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING`

## 现场复现结论

`FILE-UPLOAD-01` 完成并使现场样本文件名/上传链路恢复后，当前基线首次通过真实
Chromium、nginx、BullMQ、API、PostgreSQL 和 Python Worker 执行 7 月现场样本时，
Parse 与 Generate 均成功。因此当前 checkout 无法重现用户报告发生时的准确历史
异常，不能把某个未经观察的假设伪称为唯一根因。

诊断逐项排除了当前环境中的 Unicode storage path、生产镜像模板路径/权限、7 月日期
槽位、persisted active-row schema、Sheet matching warning、输出目录权限、Worker
timeout/stdout 和异步 job propagation。同步诊断 endpoint 与 UI 使用的异步流程得到相同
期间、warning/error code counts 和有效生成物；现场流程中 warning 可复核但不阻塞，
error count 为 0。

虽然原始历史故障未在当前依赖状态下重现，审计发现旧 generation 边界可接受 schema/
batch version 不一致、0 effective output、未验证的输出 metadata，并可能直接暴露 Worker
错误文本。上述缺口均已通过 fail-closed contract 和回归测试关闭。

## 交付

- Worker 只接受 persisted wage schema/parser version 2；缺少期间、输入 schema 错误、
  模板缺失/不可读、保存失败和 post-save 验证失败均返回独立 stable stage/code。
- legacy `.xls` 先写同目录唯一 staging 文件；保存后验证非零、OLE/BIFF 可读、期间、
  Sheet inventory、written employee/day counts、manifest、文件名和 SHA，再原子替换最终
  输出。失败 staging/无效输出会被精确删除。
- 模板 SHA 在生成前后复核；warning-only 可生成，0 matched/0 written employee 或任何
  blocking error 不会产生可下载成功记录。
- API 在 Worker 返回后复核 response schema/batch version、validated flag、计数、期间、
  storage-root containment、文件大小和 SHA；不再为 invalid/missing artifact 伪造 metadata。
- Worker invocation、timeout、empty stdout、invalid stdout 只向 job/UI 传播稳定 code 与
  安全 stage，不传播绝对路径、Python stdout、stack 或个人数据。
- `/work-hours` 将稳定 code 映射为 typed English/中文可操作提示；仅 generation failure
  显示 Retry，继续使用 default-deny allowlist，只显示 `WAGE_RECORD_XLS`。
- 新增 `scripts/run-wage-hours-08-e2e.sh verify`，以唯一前缀运行故意失败 cleanup 探针、
  真实现场成功流、受保护下载、BIFF 审计、源 SHA 复核和脱敏 LibreOffice 视觉门禁。

## 脱敏现场证据

- 输入期间：`2026-07-01` 至 `2026-07-31`；active employee-day rows：465。
- Parse job：succeeded；Generate job：succeeded；同步诊断：HTTP 201 且生成成功。
- warning counts：`MISSING_PUNCH_TIMES=296`、`ODD_PUNCH_COUNT=18`、
  `WAGE_TEMPLATE_SHEET_UNSUPPORTED_CONTRACT=1`、
  `WAGE_TEMPLATE_SHEET_NOT_MATCHED=2`、
  `WAGE_TEMPLATE_EMPLOYEE_NOT_MATCHED=8`；blocking error count：0。
- 生成/API 下载/Web 受保护代理下载 SHA-256：
  `b318a4a0828b938e7d8fe0aec704db4ee0a5d2d9ac1d970dc08a4c55778464a9`；
  size：76288 bytes；下载 filename period 已验证。
- BIFF 审计：10 Sheets、7 个完整 7 月员工 Sheet、217 个期间日期单元格、93 个正工时
  单元格；结果 `PASS`。
- 现场源 SHA-256 始终为
  `63927d94a027f77b41ce4345e38fb9f7b9df8b8d44b989e710fe7f50f4172597`；
  模板 SHA-256 始终为
  `6f2fb31f54e7cca39e696c11e8891f0a6e36041c28b98f1d287f703f9ecf375a`。
- 报告、日志和可提交 fixture 未记录员工姓名、Sheet name 或打卡时间；真实下载副本和
  runtime 已在 runner 成功/失败两条路径后清理。

## 自动化与视觉结果

- Compose 全栈冻结锁文件重建通过；API、Web、Worker、PostgreSQL、Redis、nginx healthy。
- Worker：238/238 pytest；相关 Ruff check 与 format check 通过。
- API：lint/typecheck 通过；51 suites / 408 unit；21 suites / 131 E2E；Nest production
  build 通过。
- Web：lint/typecheck；285/285 tests；Next.js production build 通过。
- Prisma：39 migrations，schema up to date；本 Task 不需要 schema migration。
- 专用真实 Chromium 主流程通过 upload -> async Parse -> refresh -> async Generate ->
  UI list refresh -> Web 受保护代理 download；API download 只作 bytes/SHA 对照，同步
  endpoint 只作生成 contract 诊断。en/zh-CN、light/dark、390/1366/1920、refresh、locale
  switch、真实 200% browser zoom、document overflow、console/pageerror 和非导航中止网络
  failure 门禁通过；故意失败 cleanup 探针也通过。真实数据页面没有 screenshot/trace/video。
- 脱敏模板、6 月和 7 月工作簿各渲染 3 页。结构审计确认 3 Sheets、2 eligible Sheets、
  0 normalized style differences、special Sheet unchanged；全部原图和三张联系表已人工
  检查，日期、工时、上下班时间、合计、边框和排版清晰，无容量填充值泄露或内容截断。
- `scripts/healthcheck.sh`、脚本语法/Python compile、fixture SHA 和 `git diff --check`
  通过；测试 DB、storage 和真实 runtime 精确零残留。

## 唯一剩余外部验收

当前 macOS/Docker 环境没有 Microsoft Excel。办公室必须在 Windows/Microsoft Excel
通过真实 `/work-hours` 受保护流程重新上传已批准的同一 7 月样本，执行 Parse、Generate
并下载工作簿；逐个员工 Sheet 检查日期、工时、颜色、行高列宽、Print Preview 和下载
文件名。该检查通过后才能把 Task 从
`CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING` 更新为 `DONE`。

本 Session 未开始 `PUBLIC-DEPLOY-04`。
