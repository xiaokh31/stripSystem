执行 P1-10：Auth Login API。

必须读取：
- AGENTS.md
- docs/architecture/04-api-contracts.md
- docs/architecture/09-account-role-permission-management.md
- .codex/skills/bestar-domain/SKILL.md
- .codex/skills/nestjs-prisma-api/SKILL.md
- .codex/skills/auth-rbac/SKILL.md

任务范围：
1. 实现登录和当前用户 API。
2. 实现密码 hash 校验。
3. 实现 JWT 签发。
4. 不实现全局业务 Guard。
5. 不实现 Web 登录页面。
6. 不实现用户管理 API。

API：
```http
POST /api/auth/login
GET /api/auth/me
```

业务要求：
1. `POST /api/auth/login` 请求：
   - email
   - password
2. 登录成功返回：
   - accessToken
   - tokenType = Bearer
   - expiresIn
   - user: id, email, name, roles, permissions
3. 登录失败必须返回明确错误：
   - INVALID_CREDENTIALS
   - USER_INACTIVE
   - SYSTEM_USER_LOGIN_NOT_ALLOWED
4. 密码必须使用安全 hash 校验，推荐 Argon2id。
5. JWT payload 至少包含：
   - sub user id
   - email
   - roles
   - permissions version 或 issuedAt
6. `GET /api/auth/me` 通过 Bearer token 返回当前用户资料和权限。
7. `SYSTEM` 用户默认不能通过普通密码登录。
8. 登录成功应更新 `users.last_login_at`。
9. 不允许把 password_hash 返回给客户端。
10. 不允许使用硬编码用户或 mock 用户作为完成标准。

建议文件：
- apps/api/src/auth/*
- apps/api/src/app.module.ts
- apps/api/src/config/*
- apps/api/test/auth.e2e-spec.ts
- apps/api/src/auth/*.spec.ts

验收标准：
1. 正确邮箱密码可登录。
2. 错误密码返回 401 和 `INVALID_CREDENTIALS`。
3. inactive user 返回 403 或 401，并带 `USER_INACTIVE`。
4. `SYSTEM` 用户不能普通登录。
5. `GET /api/auth/me` 无 token 返回 `UNAUTHENTICATED`。
6. `GET /api/auth/me` 有效 token 返回 user、roles、permissions。
7. JWT secret 使用环境变量 `JWT_SECRET`，不硬编码。
8. DTO validation 生效。

测试命令：
```bash
pnpm --filter api typecheck
pnpm --filter api test
pnpm --filter api test:e2e
```
