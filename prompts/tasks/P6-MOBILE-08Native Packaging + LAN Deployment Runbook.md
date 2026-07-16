执行 P6-MOBILE-08：Native Packaging + LAN Deployment Runbook。

2026-07-15 范围说明：本 Task 已完成并保留历史交付记录。其 Windows MSIX 文档现在只作为归档恢复参考；
当前活动发布范围为 Android/iOS，不得从本历史 Task 重新启动 Windows RNW/MSIX 工作。

必须读取：
- AGENTS.md
- CONTEXT.md
- docs/adr/0003-native-scan-app.md
- docs/product/01-cross-platform-mobile-scan-app.md
- P6-MOBILE-01 生成的架构决策文档
- .codex/skills/mobile-native-scan-app/SKILL.md
- .codex/skills/docker-local-deploy/SKILL.md

任务范围：
1. 补齐 Windows MSIX、Android APK、iOS IPA 的构建和安装文档。
2. 增加 native app release checklist。
3. 增加 LAN API URL、证书、相机权限、设备分发说明。
4. 尽可能实现可在本机验证的 build/package script。
5. 不改业务 API。

API：
- GET /api/health
- GET /api/auth/me

业务要求：
1. Windows 文档必须覆盖：
   - build command
   - artifact path
   - install/update/uninstall
   - LAN API URL 配置
2. Android 文档必须覆盖：
   - debug apk
   - signed apk
   - camera permission
   - PDA/scanner-gun 注意事项
3. iOS 文档必须覆盖：
   - Apple Developer account
   - signing certificate
   - provisioning profile
   - TestFlight/MDM/internal distribution 限制
4. 说明 HTTP/HTTPS 对 API 登录凭证传输的影响，并明确 native camera 不依赖浏览器 HTTPS secure context。
5. 不提交真实 signing secret。

验收标准：
1. Runbook 能让非开发人员理解三端如何安装和更新。
2. 本机可运行的 package/build 命令通过，不能本机验证的 iOS 步骤必须明确前置条件。
3. 文档明确不要把 office web 暴露为 native app。
4. release checklist 覆盖登录、扫码、离线、override、complete loading。

测试命令：
- pnpm --filter mobile-scan-app lint
- pnpm --filter mobile-scan-app typecheck
- pnpm --filter mobile-scan-app test
- pnpm --filter mobile-scan-app build
- git diff --check

手工验收：
1. 按 runbook 在至少一个可用平台安装 App。
2. 配置局域网 API URL。
3. 登录并完成一条真实扫码 smoke test。
