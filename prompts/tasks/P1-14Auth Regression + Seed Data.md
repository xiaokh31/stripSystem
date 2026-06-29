执行 P1-14：Auth Regression + Seed Data。

必须读取：
- AGENTS.md
- docs/architecture/04-api-contracts.md
- docs/architecture/09-account-role-permission-management.md
- docs/runbooks/database-migrations.md
- .codex/skills/bestar-domain/SKILL.md
- .codex/skills/nestjs-prisma-api/SKILL.md
- .codex/skills/auth-rbac/SKILL.md
- .codex/skills/qa-regression/SKILL.md

任务范围：
1. 建立默认角色/权限 seed。
2. 建立测试账号创建方式。
3. 补齐 auth/RBAC regression tests。
4. 不做 Web UI。
5. 不引入生产默认弱密码。

API：
本任务不新增业务 API，但必须验证：
```http
POST /api/auth/login
GET /api/auth/me
GET /api/users
GET /api/roles
GET /api/permissions
```

业务要求：
1. seed 必须创建默认 roles 和 permissions。
2. ADMIN role 必须拥有所有 permissions。
3. OFFICE/Warehouse permissions 必须符合 docs/architecture/09。
4. 初始管理员创建必须安全：
   - 开发环境可用明确命令或 seed 变量创建
   - 生产环境不得硬编码默认密码
5. 测试数据和真实业务数据必须隔离。
6. regression 必须覆盖：
   - unauthenticated
   - invalid token
   - inactive user
   - ADMIN allowed
   - OFFICE allowed/forbidden combinations
   - WAREHOUSE allowed/forbidden combinations
   - audit user persisted

建议文件：
- apps/api/prisma/seed.ts 或 scripts/*
- apps/api/test/auth.e2e-spec.ts
- apps/api/test/rbac.e2e-spec.ts
- docs/runbooks/account-role-permission-management.md

验收标准：
1. 空库 migrate + seed 后可创建首个管理员。
2. 默认 permissions 不重复，code 稳定。
3. regression tests 可独立运行。
4. 无 mock 用户作为生产行为。
5. 文档说明开发、测试、生产如何创建管理员。

测试命令：
```bash
pnpm --filter api prisma generate
DATABASE_URL='postgresql://bestar:bestar_dev_password@localhost:15432/bestar_unloading?schema=public' pnpm --filter api prisma migrate deploy
pnpm --filter api typecheck
pnpm --filter api test
pnpm --filter api test:e2e
```
