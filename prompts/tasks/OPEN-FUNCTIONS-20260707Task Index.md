当前未完成功能任务索引。

生成时间：
- 2026-07-11

依据：
- docs/reports/project-completion-status.html
- AGENTS.md
- docs/product/01-cross-platform-mobile-scan-app.md
- docs/product/03-pallet-calculation-rules.md
- docs/adr/0002-printing-strategy.md
- docs/runbooks/native-scan-app-testing.md
- docs/runbooks/native-scan-app-release.md

结论：
- P0-P3 Web/API/Worker 核心业务闭环已完成。
- Wage / Unloading Wage 已完成到当前报告范围；UNLOAD-WAGE-12 已修复 monthly unloading summary 空白导出回归。
- WEB-I18N-01 已完成现场反馈后的全量缺口审计和运行时覆盖回归；WEB-I18N-02 已修复柜号 `SMCU1225466` 暴露出的 container detail rule metadata 和 warning message 本地化缺口。
- Detailed pallet rules 基础实现已完成；UNLOAD-PALLET-05 已修复包装类型默认值/选择器口径错误，UNLOAD-PALLET-06 已修复 destination correction 保存误判无变更；UNLOAD-PALLET-07 已修复 UPS 57 箱有体积却算 0 托的现场回归。
- Monthly unloading summary 已修复 `2026-07` 空白导出 false-success：本地库存在 18 个已拆完口径柜子，其 recorded completion month 为 `2026-06`；页面无显式月份时会打开最新可用月份，显式空月会提示可用月份并阻止 0-row export。
- P6 standalone native scan app 已按 Android+iOS pilot route 条件通过，但不是完整三端 release ready。
- P6-MOBILE-13 已执行到当前仓库可验证范围：新增 Windows MSIX readiness gate、构建机 checklist 和 handoff docs；Windows MSIX 仍未完成，因为缺 Windows generated RNW project、camera decoder dependency、MSIX 打包和 Windows 设备 smoke。
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

已执行但仍有未关闭项：
1. P6-MOBILE-09Native Camera Module Wiring.md
   - Android/iOS source wiring 已完成；Windows native project 尚未生成验收。
2. P6-MOBILE-10Secure Token Storage.md
   - Android/iOS secure token source wiring 已完成；Windows Credential Locker path 尚未在 RNW project 中验收。
3. P6-MOBILE-11Windows iOS Native Project Hardening.md
   - iOS generated project/Pods/workspace 已完成；Windows generated project 仍未完成。
4. P6-MOBILE-12Cross Platform Device Smoke Exit Gate.md
   - Android/iOS pilot smoke 条件通过；完整 Windows MSIX release gate 未通过。
5. P6-MOBILE-13Windows MSIX Release Completion.md
   - 已执行到当前 macOS 仓库可验证范围：补 `windows:check`、MSIX 构建机 checklist、release/testing runbook handoff 和完成度报告；仍需 Windows 11 构建机生成 RNW project、打包 MSIX 并做 Windows device smoke 才能关闭完整三端 release gate。
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
   - 已完成。实际 Codex CLI `0.144.1` 已安装 `~/.codex/business-agent.config.toml`，其命名 permission profile 继承 `:workspace`、使用 `approval_policy = "never"` 并按宿主能力启用依赖网络。`scripts/run-business-agent.sh` 固定该 profile 和当前仓库 root，拒绝调用方覆盖 profile/sandbox/approval/rules；`.codex/execpolicy.rules` 拒绝破坏性 Git、递归删除、发布、远程基础设施和高风险 Docker 命令。安装器以 `600` 权限写入 profile，且拒绝覆盖不同的本地配置。host-level capability smoke 已通过：读文件、`/private/tmp` 写删、ESLint help、`docker compose ps`、危险命令拒绝均无业务副作用。当前受管 Seatbelt 内不能嵌套 `sandbox-exec`，但在普通宿主层运行同一 smoke 已通过；这是平台嵌套限制，不是 profile 失效。
30. UNLOAD-INVENTORY-01Unloaded Container Pallet Inventory Synchronization.md
   - 已完成。新增共享 `ContainerPalletInventorySyncService`、container/destination/pallet row lock 与统一 pallet ID/QR builder；办公室 `UNLOADED` 状态更新、container detail 拆柜工资完成和 pay container 完成均在同一事务先按每个目的仓 `finalPallets` 对账 Pallet rows，再写完成状态/审计。安全 PLANNED/LABEL_PRINTED 托盘保留 identity/history，缺少记录补建并写 CREATED event，安全 surplus 写 CANCELLED event；loading/loaded/adjusted/exception surplus 以稳定冲突码整体拒绝。库存保留历史 `totalPallets`，新增 `activeTotalPallets`，Web Dashboard/containers/inventory report 改用 active total。2026-07-12 API typecheck、25 unit suites / 174 tests、15 E2E suites / 92 tests、scoped API ESLint、Web typecheck/186 unit tests、Docker Web lint/production build 和 authenticated nginx API smoke 均通过；Docker smoke 仅读取现有记录，未修改业务数据。

31. DOCKER-DEV-01Cleanup Host Jest Install and Enforce Docker Only Workflow.md
   - 已完成。新增固定 allowlist 的 `scripts/cleanup-host-dev-dependencies.sh`，在 dry-run 中记录 path/realpath/type/size/mtime，`--apply` 只删除 root、API、Web 三个仓库内 host `node_modules`，不会触及 `storage/`、`.git`、样例、数据库备份或 Docker volumes。宿主三路径现均为 absent，`.env`、业务 Agent 文件和 shell startup 中没有持久 `NODE_ENV`、`QUEUE_ENABLED`、`JEST_*` 覆盖，原有 Jest/ts-jest、lockfile 和 E2E setup 保留。为避免 Docker Desktop 重叠 bind mount 把依赖重新写回 host，API/Web/worker 改为在 build 时复制源码，运行时仅 bind-mount真实 `storage/`；Node、pnpm、worker venv、Web `.next` 继续为 named volumes，新增 worker image 的 WeasyPrint 系统库和根 `.dockerignore` 排除移动端本机缓存。2026-07-12 Docker full stack/health、API Jest target unit（4）、Web lint/typecheck/186 unit、worker 112 pytest（232.13s）、Prisma migrate status、execpolicy allow/deny smoke 与 `git diff --check` 均通过。

当前仓库可继续执行的优先项：
1. UNLOAD-INVENTORY-02Unloaded Inventory Web Refresh and Regression.md
   - 完成拆柜后刷新柜子详情、目的仓库存、Dashboard 和库存报告，验证 active total、loaded、adjusted、remaining 一致以及 scan、duplicate、manual depletion 回归。
2. UNLOAD-WAGE-13Auto Collapse Completed Container Wage Section.md
   - 未完成默认展开；成功标记已拆完后自动收起，后续 loading/loaded 仍按 completedAt 默认收起，可手动展开并显示紧凑完成或复核摘要。
3. WEB-DASHBOARD-05Bilingual Typography and Layout Regression.md
   - 移除 Dashboard 对 condensed font 的隐式依赖，修复中英文字体拉伸和 English 长文案错位，覆盖 light/dark、四类视口、200% zoom 与 bounding-box/截图回归。
4. NATIVE-AUTH-01Revocable Persistent Native Session.md
   - Native secure store 当前能跨重启保存 JWT，但仍会在默认约 400 天后过期；新增可轮换、可撤销的长期 Native refresh session，实现不主动退出时静默续期，同时保留账号禁用、权限更新和设备撤销能力。
5. NATIVE-UX-06Android App Header Title Clipping Regression.md
   - 部分完成。共享 native header 已让品牌区占用可收缩剩余宽度并最多两行显示，Settings 保持 44px 触控区。2026-07-11 MI 8 SE Release 真机浅色 English 已验证 `BESTAR SCAN` 完整显示，UI hierarchy 标题 bounds 为 `[55,181][871,231]`，Settings accessibility control bounds 为 `[904,146][1025,267]`，无裁剪或重叠。mobile lint/typecheck 与 46 项 unit tests 通过。中文、font scale 1.3/2.0、dark、iOS/Windows 对照尚未采集，故不得标记全矩阵完成。
6. CROSS-UX-QA-01Persistent Session Theme Locale Regression.md
   - 部分完成。2026-07-11 API lint/typecheck/unit 与非沙箱 E2E（15 suites / 91 tests）、Web lint/typecheck/unit/build、native lint/typecheck/unit 已通过。WEB-I18N-04/05/06 已完成共享首屏、业务模块显式翻译和完整 Web locale x theme/role 无闪烁 gate；NATIVE-AUTH-01 可撤销 refresh session，以及 Android/iOS/Windows 实机矩阵仍待完成。
7. NATIVE-UX-05System Adaptive Color Theme.md
   - 在 Android 系统设置采集 light 与运行中切换证据；再在 iOS/Windows 完成系统主题切换、native scanner/chrome、locale x theme 证据。
8. NATIVE-UX-04Startup Performance and Cross Platform UX Exit Gate.md
   - 在同一 Android/iOS release 实机各记录五次冷启动中位数和 Login/Bay Board/Scan/Offline/Settings 双语证据；在 Windows 11 完成 RNW/MSIX/设备 smoke 后关闭跨平台 gate。
9. P6-MOBILE-13Windows MSIX Release Completion.md
   - 在 Windows 11 构建机生成 RNW project、打包 MSIX 并完成 Windows 设备 smoke，关闭完整三端 release gate。
10. UNLOAD-PALLET-04Packaging Type Pilot Verification + Correction.md
   - 等待业务提供真实私人/商业地址 Excel 后执行 pilot verification。
11. P5-PILOT-01Windows Target Deployment Verification.md
   - 在目标 Windows 11 主机完成 Docker full-stack、真实业务 smoke、备份恢复和告警验收。

Pilot 前必须验收：
1. P6-MOBILE-13Windows MSIX Release Completion.md
   - 只能在 Windows 11 + Visual Studio 2022 + Windows SDK + MSIX packaging tools 构建机关闭：生成 Windows RNW project、验收 camera/secure-token modules、打包 MSIX 并完成 Windows device smoke。
2. UNLOAD-PALLET-04Packaging Type Pilot Verification + Correction.md
   - 用真实私人/商业地址 Excel 验证默认纸箱和明确木箱识别。
3. P5-PILOT-01Windows Target Deployment Verification.md
   - 在目标 Windows 11 主机完成 Docker full-stack、secrets、账号、真实业务 smoke、备份恢复和告警验收。

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
- Detailed pallet calculation rules基础实现：完成；默认纸箱和隐藏 package selector 已在 UNLOAD-PALLET-05 完成，destination correction 保存回归已在 UNLOAD-PALLET-06 完成；UPS/courier destination 0 托现场缺陷已在 UNLOAD-PALLET-07 完成；真实包装类型样本验收仍待业务提供 workbook。
- API generated Prisma lint ignore：完成。
- Monitoring / SIEM export / backup-disk alerts：完成到本地生产可落地范围。
- P1 async queue teardown + Docker concurrency regression：完成。
- DOCKER-DEV-01：完成；开发依赖、检查和构建统一走 Docker Compose，宿主 root/API/Web `node_modules` 已清理。
- Android/iOS native scan app pilot route：条件通过。
- P6-MOBILE-13 repo-side Windows MSIX handoff gate：完成；实际 Windows MSIX artifact 和 Windows 设备 smoke 仍是 pilot 前构建机验收项。
- WEB-DASHBOARD-00 后台视觉方向 brief：完成；WEB-DASHBOARD-01 真实 dashboard API：完成；WEB-DASHBOARD-02 Shell visual system：完成；WEB-DASHBOARD-03 首页运营中控台 UI：完成；WEB-DASHBOARD-04 dashboard QA/i18n/full-stack role smoke：完成。
- 持久化登录：完成；AUTH-SESSION-01 已关闭，默认 400 天长会话并保留后端实时账号/权限校验。
- 柜子库存人工消库存：完成；INVENTORY-ADJUST-01 至 03 已覆盖 API/RBAC/audit/统计、Web/i18n 与 Docker full-stack regression。

给业务开发 agent 的建议执行顺序：
1. 后续 Task 都从 `scripts/run-business-agent.sh` 启动，且安装、测试、构建、Prisma、worker 命令只经 Docker Compose；源码变更后以 `docker compose -f infra/docker/compose.local.yml up -d --build` 重建相应服务。
2. 库存线继续执行 UNLOAD-INVENTORY-02；其后可并行 UNLOAD-WAGE-13。
3. 再执行 WEB-DASHBOARD-05，基于已验证的双语输出做布局验收。
4. API/Auth 可并行 NATIVE-AUTH-01；Native UI 继续补 NATIVE-UX-05/06 实机证据。
5. 将 NATIVE-UX-04、05、06 和 P6-MOBILE-13 的 Windows 实机证据合并验证。
6. 并行准备真实私人/商业地址样本完成 UNLOAD-PALLET-04；上线前执行 P5-PILOT-01。
