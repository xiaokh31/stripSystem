# 执行 POD-05：Full Stack I18n, Print and Archive Exit Gate

## 优先级与状态

- 优先级：P1，POD 功能关闭门禁。
- Task-Status: OPEN
- 前置任务：POD-00/01/02/03/04 全部 DONE。
- 本 Task 不扩展产品范围，只修复退出门禁暴露的缺陷并完成可重复证据。

## 必须读取与使用

- `AGENTS.md`、`HANDOFF.md`
- `prompts/agents/business-logic-agent.md`
- `docs/product/06-pod-template-and-document-management.md`
- `prompts/tasks/POD-00Real Template Contract and Worker Proof.md`
- `prompts/tasks/POD-01Versioned Template Registry API RBAC and Audit.md`
- `prompts/tasks/POD-02Template Management Web Workspace.md`
- `prompts/tasks/POD-03Document Revision Generation Archive API.md`
- `prompts/tasks/POD-04Composer Print and Archive Web Workflow.md`
- `.codex/skills/bestar-handoff/SKILL.md`
- `.codex/skills/auth-rbac/SKILL.md`
- `.codex/skills/bestar-domain/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- `.codex/skills/docker-local-deploy/SKILL.md`
- POD migration/API/Worker/Web tests, visual runner, fixture registry and cleanup

## 机器可读覆盖清单

在测试前建立 inventory，至少列出：

- permissions/routes/menu/views/actions；
- template statuses/profile/issues；
- document/revision/generation/void/print statuses；
- every API stable code and Web mapping；
- template create/version/activate/inactivate/download；
- POD create/edit/revision/print/reprint/archive/void/download；
- generated source/PDF artifacts；
- locales、themes、viewports、zoom、roles；
- DB/storage/job/user fixture ownership and cleanup。

门禁必须从 inventory 驱动，不能只写几个 happy-path screenshot。

## Full-stack 业务矩阵

1. 上传 POD-00 approved/sanitized source，命名、mapping、preview、activate。
2. 用 version 1 创建 POD revision 1，生成 source + PDF 并打印请求。
3. 上传/activate version 2；确认 revision 1 的 source/PDF/template SHA 不变。
4. 编辑 document 创建 revision 2；两版都可 exact download/reprint。
5. inactivate template；旧 revision 仍可读/重打，新 POD 不再可选。
6. archive 按 POD number/template/date/reference/status 精确查到目标。
7. void 需要 reason，记录 actor，bytes/history 不删除。
8. duplicate/unsafe/oversized template、invalid mapping、invalid values、stale revision、
   generation failure、missing file/SHA mismatch、popup blocked 全部 fail closed。
9. HTTP/queue retry、并发 save、restart/recovery 不重复 POD number/revision/artifact。
10. success 和故意失败 cleanup 后所有 fixture residual 为 0，非 fixture 指纹不变。

## RBAC 门禁

对 ADMIN、OFFICE、WAREHOUSE、WAREHOUSE_MANAGER、HR_MANAGER 分别从真实登录执行：

- menu 可见性；
- direct route；
- template list/manage；
- document list/create/update/print/void；
- source/PDF download；
- audit attribution。

API 403 与 UI hidden 都必须验证；不能用 ADMIN 一种角色代替。

## Strict i18n 退出门禁

1. Typed catalog parity：POD system keys 在 `en`/`zh-CN` 完全对称。
2. Stable code/status/profile/permission inventory 全部有显式 mapping。
3. Unknown code 使用当前 locale 通用 fallback，不显示 raw code。
4. 遍历 POD app/components，拒绝未管理 visible string、placeholder、title、
   aria-label、confirm/alert/toast 和 dynamic action sentence。
5. `en` 和 `zh-CN` 各执行 direct no-JS/SSR -> hydration -> refresh -> locale switch。
6. 中文不闪英文，英文不闪中文；不允许双语 status/button。
7. Template name/content/field label/POD reference 保持 raw business data；测试不得把
   用户英文模板内容误报为 UI i18n 泄漏。
8. Generated document language由 template 决定，切 Web locale 后 archived PDF SHA
   不变。

## 生成文件和打印门禁

1. 原模板 SHA 前后不变；version source bytes 可重复下载。
2. 每个 revision 的 template snapshot、input snapshot、source/PDF SHA/size/media、
   generated-file/audit 一致。
3. Package-level 检查 mapped/untouched cells、formula/style/merge/image/print setting。
4. Docker office render 比较 approved completed example 与 revision 1/2 PDF：
   page geometry、关键文字、长 ASCII/CJK/multiline 和打印区域完整。
5. 输出全页及关键 crop PNG，Agent 必须逐张按原分辨率检查。
6. Browser Print 只对 READY saved revision，print event 不声称物理成功。
7. 目标 Windows/Microsoft Print Preview/office printer 为生产 external gate；缺少时
   repository Task 可在全部自动化完成后准确记录 external verification pending，
   不得提前停止实现或伪报实体打印通过。

## 视觉与可访问性

覆盖至少：

- 390x844 mobile；
- 768 宽；
- 1366x768；
- 1920 宽；
- 200% zoom；
- light/dark；
- `en`/`zh-CN`；
- template list、mapping、composer validation、READY detail、archive/history、
  permission denied。

断言：

- 无页面级横向溢出、重叠、裁切、不可达 action；
- long template/POD/business values 正确换行；
- focus/error summary/keyboard/dialog/aria-live 可用；
- console/pageerror/hydration/missing translation/failed resource/unexpected 5xx 为 0。

## 性能和安全

1. template/document/archive list server pagination，无 N+1/全表 hydration。
2. generated PDF 不进 SSR payload；download 流式且受权限保护。
3. upload/generation 有明确大小/时间/资源上限。
4. ZIP/macro/external link/path traversal/formula injection/malformed mapping tests 通过。
5. 日志、Task report、HANDOFF、screenshots 不含模板敏感值、绝对路径、token 或账号。
6. polling bounded；页面 hidden/unmount 后停止，无 timer/request leak。

## 非目标

- 不新增第二种 template format/profile。
- 不增加签名、附件、邮件、批量生成、container/load-job relation 或 silent print。
- 不重做 Office Shell、auth、generated-file 或 queue 架构。
- 不用扩大截图数量掩盖缺少 machine-readable assertion。
- 不物理删除模板、POD revision、artifact 或审计事件。

## Docker-only 全量验证

```bash
docker compose -f infra/docker/compose.local.yml up -d --build
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api prisma migrate status
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

还必须：

- 在临时空库执行完整 migration chain；
- 执行 POD 专用失败安全 Chromium/visual/cleanup runner；
- 故意失败一次验证 trap/finally cleanup；
- 生成 machine-readable residual audit 和简短 verification report。

## 验收标准

1. POD-00 至 04 的每个 acceptance criterion 均有可追溯证据。
2. Template version、POD revision、生成 bytes、打印请求和 archive 全链路不可覆盖、
   可审计、可精确重打。
3. ADMIN/OFFICE allow 与其他三角色 deny 的 UI/API 矩阵通过。
4. strict `en`/`zh-CN`、no-flash、business-data exemption、theme/viewport/zoom/a11y
   全部通过。
5. package/PDF/PNG 视觉和 print contract 通过，Agent 已逐图查看。
6. security、performance、concurrency/retry/recovery 和 exact cleanup 通过。
7. existing+empty migration、API/Web/Worker full suites、build、health、diff 通过。
8. 更新 Task Index、完成度报告、POD runbook 和 `HANDOFF.md`。
9. 只有真实 Microsoft/目标打印机未提供时可
   `CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING`；任何可自动化缺口都不允许留到
   external gate。
