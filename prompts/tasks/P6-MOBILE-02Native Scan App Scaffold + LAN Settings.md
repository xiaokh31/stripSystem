执行 P6-MOBILE-02：Native Scan App Scaffold + LAN Settings。

必须读取：
- AGENTS.md
- CONTEXT.md
- docs/adr/0003-native-scan-app.md
- docs/product/01-cross-platform-mobile-scan-app.md
- P6-MOBILE-01 生成的架构决策文档
- .codex/skills/mobile-native-scan-app/SKILL.md
- .codex/skills/docker-local-deploy/SKILL.md

任务范围：
1. 创建 React Native standalone native scan app workspace。
2. 创建最小 native App shell。
3. 实现本地 LAN API base URL 配置。
4. 实现 API health/connectivity check。
5. 不实现登录。
6. 不实现扫码。
7. 不复制 office web 页面。
8. 不使用 Next.js/PWA/WebView-first scaffold 作为最终 App。

API：
- GET /api/health

业务要求：
1. App 首屏必须是 scan app，不是 office portal。
2. 允许输入和保存 API base URL，例如 `http://192.168.1.10/api`。
3. 显示 API reachable/unreachable。
4. 保存的 API base URL 只用于本 App。
5. 不使用 mock API 状态。
6. App 需要有 deviceId 生成或存储方案，供后续离线队列和 scan payload 使用。
7. App shell 必须使用原生 app runtime；不能要求用户用浏览器打开页面。

验收标准：
1. 新增 React Native app workspace 或按 P6-MOBILE-01 决策创建对应 native app 目录。
2. App 能启动并显示 LAN API 配置。
3. Healthcheck 调用真实 API。
4. TypeScript/lint/test 通过。
5. 不暴露 office navigation。

测试命令：
- pnpm lint
- pnpm typecheck
- pnpm test
- pnpm --filter mobile-scan-app lint
- pnpm --filter mobile-scan-app typecheck
- pnpm --filter mobile-scan-app test

手工验收：
1. 启动 Docker full stack。
2. 在 App 配置 `http://127.0.0.1/api` 或局域网服务器地址。
3. 确认 API status 正确显示。
