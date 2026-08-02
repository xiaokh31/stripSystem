# WAGE-HOURS-08 工资工作簿生成回归验证

日期：2026-08-01 MDT  
结论：`CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING`

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
  50 页；normalized style differences 为 0，受保护调整 Sheet 未改变。三张全页联系表及
  模板/6 月/7 月各第 1–3、46–50 页的 24 张原分辨率高信号页面已人工检查；日期、工时、
  上下班时间、午休、颜色、边框和排版一致，无历史业务值泄露或截断。
- Worker：Ruff 通过；243/243 pytest 通过。
- API：lint/typecheck 通过；51 suites / 409 unit tests、21 suites / 131 E2E tests 通过。
- Web：lint/typecheck 通过；285/285 tests 和 Next.js production build 通过。
- Prisma：39 migrations，schema up to date；本 Task 无 schema 变更，不需要 migration。
- `scripts/healthcheck.sh` 最终通过全部服务、静态资源和 storage 检查；`git diff --check`
  通过。Web production build 在运行中容器内更新 `.next` 后按运行手册重启 Web/nginx，
  避免旧进程 manifest 与新静态 chunk 不一致。

## 唯一剩余外部验收

当前 macOS/Docker 环境没有 Microsoft Excel。办公室必须在 Windows/Microsoft Excel
通过真实 `/work-hours` 受保护流程重新上传已批准的同一 7 月样本，执行 Parse、Generate
并下载工作簿；检查所有员工 Sheet 的日期、工时、颜色、行高、列宽、Print Preview 和
下载文件名。该检查通过后才能把 Task 更新为 `DONE`。

本 Session 未开始 `PUBLIC-DEPLOY-04`。
