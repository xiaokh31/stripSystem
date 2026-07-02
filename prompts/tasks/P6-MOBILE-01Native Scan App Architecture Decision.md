执行 P6-MOBILE-01：Native Scan App Architecture Decision。

必须读取：
- AGENTS.md
- CONTEXT.md
- docs/adr/0003-native-scan-app.md
- docs/product/00-business-context.md
- docs/product/01-cross-platform-mobile-scan-app.md
- .codex/skills/mobile-native-scan-app/SKILL.md
- .codex/skills/warehouse-scan-flow/SKILL.md
- .codex/skills/docker-local-deploy/SKILL.md

任务范围：
1. 只做架构决策和落地方案文档。
2. 验证并细化推荐技术路线：React Native + React Native Windows。
3. 必须覆盖 Windows MSIX、Android APK、iOS IPA 三端原生交付路径。
4. 不写 App 业务代码。
5. 不改现有 web/api/worker 业务逻辑。

API：
- 仅确认复用现有 API，不新增 API：
  - POST /api/auth/login
  - GET /api/auth/me
  - GET /api/load-jobs
  - GET /api/load-jobs/:id
  - POST /api/load-jobs/:id/scan
  - POST /api/load-jobs/:id/scan/reverse
  - POST /api/load-jobs/:id/close

业务要求：
1. App 只能包含登录和 mobile scan。
2. 不能包含 office import、report、label、admin、settings 页面。
3. 必须说明 LAN API URL 配置方式。
4. 必须说明 camera 权限、扫码枪输入、离线队列、token storage、设备标识。
5. 必须说明 iOS 签名/企业分发限制。
6. 必须说明 Windows MSIX 的实际构建路径。
7. 必须明确 P6-MOBILE 不是 WebView-first wrapper、不是 PWA、不是浏览器页面。
8. 必须说明 native camera 如何避免浏览器 HTTPS/camera 限制。

验收标准：
1. 新增 ADR 或 architecture 文档。
2. 明确 React Native + React Native Windows 的实现路径和备选风险。
3. 明确每端构建产物、依赖、风险和验证方式。
4. 明确后续 P6-MOBILE 任务是否需要新增 workspace/app。
5. 不产生业务代码 diff。

测试命令：
- git diff --check

手工验收：
1. 读取 ADR，确认技术路线能覆盖 MSIX/APK/IPA。
2. 确认没有把 office web 功能纳入 standalone app。
3. 确认没有把浏览器 camera/HTTPS 作为扫码前提。
