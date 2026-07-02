执行 P6-MOBILE-03：Native Login + Auth Session。

必须读取：
- AGENTS.md
- CONTEXT.md
- docs/adr/0003-native-scan-app.md
- docs/product/01-cross-platform-mobile-scan-app.md
- .codex/skills/mobile-native-scan-app/SKILL.md
- .codex/skills/auth-rbac/SKILL.md
- .codex/skills/nestjs-prisma-api/SKILL.md

任务范围：
1. 实现 standalone app 登录。
2. 实现读取当前用户。
3. 实现 logout/token clear。
4. 实现 session expired 和 permission denied 状态。
5. 不实现 load job list。
6. 不实现扫码。

API：
- POST /api/auth/login
- GET /api/auth/me

业务要求：
1. 使用现有真实账号，不创建 mock 用户。
2. Token 不允许打印到日志。
3. Token storage 必须按 P6-MOBILE-01 的技术路线实现；如果暂时使用 fallback storage，必须注明风险。
4. 登录成功后显示当前用户姓名/email/roles。
5. 没有 mobile scan 权限的用户不能进入扫描工作流。
6. SYSTEM 用户不得作为普通员工登录。
7. 登录界面必须属于 native app，不是嵌入 office web 登录页。

验收标准：
1. 可用 ADMIN/OFFICE/WAREHOUSE 真实账号登录。
2. 错误密码、禁用账号、无权限账号显示明确错误。
3. Logout 后不能继续调用受保护 API。
4. TypeScript/lint/test 通过。

测试命令：
- pnpm --filter mobile-scan-app lint
- pnpm --filter mobile-scan-app typecheck
- pnpm --filter mobile-scan-app test
- pnpm --filter api test:e2e

手工验收：
1. 用 WAREHOUSE 账号登录。
2. 断开/改错 API base URL 后确认错误清楚。
3. Logout 后重开 App，确认需要重新登录或按设计恢复 session。
