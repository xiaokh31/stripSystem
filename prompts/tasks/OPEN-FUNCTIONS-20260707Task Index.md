当前未完成功能任务索引。

生成时间：
- 2026-07-09

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
- Wage / Unloading Wage / i18n / monthly summary / detailed pallet rules 已完成到当前报告范围。
- P6 standalone native scan app 已按 Android+iOS pilot route 条件通过，但不是完整三端 release ready。
- Windows MSIX 仍未完成：缺 Windows generated RNW project、camera decoder dependency、MSIX 打包和 Windows 设备 smoke。
- P1 async queue 已完成 API/DB/Web 垂直线；P1-QUEUE-02 已修复 BullMQ/ioredis teardown，并补 Docker concurrency regression。
- P4 print agent 仍是 Deferred / Not Activated，不是当前 pilot 必做。
- Windows 目标机部署验证和包装类型真实样本验证属于上线前验收任务。

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

必须优先执行：
1. P6-MOBILE-13Windows MSIX Release Completion.md
   - 补齐 Windows generated RNW project、camera/secure-token modules、MSIX 打包和 Windows device smoke。

Pilot 前必须验收：
2. UNLOAD-PALLET-04Packaging Type Pilot Verification + Correction.md
   - 用真实私人/商业地址 Excel 验证包装类型识别；如不稳定，补 correction workflow。
3. P5-PILOT-01Windows Target Deployment Verification.md
   - 在目标 Windows 11 主机完成 Docker full-stack、secrets、账号、真实业务 smoke、备份恢复和告警验收。

Deferred，按现场反馈再执行：
4. P4-PRINT-03Local Print Agent Decision + Prototype.md
   - 只有 PDF/manual printing 在 pilot 中不稳定时执行。

不需要新开任务的项目：
- Account/RBAC：完成。
- Work hours wage：完成。
- Unloading wage：完成。
- Temporary unloader directory：完成。
- Monthly unloading summary：完成。
- Container unloaded / delivered-to-destination status split：完成。
- Web i18n locale switch：完成。
- Detailed pallet calculation rules基础实现：完成。
- API generated Prisma lint ignore：完成。
- Monitoring / SIEM export / backup-disk alerts：完成到本地生产可落地范围。
- P1 async queue teardown + Docker concurrency regression：完成。
- Android/iOS native scan app pilot route：条件通过。

给业务开发 agent 的建议执行顺序：
1. 先做 P6-MOBILE-13，补齐完整三端 native app release。
2. 并行安排真实私人/商业地址样本，完成 UNLOAD-PALLET-04 的 pilot verification。
3. 准备上线时执行 P5-PILOT-01。
4. P4-PRINT-03 暂不执行，除非现场打印失败数据触发。
