执行 P4-AUTH-01：Permissioned Reprint Audit Controls。

必须读取：
- AGENTS.md
- docs/architecture/04-api-contracts.md
- docs/architecture/09-account-role-permission-management.md
- .codex/skills/bestar-domain/SKILL.md
- .codex/skills/pallet-label-generator/SKILL.md
- .codex/skills/nestjs-prisma-api/SKILL.md
- .codex/skills/nextjs-pwa-ui/SKILL.md
- .codex/skills/auth-rbac/SKILL.md

任务范围：
1. 将重打 API 和 UI 绑定权限。
2. 确保 reprint audit 使用当前用户。
3. 增加权限不足的用户提示。
4. 不改变标签尺寸和 QR 业务规则。

API：
```http
POST /api/pallets/:id/print
POST /api/containers/:id/labels/reprint
GET /api/containers/:id/files
```

业务要求：
1. 只有 ADMIN/OFFICE 或拥有 `labels.reprint` 的用户可重打。
2. WAREHOUSE 默认不能重打 labels。
3. 每次重打必须记录：
   - pallet id 或 container id
   - operatorId/current user id
   - reason
   - occurredAt
4. loaded inventory 状态不得因 reprint 改变。
5. UI 中没有权限时不显示重打按钮，且 API 仍必须拒绝直接调用。
6. 150mm x 100mm 面单尺寸要求不变。

建议文件：
- apps/api/src/labels/*
- apps/api/test/labels.e2e-spec.ts
- apps/web/src/components/containers/*
- apps/web/tests/*label*.test.ts

验收标准：
1. OFFICE 可重打并记录 operatorId。
2. WAREHOUSE 调用重打 API 返回 403。
3. UI 对 WAREHOUSE 不显示重打入口。
4. reprint 不改变 pallet status。
5. reprint event 历史不可覆盖。

测试命令：
```bash
pnpm --filter api typecheck
pnpm --filter api test
pnpm --filter api test:e2e
pnpm --filter web lint
pnpm --filter web typecheck
pnpm --filter web test
```
