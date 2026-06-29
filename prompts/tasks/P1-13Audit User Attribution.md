执行 P1-13：Audit User Attribution。

必须读取：
- AGENTS.md
- docs/architecture/04-api-contracts.md
- docs/architecture/09-account-role-permission-management.md
- .codex/skills/bestar-domain/SKILL.md
- .codex/skills/nestjs-prisma-api/SKILL.md
- .codex/skills/auth-rbac/SKILL.md
- .codex/skills/warehouse-scan-flow/SKILL.md
- .codex/skills/pallet-label-generator/SKILL.md

任务范围：
1. 将当前登录用户自动写入业务审计字段。
2. 清理或降低对请求体 `createdById`、`operatorId`、`correctedById` 的依赖。
3. 不新增 UI。
4. 不改变既有业务规则。

API：
本任务不新增 API，但必须覆盖以下 API 的审计用户：
```http
POST /api/imports
POST /api/imports/:id/parse
POST /api/containers/manual
PATCH /api/containers/:id
POST /api/containers/:id/destinations
PATCH /api/container-destinations/:id
POST /api/corrections
POST /api/containers/:id/generate-report
POST /api/containers/:id/generate-labels
POST /api/load-jobs
PATCH /api/load-jobs/:id
DELETE /api/load-jobs/:id
POST /api/load-jobs/:id/close
POST /api/load-jobs/:id/scan
POST /api/load-jobs/:id/scan/reverse
POST /api/pallets/:id/print
POST /api/containers/:id/labels/reprint
```

业务要求：
1. `import_files.imported_by_id` 使用当前用户。
2. `generated_files.generated_by_id` 使用当前用户或 SYSTEM 用户。
3. `correction_feedback.corrected_by_id` 使用当前用户。
4. `load_jobs.created_by_id` 创建时使用当前用户。
5. `pallet_events.operator_id` 扫码、reverse scan、reprint、status changed 时使用当前用户。
6. 如请求体仍传 user id，默认忽略；只有 ADMIN/SYSTEM 可以显式 override，且必须审计。
7. 不允许因为用户字段缺失而静默吞异常。
8. 历史事件不可被覆盖，只能新增事件。
9. 自动化测试必须验证 DB 持久化字段，不只检查响应。

建议文件：
- apps/api/src/imports/*
- apps/api/src/corrections/*
- apps/api/src/reports/*
- apps/api/src/labels/*
- apps/api/src/load-jobs/*
- apps/api/test/*.e2e-spec.ts

验收标准：
1. 登录为 OFFICE 上传 import 后 `imported_by_id` 正确。
2. 登录为 OFFICE 修正目的仓后 `corrected_by_id` 正确。
3. 登录为 OFFICE 生成报告/面单后 `generated_by_id` 正确。
4. 登录为 OFFICE 创建 load job 后 `created_by_id` 正确。
5. 登录为 WAREHOUSE scan/reverse scan 后 `operator_id` 正确。
6. 客户端传入不同 user id 不会伪造审计字段。
7. 所有业务错误仍按原错误 code 返回。

测试命令：
```bash
pnpm --filter api typecheck
pnpm --filter api test
pnpm --filter api test:e2e
```
