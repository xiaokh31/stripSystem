当前未完成功能任务索引。

生成时间：
- 2026-07-10

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
- Wage / Unloading Wage 已完成到当前报告范围；monthly unloading summary 出现现场空白导出回归，需先执行 UNLOAD-WAGE-12。
- WEB-I18N-01 已完成现场反馈后的全量缺口审计和运行时覆盖回归；WEB-I18N-02 已修复柜号 `SMCU1225466` 暴露出的 container detail rule metadata 和 warning message 本地化缺口。
- Detailed pallet rules 基础实现已完成；UNLOAD-PALLET-05 已修复包装类型默认值/选择器口径错误，UNLOAD-PALLET-06 已修复 destination correction 保存误判无变更；UNLOAD-PALLET-07 已修复 UPS 57 箱有体积却算 0 托的现场回归。
- Monthly unloading summary 当前发现 `2026-07` 空白导出 false-success：本地库存在 18 个已拆完口径柜子，但其 recorded completion month 为 `2026-06`，页面默认当前月导致生成空白 workbook。
- P6 standalone native scan app 已按 Android+iOS pilot route 条件通过，但不是完整三端 release ready。
- Windows MSIX 仍未完成：缺 Windows generated RNW project、camera decoder dependency、MSIX 打包和 Windows 设备 smoke。
- P1 async queue 已完成 API/DB/Web 垂直线；P1-QUEUE-02 已修复 BullMQ/ioredis teardown，并补 Docker concurrency regression。
- P4 print agent 仍是 Deferred / Not Activated，不是当前 pilot 必做。
- Windows 目标机部署验证和包装类型真实样本验证属于上线前验收任务。
- 默认纸箱托盘计算修复已完成；包装类型真实样本验收仍需等待业务提供 pilot workbook。
- UPS/courier destination 托数为 0 的 pilot 阻塞缺陷已在 UNLOAD-PALLET-07 修复。
- IMPORT-DELETE-01 已完成代码实现：删除导入会清理原始上传清单和关联 generated files，保留 load job / operational pallet / pay container blocker 和 deletion audit。

已执行但仍有未关闭项：
1. P6-MOBILE-09Native Camera Module Wiring.md
   - Android/iOS source wiring 已完成；Windows native project 尚未生成验收。
2. P6-MOBILE-10Secure Token Storage.md
   - Android/iOS secure token source wiring 已完成；Windows Credential Locker path 尚未在 RNW project 中验收。
3. P6-MOBILE-11Windows iOS Native Project Hardening.md
   - iOS generated project/Pods/workspace 已完成；Windows generated project 仍未完成。
4. P6-MOBILE-12Cross Platform Device Smoke Exit Gate.md
   - Android/iOS pilot smoke 条件通过；完整 Windows MSIX release gate 未通过。
5. P1-QUEUE-01BullMQ Async Import Generation Jobs.md
   - API/DB/Web 垂直线已实现；P1-QUEUE-02 已补齐 E2E teardown 和 Docker 并发回归。
6. UNLOAD-PALLET-05Default Carton Package Type + Hide Package Selector.md
   - 已完成。默认纸箱、不显示 package selector、missing/unknown package 不再触发人工确认 warning。
7. UNLOAD-PALLET-06Destination Correction Save Regression.md
   - 已完成。note-only、actual cartons-only、actual CBM-only、manual pallets 清空恢复 calculated final pallets 均有 Web/API 回归测试。
8. UNLOAD-PALLET-07UPS Courier Destination Pallet Count Regression.md
   - 已完成。修复 UPS/PUROLATOR/PURO/P/A 等 courier/private address 导入后有箱数和体积却 calculated/final pallets 为 0 的现场回归；根因为 API summary/plan packageType key mismatch。
9. WEB-I18N-01Full Localization Gap Audit + Runtime Coverage.md
   - 已完成。重新审计 Web 全模块 i18n，补齐漏翻译、动态文案、属性文案和语言切换 E2E。
10. IMPORT-DELETE-01Cascade Storage File Cleanup.md
   - 已完成。API delete 会逐个校验 storage root containment 后删除原始文件和 generated file storage 文件，generated_files 不再作为 blocker；仅 load job、operational pallet/scan history、pay container usage 阻止删除；correction feedback 记录删除人、时间、原因、清理数量、路径和 missing-file warning。Web 确认/成功/错误文案已更新。
11. WEB-I18N-02Container Detail Rule Warning Localization.md
   - 已完成。柜子详情页 rule summary、container warnings、destination warnings/errors 已按 locale 管理，覆盖 `SMCU1225466` 暴露出的 `Rule/Basis/Rounding` 和 warning code 文案。
12. UNLOAD-WAGE-12Monthly Unloading Summary Blank Export Regression.md
   - 新增待执行。修复月度拆柜汇总在 selected month 无 rows 时仍成功生成空白 workbook 的现场回归；默认月份需能引导到最近可用完成月份，显式空月份需展示可用月份提示并阻止 false-success 空导出。

必须优先执行：
1. UNLOAD-WAGE-12Monthly Unloading Summary Blank Export Regression.md
   - 先修复当前现场反馈：`/unloading-summary` 默认当前月但本地 completed unloading 数据归属 `2026-06`，导致 `2026-07` 导出空白且没有 warning。
2. P6-MOBILE-13Windows MSIX Release Completion.md
   - 补齐 Windows generated RNW project、camera/secure-token modules、MSIX 打包和 Windows device smoke。

Pilot 前必须验收：
1. UNLOAD-PALLET-04Packaging Type Pilot Verification + Correction.md
   - 用真实私人/商业地址 Excel 验证默认纸箱和明确木箱识别。
2. P5-PILOT-01Windows Target Deployment Verification.md
   - 在目标 Windows 11 主机完成 Docker full-stack、secrets、账号、真实业务 smoke、备份恢复和告警验收。

Deferred，按现场反馈再执行：
1. P4-PRINT-03Local Print Agent Decision + Prototype.md
   - 只有 PDF/manual printing 在 pilot 中不稳定时执行。

不需要新开任务的项目：
- Account/RBAC：完成。
- Work hours wage：完成。
- Unloading wage：完成。
- Temporary unloader directory：完成。
- Monthly unloading summary：主体已完成；当前空白导出回归需执行 UNLOAD-WAGE-12 后再重新标记完成。
- Container unloaded / delivered-to-destination status split：完成。
- Web i18n locale switch：完成；WEB-I18N-01 已补齐全量缺口审计、dynamic catalog 和 locale-switch E2E，WEB-I18N-02 已补齐柜子详情 rule/warning 动态业务文本。
- Detailed pallet calculation rules基础实现：完成；默认纸箱和隐藏 package selector 已在 UNLOAD-PALLET-05 完成，destination correction 保存回归已在 UNLOAD-PALLET-06 完成；UPS/courier destination 0 托现场缺陷已在 UNLOAD-PALLET-07 完成；真实包装类型样本验收仍待业务提供 workbook。
- API generated Prisma lint ignore：完成。
- Monitoring / SIEM export / backup-disk alerts：完成到本地生产可落地范围。
- P1 async queue teardown + Docker concurrency regression：完成。
- Android/iOS native scan app pilot route：条件通过。

给业务开发 agent 的建议执行顺序：
1. 先做 UNLOAD-WAGE-12，修复月度拆柜汇总空白导出的现场回归。
2. 再做 P6-MOBILE-13，补齐完整三端 native app release。
3. 并行安排真实私人/商业地址样本，完成 UNLOAD-PALLET-04 的 pilot verification。
4. 准备上线时执行 P5-PILOT-01。
5. P4-PRINT-03 暂不执行，除非现场打印失败数据触发。
