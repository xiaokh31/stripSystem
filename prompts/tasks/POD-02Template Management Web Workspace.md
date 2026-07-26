# 执行 POD-02：Template Management Web Workspace

## 优先级与状态

- 优先级：P1。
- Task-Status: OPEN
- 前置任务：POD-01 DONE。
- 后续任务：POD-03。
- 本 Task 交付 `POD` 菜单和模板维护 Web vertical slice，不创建正式 POD document。

## 必须读取与使用

- `AGENTS.md`、`HANDOFF.md`
- `prompts/agents/business-logic-agent.md`
- `docs/product/06-pod-template-and-document-management.md`
- `prompts/tasks/POD-00Real Template Contract and Worker Proof.md`
- `prompts/tasks/POD-01Versioned Template Registry API RBAC and Audit.md`
- `.codex/skills/bestar-handoff/SKILL.md`
- `.codex/skills/frontend-design/SKILL.md`
- `.codex/skills/nextjs-pwa-ui/SKILL.md`
- `.codex/skills/auth-rbac/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- OfficeShell/navigation、Reports/Settings、upload、combobox/table/dialog patterns
- `apps/web/src/lib/api-client.ts`
- `apps/web/src/lib/i18n/**`
- current Web E2E fixture/cleanup and visual gate patterns

## UX 范围

### 导航

1. 主菜单新增 `POD`，`en` 和 `zh-CN` visible label 都是 `POD`。
2. 只有拥有 `pod.template.read` 或未来 `pod.document.read/create` 的用户可见入口。
3. `/pod` 首版提供 Templates view，并为后续 Documents/New POD 保留清晰 tab
   contract；未实现功能不得显示假按钮。

### 模板列表

显示：

- business name；
- active/inactive status；
- current version；
- supported profile；
- updated time/actor；
- validation status/issues；
- actions。

支持：

- search、active filter、server pagination/stable sort；
- empty/loading/error/permission states；
- 打开 version history；
- 下载原始 source（有权限）；
- rename、activate/inactivate；
- 上传 replacement version。

### 上传和字段 mapping

1. 上传流程要求 template name 和 source file，显示明确 supported format/size。
2. 使用拖放/文件选择但保留可访问原生 input。
3. 上传后显示 server inspection，而不是浏览器自行解析为权威结果。
4. 按 POD-00 profile 提供字段 mapping editor：
   - stable field key；
   - business label；
   - type/required/limit；
   - 仅可选择 server allowlisted target；
   - validation issues 定位到对应字段。
5. Browser payload 不能包含任意 formula/path/cell target；必须使用 API 返回的
   option id/version token。
6. activation 前显示 preview artifact 和 print profile summary，validation 未通过
   时禁用 activation。
7. replacement 明确说明创建新 version，不覆盖旧 POD。

## 状态和并发

1. 使用 server revision/ETag 防止两个页面 rename/activate 静默覆盖。
2. stale conflict 显示本地化提示并重新加载服务器状态，不自动重试 destructive action。
3. 上传中、inspection、valid/invalid、activating、inactive 使用稳定 layout，不能
   因长文件名/双语文本跳动或溢出。
4. 原始文件名和 template name 是业务数据；显示前做正常 escaping，不翻译。

## Strict i18n 硬门禁

1. 所有 menu/tab、heading、button、field label、status、validation summary、
   upload/drag text、dialog、toast、empty/loading/error、tooltip、placeholder、
   aria/title 和 pagination 文案进入 typed `en` / `zh-CN` catalog。
2. API stable code/profile/status 通过 typed mapping；普通 UI 不显示 raw enum/code、
   API English message 或双语拼接。
3. 用户 template name、filename 和 field business label 作为 raw business data
   显示，不机器翻译。
4. Chinese direct load/no-JS SSR/hydration 从首帧就是中文系统 UI；English 同理。
5. locale switch 保留当前 tab、filter、selected template、未提交 mapping draft 和
   upload metadata，不重新上传文件。
6. catalog parity、unknown-code fallback、unmanaged-string AST 和 no-flash E2E 必须通过。

## 权限和安全

1. ADMIN/OFFICE manage；其他角色入口隐藏且 direct URL/API 403。
2. read-only permission 只能列表/详情/下载，不显示或启用 manage actions。
3. Web 不接收/显示 storage path、stack 或 secret。
4. 文件错误和 validation 不把原始 package XML/公式内容暴露给普通页面。

## 非目标

- 不创建/保存/打印 POD document。
- 不实现电子签名、容器关联、批量生成或任意格式。
- 不改变 OfficeShell 视觉系统或既有菜单权限。
- 不在浏览器实现模板解析权威逻辑。

## 必须测试

### Web unit

- API client typed contracts；
- permission/navigation；
- list/filter/pagination/sort；
- upload/mapping payload；
- code/status/profile i18n mapping；
- stale conflict、unknown code、business-data escaping；
- locale switch draft preservation。

### Docker Chromium

使用真实 API 和 POD-00 sanitized fixture：

1. ADMIN/OFFICE 上传、命名、mapping、preview、activate。
2. replacement version 后旧版本仍可查看/下载。
3. rename、inactivate/reactivate、duplicate/invalid/unsafe failure。
4. WAREHOUSE/WAREHOUSE_MANAGER/HR_MANAGER 不可发现/direct deny。
5. `en` / `zh-CN` direct load、refresh、switch；light/dark；390/768/1366/1920；
   200% zoom。
6. 长 template name/filename/field label 不重叠、裁切或造成 page overflow。
7. console/pageerror/hydration/missing translation/unexpected 5xx 为 0。
8. 成功/故意失败后精确清理 template/version/storage/user fixture。

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

另执行独立失败安全 Chromium runner 并逐张检查高信号截图。

## 验收标准

1. `POD` 菜单和 Templates workspace 使用真实 API。
2. OFFICE/ADMIN 可完成 upload/name/mapping/preview/version/status 维护。
3. replacement 不覆盖旧版本，stale/invalid/duplicate/unsafe 有可行动单语提示。
4. 权限、strict i18n/no-flash、a11y、responsive/theme/zoom 和 cleanup 通过。
5. API/Web/Worker full checks、build、health、migration status、diff 通过。
6. 更新 Task/Index/完成度/HANDOFF，唯一下一任务为 POD-03。

