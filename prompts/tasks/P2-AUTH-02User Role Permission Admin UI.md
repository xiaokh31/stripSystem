执行 P2-AUTH-02：User Role Permission Admin UI。

必须读取：
- AGENTS.md
- docs/architecture/05-web-and-scan-ui.md
- docs/architecture/09-account-role-permission-management.md
- .codex/skills/bestar-domain/SKILL.md
- .codex/skills/nextjs-pwa-ui/SKILL.md
- .codex/skills/auth-rbac/SKILL.md

任务范围：
1. 实现管理员账号管理页面。
2. 实现角色权限查看和维护页面。
3. 不改变 API 权限模型。
4. 不使用 mock 用户/角色/权限。

API：
```http
GET /api/users
POST /api/users
GET /api/users/:id
PATCH /api/users/:id
POST /api/users/:id/reset-password
PATCH /api/users/:id/roles
PATCH /api/users/:id/status
GET /api/roles
PATCH /api/roles/:id/permissions
GET /api/permissions
```

业务要求：
1. Settings 或独立 Admin 页面提供用户管理入口。
2. 只有 ADMIN 可见并可访问管理 UI。
3. 用户列表显示：
   - email
   - name
   - active status
   - roles
   - last login
4. 可创建 OFFICE、WAREHOUSE 用户。
5. 可禁用/启用用户。
6. 可 reset password。
7. 可调整用户 roles。
8. 角色页面展示 permission matrix。
9. 权限不足必须显示 API 403 信息，不伪装为成功。
10. 所有保存后必须从 API refresh。

建议文件：
- apps/web/src/app/settings/*
- apps/web/src/app/admin/*
- apps/web/src/components/auth/*
- apps/web/src/lib/api-client.ts
- apps/web/tests/*user*.test.ts
- apps/web/tests/*role*.test.ts

验收标准：
1. ADMIN 可查看用户、角色、权限。
2. OFFICE/WAREHOUSE 访问管理页被拒绝或没有入口。
3. 创建用户调用真实 API。
4. 禁用用户后页面显示 inactive。
5. reset password 显示明确成功/失败状态。
6. role permission matrix 与 API 返回一致。

测试命令：
```bash
pnpm --filter web lint
pnpm --filter web typecheck
pnpm --filter web test
pnpm --filter web build
```
