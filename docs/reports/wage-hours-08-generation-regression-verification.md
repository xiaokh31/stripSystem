# WAGE-HOURS-08 工资工作簿生成回归验证

日期：2026-08-01 MDT；2026-08-02 更新验收结论
结论：`DONE`

## 验收结论与后续细节任务

办公室在 Microsoft Excel 中确认工资表内容和生成流程正确，但标准员工 Sheet 的 A 列
周末底色存在明确回归：浅蓝底固定落在 `THU` / `FRI`，`SAT` / `SUN` 反而未着色。
该细节随后独立拆分为 `WAGE-HOURS-09Column A Weekend Highlight Regression.md`，不再
混入本 Task 的模板供应和工资表生成故障范围。

旧审计的 `normalized style differences = 0` 只证明输出继承了模板同一物理行的 XF，
没有根据 B 列实际日期验证 A 列 weekday/fill 语义，因而把本缺陷误判为通过。后续唯一
修复 Task 为 WAGE-HOURS-09；不得为该独立细节重跑 08。用户于 2026-08-02 明确确认
WAGE-HOURS-08 已验收通过，因此本 Task 状态更新为 `DONE`。

## 根因与修复结论

旧生产配置把被 `samples/*` 忽略的真实历史工资成品
`samples/wage/20260601-0630_wageRecords.xls` 当成运行时模板。开发机偶然存在该文件，
掩盖了 clean tracked checkout、`git pull`、镜像重建和容器重建后模板不存在的供应缺口；
生产因此可返回 `WAGE_TEMPLATE_MISSING`。真实历史成品现在只保留为只读结构参考，
API、Worker、镜像和运行时均不再把它作为模板。

用户最初报告发生时的精确 Parse-success/Generate-failure 调用栈未能在当前依赖状态下
复现，因此本报告不把未观察到的异常冒充唯一历史根因。当前专用真实流程已同时关闭
独立模板、生产供应、preflight、schema/staging/validation 和安全错误传播边界。

## 独立模板与生产供应

- 新增可提交的脱敏 legacy BIFF 模板
  `apps/worker-python/templates/wage/bestar-wage-template-v1.xls`，版本
  `bestar-wage-template-v1`，固定 SHA-256：
  `f9e11d6f2c6f45b0453f8346df2ff8347f2e6f5c8b7505a642367f1dade4206c`。
- 模板由确定性 builder 从结构合同构建；连续重建字节完全一致。配套 manifest 记录版本、
  SHA、容量和结构计数，不包含员工身份或历史业务值。
- 隐私审计结果：历史日期、打卡、工时、工资结果、未批准个人数据和历史 metadata 均为 0。
  模板保留 16 个通用员工槽位和 1 个受保护调整 Sheet，共 17 Sheets、284 formulas、
  58 merges、603 ROW records、4352 COLINFO records、107 XF records。
- 生成时按持久化 active rows 确定性分配通用槽位并重命名输出 Sheet；超过 16 名员工时
  fail closed，返回 `WAGE_TEMPLATE_EMPLOYEE_CAPACITY_EXCEEDED`，不生成半成品。
- API/Worker 默认路径、Compose、`.env.example`、Worker/API Dockerfile 和部署 runbook
  均改用新模板。镜像 build 和 API startup preflight 验证 regular/non-zero、批准版本与
  SHA、OLE/BIFF 可读及只读权限；两个镜像内模板 mode 均为 `0444`。
- `scripts/verify-wage-template-supply.sh` 从只包含 tracked files 的 clean context 构建
  Worker/API 镜像，在完全缺少 ignored 历史样本的条件下验证模板存在、preflight 通过、
  SHA/版本正确且只读，并精确清理临时 context 和镜像。

## 生成合同

- Worker 只接受 persisted wage schema/parser version 2；模板 missing/unreadable、版本或
  SHA 不批准、容量不足、期间或 schema 无效、保存失败和 post-save 验证失败均返回独立
  stable stage/code。
- legacy `.xls` 先写同目录唯一 staging 文件，随后验证非零、OLE/BIFF 可读、期间、
  Sheet inventory、written employee/day counts、manifest、文件名和 SHA，成功后才原子
  发布；失败 staging 精确清理。
- 同步与异步 API 使用同一生成合同。API 复核 response schema/batch version、validated
  flag、计数、期间、storage-root containment、文件大小和 SHA，不为无效或缺失工件伪造
  metadata，也不向 UI 传播绝对路径、Worker stdout、stack 或个人数据。
- `/work-hours` 把 stable code 映射为 typed English/中文可操作提示；继续使用
  default-deny allowlist，只显示 `WAGE_RECORD_XLS`，技术工件不进入页面或普通下载链接。

## 脱敏现场证据

- 输入期间：`2026-07-01` 至 `2026-07-31`；active employee-day rows：465。
- UI 异步流程：upload -> Parse -> refresh -> Generate -> list -> protected download 全部成功；
  同步诊断 endpoint 与异步结果一致，blocking error count 为 0。
- warning counts：`MISSING_PUNCH_TIMES=296`、`ODD_PUNCH_COUNT=18`、
  `WAGE_TEMPLATE_SHEET_UNSUPPORTED_CONTRACT=1`。warning-only 未阻止有效工作簿。
- 生成工件、API 下载和 Web 受保护代理下载 SHA-256 均为
  `e8d46294a5acb6de402fd0028a01c0ccfba665e804f80a5336d1dea29ade5092`，
  size 为 124928 bytes；下载文件名期间已验证。
- 真实 BIFF 审计：17 Sheets、15 个完整期间员工 Sheet、465 个期间日期单元格、
  155 个正工时单元格，结果 `PASS`。
- 真实考勤源 SHA-256 始终为
  `63927d94a027f77b41ce4345e38fb9f7b9df8b8d44b989e710fe7f50f4172597`；
  历史工资参考 SHA-256 始终为
  `6f2fb31f54e7cca39e696c11e8891f0a6e36041c28b98f1d287f703f9ecf375a`；
  新模板 SHA 始终为批准值。
- 报告、日志和可提交 fixture 未记录员工姓名、Sheet 名或打卡时间；成功和故意失败路径
  结束后测试 DB、storage 和真实 runtime 均为零残留，源文件未改动。

## 自动化与视觉结果

- 专用 `scripts/run-wage-hours-08-e2e.sh verify` 通过 clean tracked image supply、故意失败
  cleanup 探针、真实 nginx/BullMQ/Chromium 主流程、同步诊断、受保护下载、BIFF 审计、
  源 SHA 复核、脱敏 LibreOffice 视觉门禁和最终精确 cleanup。
- 脱敏模板、6 月和 7 月工作簿各为 17 Sheets、16 个 eligible 员工 Sheet，均渲染
  50 页；旧 positional audit 得到 normalized style differences 为 0，受保护调整 Sheet
  未改变。该结果只证明模板物理行样式被保留，不证明周末业务语义正确；外部复核已确认
  其中 A 列颜色结论无效。日期、工时、上下班时间、午休、边框、排版和隐私证据仍保留。
- Worker：Ruff 通过；243/243 pytest 通过。
- API：lint/typecheck 通过；51 suites / 409 unit tests、21 suites / 131 E2E tests 通过。
- Web：lint/typecheck 通过；285/285 tests 和 Next.js production build 通过。
- Prisma：39 migrations，schema up to date；本 Task 无 schema 变更，不需要 migration。
- `scripts/healthcheck.sh` 最终通过全部服务、静态资源和 storage 检查；`git diff --check`
  通过。Web production build 在运行中容器内更新 `.next` 后按运行手册重启 Web/nginx，
  避免旧进程 manifest 与新静态 chunk 不一致。

## 外部验收结果与后续

用户于 2026-08-02 明确确认 WAGE-HOURS-08 已验收通过，本 Task 已标记 `DONE`。该结论
关闭 08 的模板供应、Parse/Generate、下载与工资表业务流程，不表示替代后续独立
WAGE-HOURS-09 的周末底色专项验收。

WAGE-HOURS-09 已完成当前环境仓库实现和自动化：新版语义审计能在旧 6/7 月输出上各以
36 个 mismatch 稳定失败，新输出跨 16 个标准员工 Sheet 的 976 个日期格全部通过；
真实 Chromium、cleanup/privacy、LibreOffice 视觉、Worker/API/Web 全量门禁也已通过。
09 当前仍仅等待 Windows Microsoft Excel 专项复核，详见
`docs/reports/wage-hours-09-weekend-highlight-verification.md`。

本 Session 未开始 `PUBLIC-DEPLOY-04`。
