当前未完成功能任务索引。

生成时间：
- 2026-07-18

依据：
- docs/reports/project-completion-status.html
- AGENTS.md
- docs/runbooks/fresh-windows-agent-onboarding.md（全新 Windows 机器或无历史会话的固定恢复入口）
- docs/product/01-cross-platform-mobile-scan-app.md
- docs/product/03-pallet-calculation-rules.md
- docs/adr/0002-printing-strategy.md
- docs/runbooks/native-scan-app-testing.md
- docs/runbooks/native-scan-app-release.md
- docs/reports/business-agent-execution-time-analysis-2026-07-15.html
- docs/product/04-adaptive-parser-profiles.md
- docs/adr/0004-approved-parser-profiles.md
- HANDOFF.md

状态判定规则：
- 当前是否正在执行以及受监督终态，以 `.codex/business-agent-runs/*/state.json` 为准。
- 功能完成证据和外部验收项，以 `docs/reports/project-completion-status.html` 为准。
- 本文件下方的历史执行记录仅用于追溯；不得因为历史标题或旧“下一步”文字重复执行已经完成的 Task。
- 全新 Windows checkout 不会携带 gitignored supervisor 运行记录、`.env`、数据库、`storage/`、真实样本或签名证书；
  新 Agent 必须先按 `docs/runbooks/fresh-windows-agent-onboarding.md` 做环境和外部资产核对，再选择唯一 Task。

结论：
- P0-P3 Web/API/Worker 核心业务闭环已完成。
- 2026-07-18 新增并确认 PARSER-PROFILE-01 至 08：失败导入正式关联手工结果，建立 deterministic workbook
  fingerprint/mapping profile；首版必须由授权人员明确批准，批准后仍逐单复核，只有连续 3 个不同 SHA 且无实质
  parser 修正的导入才进入 TRUSTED 自动解析。任何实质修正会清零当前连续证据；可信结果后续被实质修正会降回
  REVIEW_REQUIRED。API/Worker 只返回 stable code/enum/raw evidence，全部 Web 状态严格进入 en/zh-CN catalog。
- P0 现场回归 `UNLOAD-REPORT-01` 已按业务决定 A 完成仓库实现和当前环境自动化：保留 8 个主槽位后使用 8 个白色业务行，超过 16 才分页；真实 CAAU 的 9 个目的仓现为 1 个 populated worksheet/1 张 A4 landscape 页面。rich-text、真实 Worker/API 下载、audit/storage、模板 SHA、Worker/API/Web 全量门禁均通过；合成边界工件进一步验证 16 个目的仓含末行多行长文本仍为 1 页、第 17 个目的仓生成 2 worksheets/2 页，12 张全页/crop 逐图检查通过；仅剩 Windows/Microsoft Excel Print Preview 与 Print to PDF 外部验收。
- Wage / Unloading Wage 已完成到当前报告范围；UNLOAD-WAGE-12 已修复 monthly unloading summary 空白导出回归。
- WEB-I18N-01 已完成现场反馈后的全量缺口审计和运行时覆盖回归；WEB-I18N-02 已修复柜号 `SMCU1225466` 暴露出的 container detail rule metadata 和 warning message 本地化缺口。
- 新增 P0 托盘规则升级 `UNLOAD-PALLET-08` 至 `10`：旧的 1.7/1.8/2.2 直接 CBM 除数将替换为“可配置托盘长宽 * 固定目的仓限高”的容量模型；默认尺寸为 `1.0m * 1.2m`，YEG1 从 `+5` 改为 `+4`，courier / Goodcang / 私人及商业地址归入 2.2m 其他目的仓，明确木箱和可判定超大件按一件一托。UNLOAD-PALLET-05 至 `07` 的默认纸箱、修正保存和 UPS 非零修复仍须保留。
- Monthly unloading summary 已修复 `2026-07` 空白导出 false-success：本地库存在 18 个已拆完口径柜子，其 recorded completion month 为 `2026-06`；页面无显式月份时会打开最新可用月份，显式空月会提示可用月份并阻止 0-row export。
- P6 standalone native scan app 已按 Android+iOS pilot route 条件通过；Android/iOS 继续作为当前活动交付范围。
- 2026-07-15 产品决定暂不交付 Windows 原生安装包。P6-MOBILE-09 至 13 已统一标记
  `Task-Status: ARCHIVED`，Windows RNW project、camera/Credential Locker、MSIX 打包和 Windows device smoke
  不再属于当前执行队列或 release blocker；既有 source boundary、readiness gate、checklist 和 handoff docs 保留供以后恢复。
- P1 async queue 已完成 API/DB/Web 垂直线；P1-QUEUE-02 已修复 BullMQ/ioredis teardown，并补 Docker concurrency regression。
- P4 print agent 仍是 Deferred / Not Activated，不是当前 pilot 必做。
- Windows 目标机部署验证和包装类型真实样本验证属于上线前验收任务。
- 默认纸箱托盘计算修复已完成；包装类型真实样本验收仍需等待业务提供 pilot workbook。
- UPS/courier destination 托数为 0 的 pilot 阻塞缺陷已在 UNLOAD-PALLET-07 修复。
- IMPORT-DELETE-01 已完成代码实现：删除导入会清理原始上传清单和关联 generated files，保留 load job / operational pallet / pay container blocker 和 deletion audit。
- 新增后台整体风格和 dashboard redesign 任务组：WEB-DASHBOARD-00 到 WEB-DASHBOARD-04。WEB-DASHBOARD-00 已完成 Manifest Control Room 设计 brief；WEB-DASHBOARD-01 已新增真实 `/api/dashboard/operations` 汇总 API，按权限裁剪 sections，API 只返回稳定 code/labelKey/enum/raw source data；WEB-DASHBOARD-02 已完成 Manifest Control Room Shell、宽屏 nav rail、operational topbar、视觉 tokens 和基础 dashboard 组件；WEB-DASHBOARD-03 已用真实 API 重做 `/` 运营中控台首页；WEB-DASHBOARD-04 已完成 dashboard QA、i18n hard gate、Docker full-stack healthcheck 和 ADMIN/OFFICE/WAREHOUSE/HR_MANAGER/WAREHOUSE_MANAGER role smoke。
- AUTH-SESSION-01 已完成：默认浏览器登录会话改为 400 天，JWT `exp`、登录响应 `expiresIn` 和 Web cookie `Max-Age` 保持一致；保留 `JWT_EXPIRES_IN_SECONDS` 覆盖、logout 清 cookie、禁用用户/权限变化后端实时校验、过期 cookie middleware 跳转和 auth/session i18n。
- 人工消库存任务组已完成：INVENTORY-ADJUST-01 到 03 已交付独立库存调整语义，未将托盘伪装成扫码 `LOADED`；Docker full-stack scan/report/audit/i18n 回归已通过。
- Product Planning Agent 标准已更新：以后每个新增需求和拆分任务都必须包含严格 i18n 管理要求，API 返回 stable code/enum/labelKey/raw data，Web 通过 locale catalog/status-label helpers 显示单语文案。
- WEB-DASHBOARD-05/06 已完成：`LifecycleDockStrip` 使用稳定七轨 responsive grid 和 lane row layout；Docker
  Chromium 已通过 en/zh-CN、light/dark、390/768/1366/1920、真实 125%/200% zoom、几何/字体/交互断言，
  并逐张浏览 44 张最终截图。
- 新增柜子/库存运营优化 WEB-OPS-06 至 09：两个页面共享可访问的柜号模糊联想；柜子索引增加创建时间和
  时间/柜号/状态六种稳定排序；库存页增加 5/10/20/50 服务端分页、同口径排序、global totals 和内容驱动高度；
  最终以不超过 36 张高信号截图完成双语、主题、RBAC、库存事务和视觉关闭门禁。
- Business Agent 耗时分析已生成：10 次有终态运行共 11:26:29，最近 6 个 Web 任务中位数 1:05:48；主要成本为
  重复 build/E2E、视觉矩阵/逐图检查和长上下文工具循环，不是依赖安装。完整证据见
  `docs/reports/business-agent-execution-time-analysis-2026-07-15.html`。
- `NATIVE-AUTH-01` repository、Docker 自动化、真实数据库/HTTP 和 iOS 非破坏性已认证矩阵已完成；三次 supervisor
  运行均返回 `CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING`。既有 9 个活动未关闭 Task 仍依赖真实样本、
  打印/Excel、Android/iOS 人工设备矩阵或目标部署主机；另有 5 个 Windows 原生/MSIX P6 Task 已归档。
  当前开发机新增 8 个 parser-profile 代码任务，必须从 PARSER-PROFILE-01 顺序执行。
- 新增 Windows PowerShell 入口 `scripts\run-business-agent.cmd`。当前无 Docker 的 Windows 主机必须用 `develop`
  implementation-only 模式，只完成业务实现、不运行任何测试/构建/服务/设备检查，且监督器会拒绝 `DONE`；完整验证
  仍交给具备环境的主机。

历史执行记录（其中多数已经关闭，实际状态以本文件“当前执行队列”和完成度报告为准）：
1. P6-MOBILE-09Native Camera Module Wiring.md
   - 已归档（2026-07-15）。Android/iOS source wiring 完成记录保留；不再执行 Windows native project 验收。
2. P6-MOBILE-10Secure Token Storage.md
   - 已归档（2026-07-15）。Android/iOS secure token 完成记录保留；Windows Credential Locker 路线停止执行。
3. P6-MOBILE-11Windows iOS Native Project Hardening.md
   - 已归档（2026-07-15）。iOS generated project/Pods/workspace 完成记录保留；Windows generated project 不再执行。
4. P6-MOBILE-12Cross Platform Device Smoke Exit Gate.md
   - 已归档（2026-07-15）。Android/iOS pilot smoke 条件通过结论保留；Windows MSIX gate 不再是活动 gate。
5. P6-MOBILE-13Windows MSIX Release Completion.md
   - 已归档（2026-07-15）。`windows:check`、构建机 checklist 和 handoff docs 作为恢复资料保留；监督器会拒绝执行。
6. P1-QUEUE-01BullMQ Async Import Generation Jobs.md
   - API/DB/Web 垂直线已实现；P1-QUEUE-02 已补齐 E2E teardown 和 Docker 并发回归。
7. UNLOAD-PALLET-05Default Carton Package Type + Hide Package Selector.md
   - 已完成。默认纸箱、不显示 package selector、missing/unknown package 不再触发人工确认 warning。
8. UNLOAD-PALLET-06Destination Correction Save Regression.md
   - 已完成。note-only、actual cartons-only、actual CBM-only、manual pallets 清空恢复 calculated final pallets 均有 Web/API 回归测试。
9. UNLOAD-PALLET-07UPS Courier Destination Pallet Count Regression.md
   - 已完成。修复 UPS/PUROLATOR/PURO/P/A 等 courier/private address 导入后有箱数和体积却 calculated/final pallets 为 0 的现场回归；根因为 API summary/plan packageType key mismatch。
10. WEB-I18N-01Full Localization Gap Audit + Runtime Coverage.md
   - 已完成。重新审计 Web 全模块 i18n，补齐漏翻译、动态文案、属性文案和语言切换 E2E。
11. IMPORT-DELETE-01Cascade Storage File Cleanup.md
   - 已完成。API delete 会逐个校验 storage root containment 后删除原始文件和 generated file storage 文件，generated_files 不再作为 blocker；仅 load job、operational pallet/scan history、pay container usage 阻止删除；correction feedback 记录删除人、时间、原因、清理数量、路径和 missing-file warning。Web 确认/成功/错误文案已更新。
12. WEB-I18N-02Container Detail Rule Warning Localization.md
   - 已完成。柜子详情页 rule summary、container warnings、destination warnings/errors 已按 locale 管理，覆盖 `SMCU1225466` 暴露出的 `Rule/Basis/Rounding` 和 warning code 文案。
13. UNLOAD-WAGE-12Monthly Unloading Summary Blank Export Regression.md
   - 已完成。API 返回 available months metadata，0-row export 返回 `UNLOADING_SUMMARY_NO_ROWS_FOR_MONTH` 且不新增 generated_file；Web 默认页回退到最新可用完成月份，显式空月显示可用月份提示并禁用导出；worker 0-row 写出也返回 ERROR 且不生成 xlsx。
14. WEB-DASHBOARD-00Back Office Visual Direction.md
   - 已完成。新增 Manifest Control Room 设计 brief，固化 PC 后台视觉方向、Dock Lane Strip signature、dashboard 信息架构、API contract governance、i18n hard gate 和 WEB-DASHBOARD-01 至 04 任务拆分；本阶段不改运行时业务代码。
15. WEB-DASHBOARD-01Operations Dashboard Data API.md
   - 已完成。新增受登录保护的 `GET /api/dashboard/operations`，从现有 DB 表实时聚合 health、work queue、container lifecycle、inventory、load jobs、exceptions、monthly summary、wage/attendance 和 recent activity；按用户权限裁剪 sections 并返回 `hiddenSections`；API response 不返回本地化 UI 文案。
16. WEB-DASHBOARD-02Shell Visual System Redesign.md
   - 已完成。新增 Manifest Control Room 全局 tokens、desktop 左侧 nav rail、mobile 横向导航、operational topbar、当前用户/角色/语言/登录退出/健康状态区域、当前路由 active state，以及 `DashboardPanel`、`MetricTile`、`StatusPill`、`ProgressBar`、`DockLaneStrip`、`PressureBar`、`ExceptionList` 基础组件；新增 Shell/dashboard i18n 和 focused render/helper tests。
17. WEB-DASHBOARD-03Operations Dashboard UI.md
   - 已完成。`/` 首页改为调用真实 `GET /api/dashboard/operations` 的运营中控台，覆盖 Ops Header、range/month URL filters、Work Queue、lifecycle Dock Lane Strip、Inventory Pressure、Active Load Jobs、Exceptions、Monthly Summary/Wage queues、Role-aware shortcuts 和 Recent Activity；新增 dashboard labelKey/status/i18n helpers、API client test、flow tests 和 component render tests。
18. WEB-DASHBOARD-04Dashboard QA I18n Regression.md
   - 已完成。补 dashboard Playwright smoke，覆盖 ADMIN/OFFICE/WAREHOUSE/HR_MANAGER/WAREHOUSE_MANAGER 权限裁剪、English -> 中文 -> refresh -> English、桌面 1366/1920 和 mobile 390 宽度无页面级横向溢出；更新 core/auth/locale E2E 对新首页的断言；i18n unit gate 新增 API dashboard labelKey catalog 覆盖；Docker full-stack 重建后 `/api/dashboard/operations` 经 nginx 可用。
19. AUTH-SESSION-01Persistent Browser Login Session.md
   - 已完成。默认 `JWT_EXPIRES_IN_SECONDS` 改为 `34560000` 秒（400 天），API JWT `exp`、登录响应 `expiresIn` 和 Web `bestar_auth_token` cookie `Max-Age` 同口径；Web middleware 会对过期/畸形 cookie 清理并跳转登录；API guard 继续每次从数据库加载当前用户、active 状态、角色和权限；登录错误和 session 文案已进入 i18n catalog；runbook 已记录默认值、环境变量覆盖、浏览器 cookie 上限和安全取舍。
20. NATIVE-UX-00Native Warehouse Console Visual Direction.md
   - 已完成。固化 Loading Bay Dispatch Console 视觉方向：登录后以 Bay Board 为首屏主体验，技术配置/设备/权限详情仅进 Settings/Diagnostics；明确 high-visibility token、任务行信息密度、native i18n hard gate、启动性能预算及 NATIVE-UX-01 至 04 实施边界。本阶段未修改运行时代码、扫描交易、离线队列、权限或库存规则。
21. NATIVE-UX-01App Shell Navigation and Native I18n Foundation.md
   - 已完成。native app 新增 session 驱动的 Login/Load Jobs/Scan/Settings 界面状态，恢复有效会话后进入装车任务；服务器地址、连接测试、语言和设备标识已移入 Settings，常用页面不再展示 API/role/permission/QR 技术信息。新增 en/zh-CN catalog、stable API code 映射、locale 持久化、catalog parity 与 navigation 测试；不改变 API、JWT、扫描、离线队列或权限业务规则。
22. NATIVE-UX-02Load Job Bay Board Redesign.md
   - 已完成。登录后首屏改为 Loading Bay Dispatch Console 的 Bay Board；真实 API load jobs 按 in-progress、canScan、scheduled departure、createdAt/id 稳定排序，支持目的仓/装车单/月台/车辆搜索。任务行固定显示目的仓、装车单、月台/车辆、已装/计划、剩余和可扫码状态；使用 `FlatList` windowing 并在刷新失败时保留上次成功数据。新增 100 条任务稳定排序、搜索和原 API route 回归测试。
23. NATIVE-UX-03Scan Workspace Visual Simplification.md
   - 已完成。扫描工作台默认只呈现任务身份、后端进度、托盘标签输入/扫码枪 Enter、原生相机和固定高度结果反馈；最近扫描显示柜号、目的仓、托盘号与后端进度。月台修改、完成装车和主管覆盖改为按需展开的次级操作；离线队列默认只显示待同步数量，手动同步按需展开。保留真实 scan API、offline queue、duplicate/invalid/closed/override 规则和原 loadJobId。
24. NATIVE-UX-04Startup Performance and Cross Platform UX Exit Gate.md
   - 部分完成。已增加只记录 elapsed duration 的 `process-start`、`first-shell`、`session-resolved`、`load-jobs-ready` 开发期性能标记；启动时设置/device ID/locale 并行，session 决定 shell 后才读取离线队列；Android release clean build 已通过，并修复 AsyncStorage Codegen JNI 目录缺失的 CMake 构建阻塞。2026-07-11 Android MI 8 SE 与 iPhone 15 Pro 的 Release 均已安装启动，但尚未诚实记录同机五次冷启动中位数、双语页面与扫码回归；Windows 仍缺 RNW project/MSIX/设备 smoke，任务不得标记完成。
25. NATIVE-UX-05System Adaptive Color Theme.md
   - 部分完成。Native React 内容已改为 light/dark 语义 token 和缓存样式工厂，`useColorScheme` 运行中变化会刷新 UI 与 StatusBar，不读取 storage、不重置 screen/session/loadJobId/输入或队列。Android 改为 DayNight 启动画面与 chrome，并集中配置状态栏/导航栏/Force Dark 防护；新增 resolver 与 token parity unit tests。Android Release build、lint 和 45 个 unit tests 已通过；MI 8 SE Release 深色 Login 已真机验证。该机型对按钮内在宽度的多词文本发生像素裁剪，已让按钮文本占满父按钮宽度并在同机验证 `Sign in`、`Open settings` 完整显示。MIUI 拒绝 shell 浅色模式切换，iOS/Windows 系统切换、scanner chrome 与高对比实机项仍未验证，任务不得标记完整完成。

26. WEB-I18N-04Restore Explicit Localization Runtime Contract.md
   - 已完成。新增唯一的强类型 `createTranslator(locale).t(key)` 契约，并由 `useI18n()` 向 Client Components 暴露相同 `t`；开发/测试会拒绝缺失中文，生产返回本地化通用回退且记录诊断。root metadata、404/error、OfficeShell/nav/language/theme、登录、管理权限错误、Dashboard 和其共享组件均已显式翻译；移除遗留 document walker，未恢复 `MutationObserver`。Web lint/typecheck、186 项 unit tests、Docker production build 和 nginx 中文 SSR smoke 已通过。业务模块全量迁移和完整 SSR/hydration/role/theme gate 已分别由 WEB-I18N-05/06 完成。

27. WEB-I18N-05Migrate All Web Modules to Explicit Localization.md
   - 已完成。Import、Container、Inventory/Reports、Load Jobs、Web mobile scan、Work Hours、Unloading Wage/Summary、Admin/Settings 和全局可见文案均改为显式 Server/Client translator；status/reason/generated file/destination type/permission/settings metadata 由 stable code/key 映射，未知 API 错误只显示本地化通用提示。`i18n.test.ts` 加入全 app/components translator 及 legacy helper 门禁、catalog parity 和中文泄漏扫描，users/roles 强制动态 SSR 避免缓存错误权限或旧 locale。2026-07-11 Web lint、typecheck、186 项 unit tests、`git diff --check`、Docker production build、健康检查及真实 ADMIN 中文 SSR smoke（roles/settings）已通过。完整无 JS/hydration/route/role/theme matrix 已由 WEB-I18N-06 完成；宿主机 build 仍受缺失 `lightningcss.darwin-x64.node` 可选原生依赖阻断，Docker Linux production build 已通过。

28. WEB-I18N-06Full Localization No Flash Regression Gate.md
   - 已完成。移除 source-string 反向翻译和 DOM 后处理路径；AST 门禁直接拒绝原始 `<th>File</th>`、`placeholder="Select reason"`、`setError("Save failed")`，只接受显式 `t(...)`，并对具名 `MessageKey` 组件边界及 `data-i18n-ignore` 技术诊断做窄范围豁免。删除全局 loading boundary，使 no-JS SSR 直接输出完整内容而非用 opacity/body hidden 回避首帧。Docker full-stack Playwright 在 desktop/mobile 覆盖登录和 17 条主业务路由的 en/zh-CN no-JS SSR、中文首帧/hydration、Light/Dark 持久化与 client navigation；无 hydration mismatch、console warning 或 MutationObserver 循环。真实本地 ADMIN/OFFICE/WAREHOUSE/HR_MANAGER/WAREHOUSE_MANAGER role smoke 通过，未创建/重置账号。Web lint/typecheck、186 项 unit tests、`git diff --check`、Docker production build/health 通过；宿主机直接 build 仍仅受缺失 `lightningcss.darwin-x64.node` 可选依赖阻断。

29. AGENT-AUTONOMY-01Business Agent Non Interactive Execution.md
   - 已完成并于 2026-07-12 加强。旧版 `approval_policy = "never"` + `:workspace` 只禁止提问但没有授予 Docker socket 等能力；canonical/installed profile 与 launcher 现固定 `danger-full-access`、`never` approval 和仓库 root。完整 Task 统一使用 `scripts/run-business-agent.sh task '<task-file>'`：结构化 schema 允许内部 `CONTINUE`，监督器会自动 resume 同一 Task，并拒绝错误 Task ID、格式错误、伪终态进度文本和失败进程；只接受 `DONE`、`CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING` 或有效 `BLOCKED`。新增单仓库互斥锁、20-turn 默认 guardrail、gitignored JSONL/state artifacts 和 fake-Codex 离线回归；直接 prompt、原始 `exec` 与手工 `resume` 已拒绝。profile capability、Docker socket、execpolicy 和监督状态机 smoke 均通过。
30. UNLOAD-INVENTORY-01Unloaded Container Pallet Inventory Synchronization.md
   - 已完成。新增共享 `ContainerPalletInventorySyncService`、container/destination/pallet row lock 与统一 pallet ID/QR builder；办公室 `UNLOADED` 状态更新、container detail 拆柜工资完成和 pay container 完成均在同一事务先按每个目的仓 `finalPallets` 对账 Pallet rows，再写完成状态/审计。安全 PLANNED/LABEL_PRINTED 托盘保留 identity/history，缺少记录补建并写 CREATED event，安全 surplus 写 CANCELLED event；loading/loaded/adjusted/exception surplus 以稳定冲突码整体拒绝。库存保留历史 `totalPallets`，新增 `activeTotalPallets`，Web Dashboard/containers/inventory report 改用 active total。2026-07-12 API typecheck、25 unit suites / 174 tests、15 E2E suites / 92 tests、scoped API ESLint、Web typecheck/186 unit tests、Docker Web lint/production build 和 authenticated nginx API smoke 均通过；Docker smoke 仅读取现有记录，未修改业务数据。

31. DOCKER-DEV-01Cleanup Host Jest Install and Enforce Docker Only Workflow.md
   - 已完成。新增固定 allowlist 的 `scripts/cleanup-host-dev-dependencies.sh`，在 dry-run 中记录 path/realpath/type/size/mtime，`--apply` 只删除 root、API、Web 三个仓库内 host `node_modules`，不会触及 `storage/`、`.git`、样例、数据库备份或 Docker volumes。宿主三路径现均为 absent，`.env`、业务 Agent 文件和 shell startup 中没有持久 `NODE_ENV`、`QUEUE_ENABLED`、`JEST_*` 覆盖，原有 Jest/ts-jest、lockfile 和 E2E setup 保留。为避免 Docker Desktop 重叠 bind mount 把依赖重新写回 host，API/Web/worker 改为在 build 时复制源码，运行时仅 bind-mount真实 `storage/`；当时的依赖 named volumes 已由 DOCKER-CACHE-01 后续替换为镜像内冻结依赖层。2026-07-12 Docker full stack/health、API Jest target unit（4）、Web lint/typecheck/186 unit、worker 112 pytest（232.13s）、Prisma migrate status、execpolicy allow/deny smoke 与 `git diff --check` 均通过。

32. DOCKER-CACHE-01Docker Dependency Layer and Startup Cache Optimization.md
   - 已完成。API/Web/Worker/E2E Dockerfile 先复制依赖清单并用 frozen lockfile 安装，再复制源码；pnpm/uv BuildKit cache mount 与固定 pnpm 版本已加入，Compose 移除会遮蔽 image 的 Node、`.next`、`.venv` dependency volumes。API/Web 运行时直接迁移/启动已构建产物，worker 不再启动时同步依赖，nginx 在 upstream recreate 后自动刷新。新增 `scripts/verify-docker-cache-contract.sh`，静态契约、源码只变缓存复用、manifest/lock 变更失效探针均通过；热构建由基线 147.56 秒降至 5.88 秒。Docker full stack health、API 220、Web 188、Worker 124 tests、Prisma 22 migrations、Playwright CLI、PostgreSQL/storage 持久化均通过；完整证据见 `docs/reports/docker-cache-verification-2026-07-13.md`。

当前执行队列（2026-07-18 MDT 复核）：

### A. 当前开发机立即执行

`WEB-DASHBOARD-06` 已通过并用同一证据关闭 `WEB-DASHBOARD-05`；`WEB-OPS-01` 已完成具名 2048px
workspace、全路由迁移和 Docker Chromium 宽屏/窄屏/200% zoom 门禁；`WEB-OPS-02` 已完成柜子详情
destination-first DOM/视觉顺序与权限/交互/双语视觉回归；`WEB-OPS-03` 已完成 canonical `/inventory`、
指定柜子/目的仓人工消库存、跨标签后端刷新、RBAC 和全宽度视觉回归；`WEB-OPS-04` 已完成隔离动态运营时钟、
单 timer、formatter cache、hidden/narrow pause 与 CDP/heap 评估；`WEB-OPS-05` 已完成 01-04 的最终 i18n、
视觉、RBAC、库存事务与性能关闭门禁；`WEB-OPS-06` 已完成共享 database-backed 柜号联想、独立权限边界、
稳定 identity 与可访问 combobox；`WEB-OPS-07` 已完成独立柜子索引 contract、持久化创建时间、全部柜子口径与
createdAt/containerNo/status 六种稳定排序；`WEB-OPS-08` 已完成库存服务端分页、同口径排序、全局 totals、跨页
selection 与自适应工作区；`WEB-OPS-09` 已完成 06-08 的 i18n、accessibility、RBAC、库存事务和视觉关闭门禁。
`NATIVE-AUTH-01` 的 repository、Docker 自动化、真实 PostgreSQL/HTTP 和 iOS 非破坏性已认证矩阵也已完成；
三次 supervisor 运行均合法停在 `CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING`。不要第四次启动
`NATIVE-AUTH-01`，也不要重复 WEB-OPS 关闭任务。

新确认的 parser-profile 开发线路必须逐个使用 fresh supervised Session：

1. `PARSER-PROFILE-01Learning Case Linkage and Domain Schema.md`
2. `PARSER-PROFILE-02Deterministic Workbook Fingerprint and Mapping Engine.md`
3. `PARSER-PROFILE-03Learning Case Preview Replay and Candidate APIs.md`
4. `PARSER-PROFILE-04Office Mapping Wizard and Failed Import Flow.md`
5. `PARSER-PROFILE-05Completion Snapshot Approval and Profile Governance.md`
6. `PARSER-PROFILE-06Review Mode Evidence and Three Acceptance Trust Gate.md`
7. `PARSER-PROFILE-07Trusted Auto Parse Drift and Fallback Integration.md`
8. `PARSER-PROFILE-08Golden Sample Full Stack I18n Exit Gate.md`

01 至 07 可先使用现有真实 fixtures 完成通用实现和自动化；08 要让一个新客户布局真实进入 TRUSTED，至少需要
4 份不同 SHA 的 source + approved outcome pair（1 份建立/批准，后续 3 份连续无实质修正证据）。
`PARSER-PROFILE-01` 已完成 schema/migration、正式 learning-case/manual-result 关联、RBAC、审计、并发约束和
import deletion blocker；当前下一 Task 是 `PARSER-PROFILE-02`，
不得一次把多个 Task 放入同一 Session。

### B. 获得真实数据、打印环境或 Android/iOS 设备后

1. `UNLOAD-PALLET-04Packaging Type Pilot Verification + Correction.md`
   - 仅在业务提供真实/脱敏私人、商业或其他目的仓 workbook 后执行，验证默认纸箱、明确木箱、可靠件数、
     超大件和混合货型；不得用 synthetic fixture 冒充 pilot 数据。
2. `UNLOAD-PALLET-10Pallet Policy Full Stack Artifact and I18n Regression.md` 外部关闭项
   - 仓库代码和自动化已经完成，不要重复执行全量开发。复用 04 的真实样本，并在目标打印机/PDA 上完成
     150mm x 100mm、25mm QR 实测和扫码签字后更新为 Done。
3. `UNLOAD-REPORT-01Palletizing Standards Rich Text Print Clipping Regression.md` 外部关闭项
   - 仓库代码和自动化已经完成，不要重复开发。在办公室 Windows/Microsoft Excel 完成 Print Preview 与
     Print to PDF，确认每页 `when stored.` 未裁切后更新为 Done。
4. `NATIVE-AUTH-01Revocable Persistent Native Session.md` Android/iOS 外部证据
   - iOS 只剩人工双语视觉，以及会清除当前 session 的 online/offline logout、管理员 revoke、账号 inactive；
     Android Release 仍需 App/设备重启、到期 refresh、离线、logout、revoke、inactive 和双语矩阵。
   - 这些是设备验收，不是新的代码开发。按 `docs/reports/native-auth-01-revocable-session-verification.md` 记录证据；
     设备、一次性账号或人工点击条件不齐时不要再次启动 supervisor。

Android/iOS 的 theme、header、冷启动和双语扫码证据可以与上述设备矩阵一起采集，但 `NATIVE-UX-04/05/06`
当前只要求 Android/iOS 结论。按以下顺序补证据，不再等待 Windows MSIX：

5. `NATIVE-UX-05System Adaptive Color Theme.md`
   - 合并采集 Android/iOS light/dark、运行中切换、native chrome/scanner 和 locale x theme 证据。
6. `NATIVE-UX-06Android App Header Title Clipping Regression.md`
   - 关闭 Android en/zh-CN、font scale 1.0/1.3/2.0、小屏标题无裁切，并保留 iOS 共享布局对照。
7. `NATIVE-UX-04Startup Performance and Cross Platform UX Exit Gate.md`
   - 合并 Android/iOS release 冷启动中位数、双语页面、无障碍与核心扫码证据。
8. `CROSS-UX-QA-01Persistent Session Theme Locale Regression.md`
   - 在 NATIVE-AUTH-01 与 NATIVE-UX-04/05/06 的 Android/iOS 证据齐全后，执行最终 Web + Android/iOS
     session/theme/locale/header 组合回归。

### C. 已归档：Windows 原生安装包 / MSIX

- `P6-MOBILE-09`、`P6-MOBILE-10`、`P6-MOBILE-11`、`P6-MOBILE-12`、`P6-MOBILE-13` 均已标记
  `Task-Status: ARCHIVED`。监督器会在创建 Session 前以 exit code 78 拒绝执行。
- 归档包括 Windows RNW generated project、Windows camera decoder、Credential Locker、Windows theme/high contrast、
  MSIX build/sign/install 和 Windows device smoke。Android/iOS 已完成成果不受影响。
- 不得通过复制、改名或直接 prompt 绕过归档。恢复时必须先获得产品明确批准，再移除五个 Task 的归档标记，
  恢复 NATIVE-AUTH/UX/CROSS 的 Windows 验收范围，并同步更新本索引和完成度报告。

### D. 上线前最后执行

9. `P5-PILOT-01Windows Target Deployment Verification.md`
    - 在目标 Windows 11 主机完成 Docker full stack、生产 secrets、真实账号、真实 Excel、报告/标签打印、
      PDA/扫码枪、备份恢复、告警/SIEM schedule 和业务签字。该任务必须最后关闭。

Pilot 前必须验收：
1. `UNLOAD-REPORT-01`：Windows/Microsoft Excel Print Preview 与 Print to PDF 无裁切签字。
2. `UNLOAD-PALLET-04` / `UNLOAD-PALLET-10`：真实业务 workbook、目标打印机实体尺寸和 PDA/扫码枪签字。
3. `NATIVE-AUTH-01` / `NATIVE-UX-04/05/06` / `CROSS-UX-QA-01`：Android/iOS 可撤销长会话、
   启动性能、secure store、session/theme/locale/header/device smoke。Windows 原生/MSIX 已归档，不是当前 pilot gate。
4. `P5-PILOT-01`：目标 Windows 11 主机的 full stack、secrets、账号、真实业务、备份恢复和告警验收。

Deferred，按现场反馈再执行：
1. P4-PRINT-03Local Print Agent Decision + Prototype.md
   - 只有 PDF/manual printing 在 pilot 中不稳定时执行。

不需要新开任务的项目：
- Account/RBAC：完成。
- Work hours wage：完成。
- Unloading wage：完成。
- Temporary unloader directory：完成。
- Monthly unloading summary：完成；UNLOAD-WAGE-12 已修复空白导出回归。
- Container unloaded / delivered-to-destination status split：完成。
- Detailed pallet calculation rules：UNLOAD-PALLET-08/09/10 已完成唯一可配置 policy、托盘底面积乘固定限高、YEG1 `+4`、OTHER 分类、木箱/可靠超大件按件数、不可变结果快照、真实结构生成物、库存/重复扫码和 Docker Chromium 双语四档 viewport 关闭门禁；默认纸箱、隐藏 package selector、destination correction 保存和 UPS 非零修复均保留。外部仍待真实木箱/超大件/混合/商业地址 pilot fixture 与目标打印机签字。
- API generated Prisma lint ignore：完成。
- Monitoring / SIEM export / backup-disk alerts：完成到本地生产可落地范围。
- P1 async queue teardown + Docker concurrency regression：完成。
- DOCKER-DEV-01：完成；开发依赖、检查和构建统一走 Docker Compose，宿主 root/API/Web `node_modules` 已清理。
- DOCKER-CACHE-01：完成；依赖和 production build 固化到镜像分层，运行时不再安装/构建，源码与 manifest 缓存契约已自动验证。
- Android/iOS native scan app pilot route：条件通过。
- Windows 原生安装包/MSIX：已归档；P6-MOBILE-09 至 13 的历史实现和 handoff 资料保留，但不属于当前 pilot 前验收项。
- WEB-DASHBOARD-00 后台视觉方向 brief：完成；WEB-DASHBOARD-01 真实 dashboard API：完成；WEB-DASHBOARD-02 Shell visual system：完成；WEB-DASHBOARD-03 首页运营中控台 UI：完成；WEB-DASHBOARD-04 dashboard QA/i18n/full-stack role smoke：完成。
- 持久化登录：完成；AUTH-SESSION-01 已关闭，默认 400 天长会话并保留后端实时账号/权限校验。
- 柜子库存人工消库存：完成；INVENTORY-ADJUST-01 至 03 已覆盖 API/RBAC/audit/统计、Web/i18n 与 Docker full-stack regression。

给业务开发 agent 的建议执行顺序：
1. 后续 Task 都先安装最新 business-agent profile；macOS/Linux 使用 `scripts/run-business-agent.sh task '<task-file>'`，
   Windows PowerShell 使用 `scripts\run-business-agent.cmd install` 后再执行
   `scripts\run-business-agent.cmd develop "<task-file>"`。当前 Windows 主机没有 Docker，`develop` 只允许完成实现，
   禁止运行测试、构建、migration、服务、浏览器、模拟器或设备检查，并且只能以
   `CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING` 结束；完整验证须交给另一台具备环境的主机。不要使用直接 prompt、
   原始 `exec`、手工 `resume`、桌面版 Codex 或旧权限会话绕过监督器。
2. `WEB-DASHBOARD-05/06` 与 `WEB-OPS-01/02/03/04/05/06/07/08/09` 已关闭，不再重复启动。
3. `WEB-OPS-09` 已以 27 张高信号截图关闭严格 i18n/RBAC/库存事务门禁；不要恢复 236 张无差别截图矩阵或重跑关闭会话。
4. 当前开发机先按 PARSER-PROFILE-01 至 08 顺序执行；01 已完成，下一 Task 是 02。不得把 01-08 合并到一个 Session，
   不得在首版批准后跳过 3 个 distinct-SHA 连续复核门槛。`NATIVE-AUTH-01` 已连续三次合法返回 external pending，
   不要第四次重复运行；设备项只按现有报告人工补证据。
5. Parser-profile 线路之外的下一 Task 仍由外部条件决定：有真实/脱敏包装 workbook 时执行
   `UNLOAD-PALLET-04`；只有 iOS/Android 设备时完成 NATIVE-AUTH/UX 外部证据；有目标部署主机且其他活动 gate
   已关闭时执行 `P5-PILOT-01`。
6. Android/iOS release 实机可采集主题、标题、冷启动和双语扫码证据，并按 B-5 至 B-8 关闭活动 Native gate；
   不等待或启动 Windows App。
7. 真实/脱敏业务 workbook 到位后执行 `UNLOAD-PALLET-04`；复用同一数据和目标打印机/PDA关闭
   `UNLOAD-PALLET-10` 的外部签字。08/09/10 代码任务均已完成，不要重复建立规则或重新跑开发任务。
8. `UNLOAD-REPORT-01` 只剩 Microsoft Excel Print Preview / Print to PDF，完成外部检查后记录结果即可，
   不要重复开发。
9. P6-MOBILE-09 至 13 已归档，任何主机都不得执行。恢复需要产品批准、移除归档标记、恢复关联验收范围并同步索引/报告。
10. 所有上述外部打印、真实样本和 Android/iOS 设备 gate 结束后，最后执行 `P5-PILOT-01`。
11. `UNLOAD-INVENTORY-02`、`UNLOAD-WAGE-13`、`UNLOAD-PALLET-09`、`DOCKER-CACHE-01` 已完成，不得重复执行。
