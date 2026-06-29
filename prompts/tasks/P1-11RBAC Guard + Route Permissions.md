执行 P1-11：RBAC Guard + Route Permissions。

必须读取：
- AGENTS.md
- docs/architecture/04-api-contracts.md
- docs/architecture/09-account-role-permission-management.md
- .codex/skills/bestar-domain/SKILL.md
- .codex/skills/nestjs-prisma-api/SKILL.md
- .codex/skills/auth-rbac/SKILL.md
- .codex/skills/warehouse-scan-flow/SKILL.md

任务范围：
1. 实现 JWT Auth Guard。
2. 实现 Permission Guard。
3. 实现 `@Public()`、`@RequirePermissions()`、`@CurrentUser()` 等装饰器。
4. 将核心 API route 标记权限。
5. 不实现用户管理 API。
6. 不做 Web UI。

API：
本任务保护现有 API，不新增业务 API。

必须公开：
```http
GET /api/health
POST /api/auth/login
```

必须受保护的 API 范围：
```http
POST /api/imports
GET /api/imports
GET /api/imports/:id
POST /api/imports/:id/parse
GET /api/imports/:id/parse-result
POST /api/containers/manual
GET /api/containers/:id
PATCH /api/containers/:id
POST /api/containers/:id/destinations
PATCH /api/container-destinations/:id
GET /api/corrections
POST /api/corrections
POST /api/containers/:id/generate-report
POST /api/containers/:id/generate-labels
GET /api/reports/container-summary
GET /api/reports/inventory
POST /api/load-jobs
GET /api/load-jobs
GET /api/load-jobs/:id
PATCH /api/load-jobs/:id
DELETE /api/load-jobs/:id
POST /api/load-jobs/:id/close
POST /api/load-jobs/:id/scan
POST /api/load-jobs/:id/scan/reverse
POST /api/pallets/:id/print
POST /api/containers/:id/labels/reprint
```

业务要求：
1. 权限检查必须在 API 层执行，不允许只靠前端隐藏按钮。
2. 无 token 返回 401，code `UNAUTHENTICATED`。
3. token 无效或过期返回 401，code `UNAUTHENTICATED`。
4. 权限不足返回 403，code `FORBIDDEN`。
5. inactive user 即使 token 有效也不能访问业务 API。
6. ADMIN 拥有所有权限。
7. OFFICE 可执行办公室相关导入、修正、生成、库存、Load Job 计划。
8. WAREHOUSE 可读 in-progress load jobs、扫码、reverse scan、更新 dock，但不能删除 load job 或生成 labels。
9. SYSTEM 仅可用于内部 worker/service 权限，不作为普通浏览器用户。
10. route 权限映射必须集中可读，避免散落硬编码。

建议文件：
- apps/api/src/auth/*
- apps/api/src/common/*
- apps/api/src/*/*.controller.ts
- apps/api/test/*.e2e-spec.ts

验收标准：
1. 健康检查和登录无需 token。
2. 所有业务 API 无 token 均被拒绝。
3. OFFICE 可上传 import，但 WAREHOUSE 不可上传。
4. WAREHOUSE 可 scan，但不可 generate labels。
5. ADMIN 可管理所有受保护业务 route。
6. 权限不足返回稳定错误结构。
7. 现有 e2e 测试更新为带 token 调用，而不是绕过 Guard。

测试命令：
```bash
pnpm --filter api typecheck
pnpm --filter api test
pnpm --filter api test:e2e
```
