执行 P6-MOBILE Exit Gate：Standalone Native Scan App 验收。

必须读取：
- AGENTS.md
- CONTEXT.md
- docs/adr/0003-native-scan-app.md
- docs/product/01-cross-platform-mobile-scan-app.md
- .codex/skills/mobile-native-scan-app/SKILL.md
- .codex/skills/warehouse-scan-flow/SKILL.md
- .codex/skills/auth-rbac/SKILL.md
- .codex/skills/docker-local-deploy/SKILL.md

任务范围：
1. 不新增功能。
2. 对 P6-MOBILE-01 至 P6-MOBILE-08 做完整验收。
3. 验证 standalone app 只有登录和 mobile scan。
4. 验证 MSIX/APK/IPA 交付文档完整。
5. 更新 docs/reports/project-completion-status.html。

API：
- GET /api/health
- POST /api/auth/login
- GET /api/auth/me
- GET /api/load-jobs
- GET /api/load-jobs/:id
- POST /api/load-jobs/:id/scan
- POST /api/load-jobs/:id/scan/reverse
- POST /api/load-jobs/:id/close

业务要求：
1. App 只能包含登录和 mobile scan。
2. App 必须使用真实 API 和真实账号。
3. App 不能包含 office/admin/import/report/label 页面。
4. Offline queue 不能伪造库存变化。
5. 所有扫码状态变化必须由后端 scan transaction 接受后才生效。
6. App 必须是 installed native app，不能是 Web/PWA/WebView-first wrapper。
7. Camera scan 不能依赖浏览器 HTTPS secure context。

验收标准：
1. App 可配置 LAN API URL。
2. App 可用真实 WAREHOUSE 账号登录。
3. App 可读取真实 load jobs。
4. App 可 camera scan。
5. App 可 scanner-gun/manual input。
6. Offline queue 不伪造库存。
7. Duplicate scan 不重复扣库存。
8. Supervisor override 权限、reason、审计完整。
9. Complete loading 需要 dockNo 并记录装车人。
10. Windows MSIX 构建/安装文档存在。
11. Android apk 构建/安装文档存在。
12. iOS ipa 签名/分发文档存在。
13. 不包含 office/admin/import/report/label 页面。

测试命令：
- pnpm lint
- pnpm typecheck
- pnpm test
- pnpm --filter api test:e2e
- pnpm --filter mobile-scan-app lint
- pnpm --filter mobile-scan-app typecheck
- pnpm --filter mobile-scan-app test
- pnpm --filter mobile-scan-app build
- scripts/healthcheck.sh

手工验收：
1. Windows 或 Android 至少一个真实设备安装 App。
2. 局域网访问 Docker full stack API。
3. 使用真实 load job 和真实面单 QR 完成扫码。
4. 断网扫码后恢复同步。
5. 验证无权限用户不能 supervisor override。
