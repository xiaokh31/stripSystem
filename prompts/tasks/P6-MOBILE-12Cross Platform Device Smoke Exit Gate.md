执行 P6-MOBILE-12：Cross-Platform Device Smoke + P6 Exit Gate。

优先级：
- 必做，P6 Exit Gate 最终验收任务。

前置任务：
- P6-MOBILE-09Native Camera Module Wiring
- P6-MOBILE-10Secure Token Storage
- P6-MOBILE-11Windows iOS Native Project Hardening

必须读取：
- AGENTS.md
- CONTEXT.md
- docs/product/01-cross-platform-mobile-scan-app.md
- docs/runbooks/native-scan-app-testing.md
- docs/runbooks/native-scan-app-release.md
- prompts/tasks/P6-MOBILE Exit Gate.md
- prompts/tasks/P6-MOBILE-09Native Camera Module Wiring.md
- prompts/tasks/P6-MOBILE-10Secure Token Storage.md
- prompts/tasks/P6-MOBILE-11Windows iOS Native Project Hardening.md
- .codex/skills/mobile-native-scan-app/SKILL.md
- .codex/skills/warehouse-scan-flow/SKILL.md
- .codex/skills/docker-local-deploy/SKILL.md
- .codex/skills/qa-regression/SKILL.md

任务范围：
1. 不新增功能，做 P6-MOBILE final gate 验收。
2. 在至少 Android 真机完成安装、登录、camera scan、manual/scanner-gun scan、offline queue、supervisor override、complete loading。
3. 在 Windows 或 iOS 至少一个平台完成安装和登录/scan smoke；如果无法获取设备或签名条件，必须把阻塞写清楚。
4. 使用 Docker full-stack nginx 路由和真实 API。
5. 使用真实 load job、真实 pallet label QR，不使用 mock 业务数据。
6. 更新完成度报告，把 P6 Exit Gate 从 Gate Blocked 改为 Pass 或保留 blocker 证据。

验收标准：
1. App 只包含登录和 mobile scan，不包含 office/admin/import/report/label 页面。
2. Fresh device 可安装 app 并配置 LAN API URL。
3. 真实 WAREHOUSE 用户可登录。
4. App 可读取真实 `PLANNED` / `IN_PROGRESS` load jobs。
5. Camera scan 成功调用真实 scan API。
6. Manual/scanner-gun input 成功调用真实 scan API。
7. Duplicate scan 不重复扣库存。
8. Offline queue 不伪造库存，恢复网络后通过真实 API sync。
9. Supervisor override 只对授权用户显示，reason 必填，审计保留。
10. Complete loading 需要 Dock No. 并记录登录用户。
11. Secure token storage/logout 在设备上验证通过。
12. MSIX/APK/IPA release docs 与实际 artifact/status 一致。

建议测试命令：
- docker compose -f infra/docker/compose.local.yml up -d --build
- scripts/healthcheck.sh
- pnpm --filter mobile-scan-app lint
- pnpm --filter mobile-scan-app typecheck
- pnpm --filter mobile-scan-app test
- pnpm --filter mobile-scan-app package:check
- pnpm --filter api test:e2e
- git diff --check

手工验收记录：
1. 记录设备型号、系统版本、app artifact、API URL。
2. 记录登录账号角色，不记录密码。
3. 记录 load job 编号、pallet label 来源、scan result。
4. 记录 duplicate/offline/override/complete loading 结果。
5. 记录截图或日志路径，但不得包含 token/password。

完成输出：
1. 列出每个平台的安装/扫码结果。
2. 列出 P6 Exit Gate checklist 每项 Pass/Fail。
3. 更新 `docs/reports/project-completion-status.html`。
4. 明确结论：
   - `P6 mobile exit gate passed`
   - 或 `P6 mobile exit gate remains blocked` 并列出 blocker。
