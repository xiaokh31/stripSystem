# 执行 POD-04：Composer, Print and Archive Web Workflow

## 优先级与状态

- 优先级：P1。
- Task-Status: OPEN
- 前置任务：POD-03 DONE。
- 后续任务：POD-05。
- 本 Task 完成办公室制单、保存、打印、存档和重打 Web workflow。

## 必须读取与使用

- `AGENTS.md`、`HANDOFF.md`
- `prompts/agents/business-logic-agent.md`
- `docs/product/06-pod-template-and-document-management.md`
- `prompts/tasks/POD-02Template Management Web Workspace.md`
- `prompts/tasks/POD-03Document Revision Generation Archive API.md`
- `.codex/skills/bestar-handoff/SKILL.md`
- `.codex/skills/frontend-design/SKILL.md`
- `.codex/skills/nextjs-pwa-ui/SKILL.md`
- `.codex/skills/auth-rbac/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- existing generated-file proxy/download、async generation status、filter/table/history UI
- OfficeShell/navigation、typed API client、i18n/no-flash/visual E2E patterns

## 页面和导航

`/pod` 使用清晰的工作区 views：

- `PODs`：archive/list；
- `New POD`：composer；
- `Templates`：POD-02 管理页。

权限控制：

- `pod.document.read` 才可见 archive；
- `pod.document.create` 才可见 New POD；
- `pod.template.read/manage` 决定 Templates tab；
- 没有任何 POD 权限时主菜单不显示，direct route 仍由 server/API 拒绝。

## New POD Composer

1. 选择 active template，显示名称、version 和 print profile，不显示 storage path。
2. 根据 exact version field schema 渲染 typed controls：
   - text/multiline；
   - date；
   - number；
   - boolean（仅 POD-00 profile 实际支持的类型）。
3. field business label 属于模板数据；required indicator、help、validation shell 属于
   locale catalog。
4. Template 变更前显示确认；确认后清理不兼容 draft，不能把旧 field values 错投到
   新 mapping。
5. locale/theme/route refresh 不丢已选 template 和未保存 values；不得把含业务数据的
   draft 写入 URL 或不受控日志。
6. Save 发送 field keys/values + templateVersion/revision token/idempotency key。
7. 保存后进入 saved POD detail，显示 POD number、revision、generation status、
   template snapshot、actor/time 和 actions。
8. generation pending/failed/retry 使用现有受控 polling/backoff 或刷新模式，不增加
   高频 timer；失败显示 stable-code mapping 和可行动重试。

## 保存、编辑和 revision

1. Print 只在 revision `READY` 时可用。
2. Edit 基于当前已保存 revision；保存创建新 revision，不覆盖旧 bytes。
3. stale conflict 必须提示重新加载/比较，不静默覆盖另一用户 revision。
4. Template 后来 inactive/replaced 时，旧 document 默认继续沿用自己的 exact version；
   不静默升级。
5. Void 需要 permission、reason 和二次确认；完成后保留 archive/history。

## 直接打印

1. Print action 先创建受审计 print request，再通过 same-origin authorized route 打开
   exact revision 的 print-ready PDF。
2. PDF 完整加载后触发浏览器打印对话框或提供一个明确 Print command；不得打开
   internal storage URL。
3. “直接打印”定义为从 saved POD 一次操作进入浏览器/系统 print dialog，不能承诺
   silent print 或物理打印成功。
4. Reprint 可选择历史 revision，并清楚显示该 revision/template version；不能重新
   用最新模板生成。
5. popup blocked、PDF unavailable、generation failed、permission changed 使用 typed
   localized error。
6. 页面不得把 `window.print()` 调用本身记录为实体打印成功。

## POD Archive

显示：

- POD number；
- template name/version；
- business reference；
- active/voided；
- current revision/generation status；
- created/updated actor/time。

支持 server-side：

- POD number fuzzy/prefix search；
- template selector；
- date range；
- business reference；
- status；
- stable sort/pagination；
- URL-preserved filters。

Detail 显示 immutable revision timeline、generation artifacts、print requests 和 void
event。普通用户不看到绝对 path、raw exception、内部 job id 或敏感 diagnostics。

## Strict i18n 硬门禁

1. 所有 tabs、headings、controls、field shell、required indicator、validation、
   generation/print/reprint/void states、dialogs、toasts、filters、pagination、
   empty/loading/error、tooltip、placeholder、aria/title 进入 typed `en` / `zh-CN`
   catalog。
2. API code/status/permission/profile 通过 typed mapping；不显示 raw code/enum 或
   backend English message。
3. Template name/content/field business label/POD reference 是 raw business data，
   不翻译、不与另一语言 fallback 拼接。
4. Generated PDF 语言由 template version 决定，不随 Web locale 改写。
5. 中文 direct SSR/hydration/refresh 不闪英文；English 不闪中文。
6. Locale switch 保留 composer draft、filter、selected document/revision，且页面只显示
   一种系统语言。
7. 运行 catalog parity、unmanaged-string、dynamic-code、unknown fallback 和 no-flash
   E2E；不得恢复 DOM translator。

## UX、响应式和可访问性

1. 这是办公室操作工具，采用紧凑、可扫描的信息层级，不做营销 hero 或装饰性卡片。
2. Template selector、form、status/actions 在 390/768/1366/1920 和 200% zoom 下无
   page-level horizontal overflow。
3. 多字段表单有稳定 label/error association，首个 invalid field 可聚焦。
4. generation status 使用 `aria-live` 但不重复播报 polling。
5. archive table 在窄屏使用可读 row layout，不把关键 Print/View action 隐藏到不可达
   横向滚动。
6. Print/reprint/void icon/button 有本地化 accessible name 和 tooltip。

## 非目标

- 不修改 template registry/API schema 或 Worker mapping contract。
- 不做 silent print/local print agent/打印机成功回执。
- 不做签名、照片、附件、邮件、批量或 container/load-job relation。
- 不物理删除记录。

## 必须测试

### Web unit

- schema-to-control mapping；
- typed value normalization/validation；
- template change/draft behavior；
- create/edit/idempotency/stale conflict；
- generation status/error/retry；
- archive query/URL；
- exact revision print/reprint/void；
- permission/navigation；
- all stable-code i18n mappings。

### Docker Chromium

使用真实 API、POD-00 sanitized fixture 和失败安全 cleanup：

1. OFFICE 选择 template、填写所有支持类型、保存、等待 READY。
2. Print request 指向 exact PDF，stub/事件证明 print action 仅在 PDF ready 后触发。
3. 编辑保存 revision 2；revision 1 bytes/SHA 仍可 reprint。
4. Template replacement/inactive 后旧 revision 仍可打开/reprint。
5. archive filters 找到 exact record；refresh 保留。
6. void reason/history/permission。
7. ADMIN/OFFICE allow；其他角色 menu/direct/API deny。
8. `en` / `zh-CN` direct load/refresh/switch；light/dark；390/768/1366/1920；
   200% zoom；长 business data。
9. 无 raw code/mixed language/English flash、console/pageerror/hydration/missing
   translation/unexpected 5xx。
10. 成功和故意失败后 document/revision/events/files/users residual 为 0。

## Docker-only 验证

```bash
docker compose -f infra/docker/compose.local.yml up -d --build
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api lint
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api typecheck
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api test --runInBand
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api test:e2e --runInBand
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web lint
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web typecheck
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web test
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web build
docker compose -f infra/docker/compose.local.yml exec -T worker-python uv run pytest
scripts/healthcheck.sh
git diff --check
```

另执行 POD focused Chromium runner，并逐张查看高信号截图。

## 验收标准

1. OFFICE/ADMIN 可从 `POD` 菜单选择模板、填写、保存、编辑新 revision。
2. READY revision 可一次操作打开 exact PDF print dialog，历史 revision 可重打。
3. Archive/filter/detail/revision/print/void history 使用真实 API 且无覆盖/重生成错误。
4. 权限、strict i18n/no-flash、draft preservation、a11y、responsive/theme/zoom 通过。
5. Docker API/Web/Worker/full-stack、build、migration status、cleanup、health、diff 通过。
6. 更新 Task/Index/完成度/HANDOFF，唯一下一任务为 POD-05。

