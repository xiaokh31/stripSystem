执行 P1-09：Auth Schema + Migration。

必须读取：
- AGENTS.md
- docs/architecture/04-api-contracts.md
- docs/architecture/09-account-role-permission-management.md
- .codex/skills/bestar-domain/SKILL.md
- .codex/skills/nestjs-prisma-api/SKILL.md
- .codex/skills/auth-rbac/SKILL.md

任务范围：
1. 只实现账号、角色、权限相关 Prisma schema 和 migration。
2. 不实现登录 API。
3. 不实现 Guard。
4. 不做 Web UI。
5. 不改既有业务流程，除非为关联审计字段必须调整 schema。

API：
本任务不新增 API。

业务要求：
1. 将当前单角色 `User.role` 升级为完整 RBAC 模型。
2. 建立或调整以下表：
   - users
   - roles
   - permissions
   - user_roles
   - role_permissions
3. 用户必须包含：
   - email unique
   - name
   - password_hash
   - is_active
   - last_login_at
   - created_at / updated_at
4. 默认角色必须覆盖：
   - ADMIN
   - OFFICE
   - WAREHOUSE
   - SYSTEM
5. 权限必须使用稳定字符串 code，例如：
   - imports.read
   - imports.create
   - imports.parse
   - containers.read
   - containers.create
   - containers.update
   - corrections.read
   - corrections.create
   - reports.read
   - reports.generate
   - labels.generate
   - labels.reprint
   - inventory.read
   - load_jobs.read
   - load_jobs.create
   - load_jobs.update
   - load_jobs.delete
   - load_jobs.complete
   - scan.create
   - scan.reverse
   - users.manage
   - roles.manage
6. 保留现有审计字段并确保外键能关联 users：
   - import_files.imported_by_id
   - generated_files.generated_by_id
   - load_jobs.created_by_id
   - pallet_events.operator_id
   - correction_feedback.corrected_by_id
7. 不允许删除历史审计记录。
8. `SYSTEM` 是服务账号角色，后续不得作为普通浏览器登录用户。
9. migration 必须兼容已有 pilot 数据，不能要求清空数据库。
10. 如需要保留旧 `UserRole enum` 做迁移过渡，必须在代码注释或 migration 说明里明确原因。

建议文件：
- apps/api/prisma/schema.prisma
- apps/api/prisma/migrations/*
- apps/api/src/prisma/*

验收标准：
1. migration 从当前数据库状态可成功 deploy。
2. `pnpm --filter api prisma generate` 成功。
3. users、roles、permissions、user_roles、role_permissions 表存在。
4. 默认 role/permission 约束支持后续 seed。
5. 现有审计外键仍可用。
6. 不实现登录或业务 Guard。
7. 不引入 mock 账号冒充真实业务完成。

测试命令：
```bash
pnpm --filter api prisma generate
DATABASE_URL='postgresql://bestar:bestar_dev_password@localhost:15432/bestar_unloading?schema=public' pnpm --filter api prisma migrate deploy
pnpm --filter api typecheck
pnpm --filter api test
```
