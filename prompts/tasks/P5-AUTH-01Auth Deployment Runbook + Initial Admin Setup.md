执行 P5-AUTH-01：Auth Deployment Runbook + Initial Admin Setup。

必须读取：
- AGENTS.md
- docs/runbooks/local-development.md
- docs/runbooks/local-deployment.md
- docs/runbooks/deploy-linux.md
- docs/runbooks/deploy-windows.md
- docs/runbooks/database-migrations.md
- docs/architecture/09-account-role-permission-management.md
- .codex/skills/docker-local-deploy/SKILL.md
- .codex/skills/auth-rbac/SKILL.md

任务范围：
1. 更新部署文档，说明账号体系启动和首个管理员创建。
2. 更新 `.env.example` 的 auth 相关变量。
3. 更新 pilot checklist。
4. 不新增业务 API。
5. 不硬编码生产默认密码。

API：
不新增 API，但部署文档必须验证：
```http
GET /api/health
POST /api/auth/login
GET /api/auth/me
GET /api/users
```

业务要求：
1. 文档必须说明：
   - JWT_SECRET 必须替换
   - 初始 ADMIN 如何创建
   - 默认角色/权限如何 seed
   - 如何禁用离职员工账号
   - 如何 reset password
2. Linux/Windows 部署文档必须包含账号体系步骤。
3. local-development 和 local-deployment 必须保持不同运行模式清晰。
4. pilot checklist 必须加入：
   - ADMIN 登录
   - OFFICE 登录
   - WAREHOUSE 登录
   - 权限不足验证
   - 审计 userId 验证
5. 备份/恢复文档必须提醒 users/roles/permissions 是数据库状态的一部分。

建议文件：
- .env.example
- docs/runbooks/local-development.md
- docs/runbooks/local-deployment.md
- docs/runbooks/deploy-linux.md
- docs/runbooks/deploy-windows.md
- docs/runbooks/pilot-run-checklist.md
- docs/runbooks/account-role-permission-management.md

验收标准：
1. 文档能指导从空库部署到可登录 ADMIN。
2. 文档明确禁止生产默认弱密码。
3. healthcheck 后能说明如何验证 login/me。
4. pilot checklist 覆盖三类角色。
5. 没有要求操作员手工改数据库表绕过 API。

测试命令：
```bash
pnpm --filter api typecheck
pnpm --filter web typecheck
scripts/healthcheck.sh
```
