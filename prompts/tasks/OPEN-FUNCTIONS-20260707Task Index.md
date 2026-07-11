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

当前仓库可继续执行的优先项：
1. P6-MOBILE-13Windows MSIX Release Completion.md
   - 在 Windows 11 构建机生成 RNW project、打包 MSIX 并完成 Windows 设备 smoke，关闭完整三端 release gate。
2. UNLOAD-PALLET-04Packaging Type Pilot Verification + Correction.md
   - 等待业务提供真实私人/商业地址 Excel 后执行 pilot verification。
3. P5-PILOT-01Windows Target Deployment Verification.md
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
- Web i18n locale switch：完成；WEB-I18N-01 已补齐全量缺口审计、dynamic catalog 和 locale-switch E2E，WEB-I18N-02 已补齐柜子详情 rule/warning 动态业务文本。
- Detailed pallet calculation rules基础实现：完成；默认纸箱和隐藏 package selector 已在 UNLOAD-PALLET-05 完成，destination correction 保存回归已在 UNLOAD-PALLET-06 完成；UPS/courier destination 0 托现场缺陷已在 UNLOAD-PALLET-07 完成；真实包装类型样本验收仍待业务提供 workbook。
- API generated Prisma lint ignore：完成。
- Monitoring / SIEM export / backup-disk alerts：完成到本地生产可落地范围。
- P1 async queue teardown + Docker concurrency regression：完成。
- Android/iOS native scan app pilot route：条件通过。
- P6-MOBILE-13 repo-side Windows MSIX handoff gate：完成；实际 Windows MSIX artifact 和 Windows 设备 smoke 仍是 pilot 前构建机验收项。
- WEB-DASHBOARD-00 后台视觉方向 brief：完成；WEB-DASHBOARD-01 真实 dashboard API：完成；WEB-DASHBOARD-02 Shell visual system：完成；WEB-DASHBOARD-03 首页运营中控台 UI：完成；WEB-DASHBOARD-04 dashboard QA/i18n/full-stack role smoke：完成。
- 持久化登录：完成；AUTH-SESSION-01 已关闭，默认 400 天长会话并保留后端实时账号/权限校验。
- 柜子库存人工消库存：完成；INVENTORY-ADJUST-01 至 03 已覆盖 API/RBAC/audit/统计、Web/i18n 与 Docker full-stack regression。

给业务开发 agent 的建议执行顺序：
1. 若当前目标是 pilot release gate，安排 Windows 11 构建机执行 P6-MOBILE-13 checklist，关闭完整三端 native app release gate。
2. 并行安排真实私人/商业地址样本，完成 UNLOAD-PALLET-04 的 pilot verification。
3. 准备上线时执行 P5-PILOT-01。
4. 持久化登录、Dashboard redesign 和人工消库存均已关闭；后续只按现场反馈新增具体 bugfix。
5. P4-PRINT-03 暂不执行，除非现场打印失败数据触发。
