执行 P3-AUTH-01：Mobile Warehouse Auth + Permission UX。

必须读取：
- AGENTS.md
- docs/architecture/05-web-and-scan-ui.md
- docs/architecture/09-account-role-permission-management.md
- .codex/skills/bestar-domain/SKILL.md
- .codex/skills/warehouse-scan-flow/SKILL.md
- .codex/skills/nextjs-pwa-ui/SKILL.md
- .codex/skills/auth-rbac/SKILL.md

任务范围：
1. 将移动扫码页面接入真实登录态。
2. 按 WAREHOUSE/OFFICE/ADMIN 权限显示移动端操作。
3. 确保 scan/reverse scan 使用当前用户审计。
4. 不实现新的扫码业务规则。
5. 不绕过 API Guard。

API：
```http
POST /api/auth/login
GET /api/auth/me
GET /api/load-jobs?status=IN_PROGRESS
GET /api/load-jobs/:id
PATCH /api/load-jobs/:id
POST /api/load-jobs/:id/scan
POST /api/load-jobs/:id/scan/reverse
GET /api/load-jobs/:id/loaded-pallets
```

业务要求：
1. 手机/PDA 打开移动端页面时必须知道当前用户。
2. WAREHOUSE 可：
   - 查看 in-progress load jobs
   - 保存 dockNo
   - scan pallet
   - reverse scan with reason and confirmation
3. WAREHOUSE 不可：
   - 删除 load job
   - 生成 labels/report
   - 管理用户
4. OFFICE/ADMIN 可使用移动扫码，但审计 userId 必须是本人。
5. 未登录时移动端显示登录入口，不显示假 load jobs。
6. 离线队列只保存 pending 请求，不伪造用户审计成功。
7. 队列重试必须带当前 token；token 失效时显示需要重新登录。

建议文件：
- apps/web/src/app/mobile/load-jobs/*
- apps/web/src/components/mobile/*
- apps/web/src/components/auth/*
- apps/web/src/lib/api-client.ts
- apps/web/tests/mobile-auth*.test.ts

验收标准：
1. 未登录访问 mobile scan 被要求登录。
2. WAREHOUSE 登录后可扫描。
3. WAREHOUSE 保存 dockNo 成功。
4. WAREHOUSE 不能访问办公室管理动作。
5. scan/reverse scan 后 API 记录 operatorId。
6. token 失效时离线队列不伪装同步成功。

测试命令：
```bash
pnpm --filter web lint
pnpm --filter web typecheck
pnpm --filter web test
pnpm --filter web build
pnpm --filter api test:e2e
```
