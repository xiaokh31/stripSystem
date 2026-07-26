# 执行 POD-01：Versioned Template Registry API, RBAC and Audit

## 优先级与状态

- 优先级：P1。
- Task-Status: OPEN
- 前置任务：POD-00 必须 DONE，并已冻结一个 fixture-backed template profile。
- 后续任务：POD-02。
- 本 Task 只交付模板 registry/storage/API/permissions/audit，不做 POD document 或 Web。

## 必须读取与使用

- `AGENTS.md`、`HANDOFF.md`
- `prompts/agents/business-logic-agent.md`
- `docs/product/06-pod-template-and-document-management.md`
- `prompts/tasks/POD-00Real Template Contract and Worker Proof.md`
- `.codex/skills/bestar-handoff/SKILL.md`
- `.codex/skills/auth-rbac/SKILL.md`
- `.codex/skills/bestar-domain/SKILL.md`
- `.codex/skills/nestjs-prisma-api/SKILL.md`
- `.codex/skills/docker-local-deploy/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- `apps/api/prisma/schema.prisma` 和 migration/seed/permission patterns
- imports/generated-files/storage root containment、upload validation 和 audit patterns
- POD-00 Worker inspection/profile contract

## 领域和数据要求

### PodTemplate

- stable id
- name + normalizedName
- `ACTIVE` / `INACTIVE`
- currentVersionId
- createdBy/createdAt/updatedBy/updatedAt

### PodTemplateVersion

- templateId + monotonic version
- immutable source storage key、SHA-256、size、detected media/profile
- immutable fieldSchema/mapping JSON 和 printProfile JSON
- validation status、stable issues、uploaded/approved actor/time
- source generated-file/storage reference as appropriate

约束：

1. 同一 non-voided template 的 normalized name 唯一。
2. source bytes 不可更新；替换必须创建新 version。
3. referenced version 永不物理删除。
4. duplicate SHA 必须返回 stable conflict 和现有 version reference，不静默重复存储。
5. currentVersion 切换、rename、activate/inactivate 都写 immutable audit。
6. mapping 必须通过 POD-00 server-side validator，API 不接受任意 target。

## 权限

新增并 seed：

- `pod.template.read`
- `pod.template.manage`

默认：

- ADMIN：read/manage
- OFFICE：read/manage
- WAREHOUSE、WAREHOUSE_MANAGER、HR_MANAGER：无

所有 controller route 必须有 guard；列表和 id lookup 都不能通过 404/403 timing 或
response 泄漏未授权模板 metadata。

## API 范围

提供等价 typed endpoints：

- `GET /api/pod/templates`
- `POST /api/pod/templates`（name + first source version）
- `GET /api/pod/templates/:id`
- `PATCH /api/pod/templates/:id`（rename/status）
- `POST /api/pod/templates/:id/versions`
- `GET /api/pod/templates/:id/versions`
- `POST /api/pod/templates/:id/versions/:versionId/activate`
- 受权限保护的原始模板下载和 validation/preview artifact 查询

要求：

1. multipart upload 使用现有 public 50 MB boundary 或更小的明确 POD 上限。
2. extension、magic、MIME、SHA、size、root containment、symlink/path traversal、
   partial upload cleanup 全部 fail closed。
3. DB row 和文件写入采用补偿/transaction；失败不留 orphan row/file。
4. API response 返回 id/status/profile/stable issue/field schema/raw business name，
   不返回绝对路径、stack、secret 或 localized message。
5. list 使用 bounded pagination、stable sort、active filter 和 search。
6. rename/version/activate/inactivate 支持 optimistic concurrency 或 revision token，
   避免后写静默覆盖。

## Strict i18n 硬门禁

1. API 只返回 stable codes/enums/labelKeys/raw user names，不返回 UI 英文句子。
2. 为 unsupported format、duplicate file/name、unsafe package、invalid mapping、
   stale revision、inactive template、permission、upload cleanup 建立 typed code。
3. Error contract 必须让 Web 能映射 `en` / `zh-CN`，unknown code 使用通用本地化
   fallback；不暴露 raw exception。
4. Template name/field label 属于用户业务数据，不翻译、不双语拼接。

## 非目标

- 不创建 `/pod` 页面。
- 不创建 POD document/revision/print event。
- 不生成正式 POD；只复用 POD-00 validation/preview proof。
- 不硬删除模板/version。
- 不扩展到任意 Office/PDF 格式。

## 必须测试

1. existing DB 和 empty DB migration、rollback-safe schema、indexes/constraints。
2. ADMIN/OFFICE allow，其他三个角色 direct API deny。
3. create/list/detail/rename/inactivate/reactivate/version/activate happy paths。
4. original bytes 和旧 version SHA 在 replace 后不变。
5. duplicate name/SHA、stale revision、invalid mapping、unsupported/unsafe/oversized
   upload、path traversal、interrupted file write。
6. concurrent version creation/activation 不重复 version，不丢 current pointer。
7. audit actor、old/new metadata 和 source hash 正确。
8. pagination/search/sort query count 无 N+1。
9. failed tests 精确清理 DB/storage，不触及业务文件。

## Docker-only 验证

```bash
docker compose -f infra/docker/compose.local.yml up -d --build
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api prisma migrate deploy
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api lint
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api typecheck
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api test --runInBand
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api test:e2e --runInBand
docker compose -f infra/docker/compose.local.yml exec -T worker-python uv run pytest
scripts/healthcheck.sh
git diff --check
```

另需在临时空 PostgreSQL 验证完整 migration chain。

## 验收标准

1. versioned template schema/migration、storage 和 API 全部完成。
2. 原始 bytes/version 不可覆盖，duplicate/unsafe upload fail closed 且无 orphan。
3. ADMIN/OFFICE 权限和三类拒绝角色正确，全部动作有 actor audit。
4. API contract 可被 Web 严格 i18n 映射且不泄漏 storage/exception。
5. Docker API/Worker、existing+empty migration、health、cleanup、diff 通过。
6. 更新 Task/Index/完成度/HANDOFF，并把唯一下一任务写为 POD-02。
