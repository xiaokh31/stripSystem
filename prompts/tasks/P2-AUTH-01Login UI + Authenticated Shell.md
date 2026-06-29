执行 P2-AUTH-01：Login UI + Authenticated Shell。

必须读取：
- AGENTS.md
- docs/architecture/05-web-and-scan-ui.md
- docs/architecture/09-account-role-permission-management.md
- .codex/skills/bestar-domain/SKILL.md
- .codex/skills/nextjs-pwa-ui/SKILL.md
- .codex/skills/auth-rbac/SKILL.md

任务范围：
1. 实现 Web 登录页。
2. 实现 auth-aware API client。
3. 实现 authenticated shell。
4. 实现登出。
5. 不实现用户/角色管理页面。
6. 不绕过 API Guard。

API：
```http
POST /api/auth/login
GET /api/auth/me
```

业务要求：
1. 新增 `/login` 页面。
2. 登录表单包含 email、password。
3. 登录成功后进入 Dashboard 或原目标页面。
4. 登录失败显示 API 返回错误，不吞异常。
5. auth token 存储策略必须明确，不能散落在多个地方。
6. OfficeShell 必须显示当前用户姓名/角色和 Logout。
7. 未登录访问办公室业务页面必须跳转登录或显示登录入口。
8. `/api/health` 状态仍可在未登录时检查。
9. 不允许 mock 当前用户。
10. 下载链接仍使用浏览器可访问 `/api` 路径。

建议文件：
- apps/web/src/app/login/page.tsx
- apps/web/src/components/auth/*
- apps/web/src/lib/api-client.ts
- apps/web/src/components/layout/*
- apps/web/tests/*auth*.test.ts

验收标准：
1. `pnpm --filter web typecheck` 通过。
2. 登录页可访问。
3. 正确账号可登录并显示当前用户。
4. 错误账号显示错误。
5. 未登录用户不能直接操作业务 API。
6. Logout 后 token 被清理，业务页面不可继续访问。

测试命令：
```bash
pnpm --filter web lint
pnpm --filter web typecheck
pnpm --filter web test
pnpm --filter web build
```
