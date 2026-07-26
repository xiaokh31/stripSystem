# 执行 POD-03：Document Revision, Generation and Archive API

## 优先级与状态

- 优先级：P1。
- Task-Status: OPEN
- 前置任务：POD-02 DONE，POD-00 template profile 不得改变。
- 后续任务：POD-04。
- 本 Task 交付 POD document/revision/generation/archive backend，不做 Web composer。

## 必须读取与使用

- `AGENTS.md`、`HANDOFF.md`
- `prompts/agents/business-logic-agent.md`
- `docs/product/06-pod-template-and-document-management.md`
- `prompts/tasks/POD-00Real Template Contract and Worker Proof.md`
- `prompts/tasks/POD-01Versioned Template Registry API RBAC and Audit.md`
- `.codex/skills/bestar-handoff/SKILL.md`
- `.codex/skills/auth-rbac/SKILL.md`
- `.codex/skills/bestar-domain/SKILL.md`
- `.codex/skills/nestjs-prisma-api/SKILL.md`
- `.codex/skills/docker-local-deploy/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- generated-file, queue/Worker, storage, audit, download proxy patterns
- POD-00 Worker proof/profile validator

## 权限

新增并 seed：

- `pod.document.read`
- `pod.document.create`
- `pod.document.update`
- `pod.document.print`
- `pod.document.void`

ADMIN/OFFICE 默认拥有；WAREHOUSE、WAREHOUSE_MANAGER、HR_MANAGER 默认无。
每个 list/detail/revision/download/print/void route 独立 guard，不能只靠 Web 隐藏。

## 数据模型

### PodDocument

- stable id
- unique system POD number
- `ACTIVE` / `VOIDED`
- optional bounded business reference
- currentRevisionId
- created/updated actor and timestamps

### PodDocumentRevision

- document id + monotonic revision
- exact templateVersionId、template name/version/SHA snapshot
- immutable validated field-values JSON
- generation `PENDING` / `GENERATING` / `READY` / `FAILED`
- generated source artifact id（profile applicable）
- generated print PDF artifact id
- stable failure codes/details
- actor/time

### PodPrintEvent / PodVoidEvent

- document/revision id
- authenticated actor snapshot/time
- event type/reason where required
- immutable

Print event 表示用户请求打印/重打，不得声称 OS 或实体打印机成功。

## API 范围

提供等价 endpoints：

- `POST /api/pod/documents`
- `GET /api/pod/documents`
- `GET /api/pod/documents/:id`
- `POST /api/pod/documents/:id/revisions`
- `GET /api/pod/documents/:id/revisions`
- `POST /api/pod/documents/:id/void`
- `POST /api/pod/documents/:id/revisions/:revisionId/print-requests`
- source/PDF download endpoints

要求：

1. create/revision input 只有 `templateVersionId`、field-key/value 和 bounded business
   reference，不接受 cell/path/formula。
2. 只允许 ACTIVE template current version 创建新 document；编辑已有 document 时
   明确选择新 revision 使用的 template version，默认沿用原 version，不能静默升级。
3. server 按 immutable field schema 验证 required/type/limit/unknown keys。
4. save 分配 POD number、建立 revision 和 generation job；使用 idempotency key，
   HTTP/queue retry 不重复 POD number/revision/artifact。
5. Worker 总是复制 source template，写 validated values，生成 source output 和
   print-ready PDF，并记录 SHA/size/media/storage/audit。
6. generation failure 保存 FAILED revision/stable issues；不留下 SUCCESS 空文件。
7. replacement/inactive template 不影响历史 revision 下载/重打。
8. void 需要 reason，保留所有 bytes/revisions/events；voided document 默认不可新增
   revision/print，除非产品后续明确允许。
9. archive list bounded pagination，支持 POD number/template/date/reference/status，
   stable sort，无 N+1。
10. download 使用权限、storage containment、expected SHA/size；不暴露绝对路径。

## 并发和事务

1. 同一 document 并发 save 通过 revision token/row lock，不能产生两个相同 revision
   或静默丢失一方。
2. POD number 使用数据库安全唯一分配，不用前端时间/随机值作为唯一权威。
3. DB commit、queue enqueue 和 file generation 使用现有 outbox/补偿模式；crash 后可
   安全重试。
4. print request 对同一次 request idempotent；不同用户/时间的合法 reprint 分别审计。

## Strict i18n 硬门禁

1. API/Worker 只返回 stable status/code/fieldKey/labelKey/raw business value。
2. required/type/length/unknown field、inactive/stale template、generation failed、
   revision conflict、voided、download integrity、permission 使用 typed codes。
3. 不把 Worker exception、LibreOffice stderr 或模板原文作为 UI error message。
4. Template/POD business values 不翻译；系统状态由 Web catalog 映射。
5. 同步维护 code inventory，供 POD-04 的 `en` / `zh-CN` catalog parity gate。

## 非目标

- 不做 Web 页面或浏览器 print。
- 不做 silent print、打印机状态确认、签名、附件、邮件、容器/装车关联。
- 不物理删除 document/revision/file/event。
- 不在本 Task 扩展第二种 template profile。

## 必须测试

1. existing/empty DB migration 和 permission seed。
2. ADMIN/OFFICE allow；其余角色 direct API deny。
3. create -> generate READY -> exact source/PDF download。
4. edit -> new immutable revision；old bytes/SHA/template snapshot 不变。
5. inactive/replaced template 的历史 revision 仍可下载。
6. invalid/missing/extra/oversized field、stale version、FAILED Worker。
7. idempotent HTTP/queue retry、并发 save、outbox recovery。
8. archive filter/sort/pagination/query count。
9. print event actor/revision；不能标物理成功。
10. void reason/audit/no delete/no further actions。
11. path traversal/SHA mismatch/missing file fail closed。
12. failed/aborted tests 精确 cleanup，无 orphan DB/storage/job/generated_file。

## Worker/package/print 验证

1. 使用 POD-00 sanitized real fixture。
2. 原模板 SHA 前后不变。
3. field output、untouched package、mapping/version snapshot 正确。
4. Docker 生成 PDF page geometry、关键文字和 visual crop 与 approved example 匹配。
5. Agent 逐张原分辨率查看；不以 PDF text extraction 代替。

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

另验证空库 migration、queue concurrency/recovery 和 Docker POD visual runner。

## 验收标准

1. POD document/revision/print/void schema、API、Worker 和 artifact 记录完整。
2. 每次 save 形成 immutable revision；原模板和旧 artifact 不覆盖。
3. 打印 PDF 与 exact revision 绑定，历史模板 replacement/inactive 后仍可 reprint。
4. RBAC、audit、idempotency/concurrency、archive query 和 storage security 通过。
5. API stable-code contract 满足 strict i18n，无 localized backend sentences。
6. Docker API/Worker、migration、queue、package/PDF visual、health、cleanup、diff 通过。
7. 更新 Task/Index/完成度/HANDOFF，唯一下一任务为 POD-04。
