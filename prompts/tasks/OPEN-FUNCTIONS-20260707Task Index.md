当前未完成功能任务索引。

生成时间：
- 2026-07-07

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
- 当前真正阻塞最终交付的是 P6 standalone native scan app exit gate。
- P4 print agent 和 P1 async queue 是明确 Deferred，不是当前 pilot 必须完成。
- Windows 目标机部署验证和包装类型 pilot 验证属于上线前验收任务。

必须优先执行：
1. P6-MOBILE-09Native Camera Module Wiring.md
   - 解决 native camera module 尚未接入的问题。
2. P6-MOBILE-10Secure Token Storage.md
   - 用平台安全存储替代 AsyncStorage token fallback。
3. P6-MOBILE-11Windows iOS Native Project Hardening.md
   - 补齐 Windows/iOS native platform project 和 MSIX/IPA 构建路径。
4. P6-MOBILE-12Cross Platform Device Smoke Exit Gate.md
   - 在真实设备完成 P6 final gate 验收。

Pilot 前建议执行：
5. UNLOAD-PALLET-04Packaging Type Pilot Verification + Correction.md
   - 用真实私人/商业地址 Excel 验证包装类型识别；如不稳定，补 correction workflow。
6. P5-PILOT-01Windows Target Deployment Verification.md
   - 在目标 Windows 11 主机完成 Docker full-stack、secrets、账号、真实业务 smoke、备份恢复和告警验收。

Deferred，按现场反馈再执行：
7. P4-PRINT-03Local Print Agent Decision + Prototype.md
   - 只有 PDF/manual printing 在 pilot 中不稳定时执行。
8. P1-QUEUE-01BullMQ Async Import Generation Jobs.md
   - 只有大文件、并发或 HTTP timeout 成为实际问题时执行。

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

给业务开发 agent 的建议执行顺序：
1. 先做 P6-MOBILE-09。
2. 再做 P6-MOBILE-10。
3. 再做 P6-MOBILE-11。
4. 三项完成后执行 P6-MOBILE-12。
5. 并行安排现场样本时执行 UNLOAD-PALLET-04。
6. 准备上线时执行 P5-PILOT-01。
7. P4-PRINT-03 和 P1-QUEUE-01 暂不执行，除非业务现场反馈触发。
