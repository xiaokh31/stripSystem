执行 P1-12：User Role Permission API。

必须读取：
- AGENTS.md
- docs/architecture/04-api-contracts.md
- docs/architecture/09-account-role-permission-management.md
- .codex/skills/bestar-domain/SKILL.md
- .codex/skills/nestjs-prisma-api/SKILL.md
- .codex/skills/auth-rbac/SKILL.md

任务范围：
1. 实现管理员账号管理 API。
2. 实现角色和权限查询/维护 API。
3. 不实现 Web 管理页面。
4. 不修改业务 API 权限映射，除非发现 P1-11 缺漏。
5. 不引入 mock 用户。

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
POST /api/roles
GET /api/roles/:id
PATCH /api/roles/:id
PATCH /api/roles/:id/permissions

GET /api/permissions
```

业务要求：
1. 只有拥有 `users.manage` 的用户可管理 users。
2. 只有拥有 `roles.manage` 的用户可管理 roles/permissions。
3. 创建用户必须：
   - email unique
   - name 可选
   - 初始 password 或 reset flow
   - 至少一个 role
4. 禁用用户后：
   - 不能登录
   - 不能访问业务 API
   - 历史审计仍保留 user id
5. reset password 必须重写 password hash。
6. permissions 建议作为系统内置集合，不允许随意删除生产权限。
7. 不允许删除已有角色导致历史用户无角色；如需删除，必须先验证没有用户使用。
8. 返回用户时不得返回 password_hash。
9. 管理 API 自身必须写入管理审计，至少在 metadata 或未来 audit log 中可追踪。

建议文件：
- apps/api/src/users/*
- apps/api/src/roles/*
- apps/api/src/auth/*
- apps/api/test/users.e2e-spec.ts
- apps/api/test/roles.e2e-spec.ts

验收标准：
1. ADMIN 可以创建 OFFICE 和 WAREHOUSE 用户。
2. OFFICE 不能访问 users/roles 管理 API。
3. WAREHOUSE 不能访问 users/roles 管理 API。
4. 禁用用户后登录失败。
5. reset password 后旧密码失效，新密码可登录。
6. role permissions 更新后，新 token 或重新登录反映最新权限。
7. 返回 payload 不包含 password hash。

测试命令：
```bash
pnpm --filter api typecheck
pnpm --filter api test
pnpm --filter api test:e2e
```
