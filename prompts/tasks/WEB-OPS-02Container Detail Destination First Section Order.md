# 执行 WEB-OPS-02：Container Detail Destination-First Section Order

## 优先级与前置任务

- 优先级：P1 柜子详情信息层级调整。
- 前置任务：`WEB-OPS-01Wide 2048 Office Workspace.md`。
- 后续任务：`WEB-OPS-03`、`WEB-OPS-05`。

## 必须读取与使用

- `AGENTS.md`、`CONTEXT.md`
- `prompts/agents/business-logic-agent.md`
- `.codex/skills/frontend-design/SKILL.md`
- `.codex/skills/nextjs-pwa-ui/SKILL.md`
- `.codex/skills/bestar-domain/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- `apps/web/src/app/containers/[id]/page.tsx`
- `apps/web/src/components/containers/container-destination-corrections.tsx`
- `apps/web/src/components/containers/container-unloading-wage-panel.tsx`
- `apps/web/src/components/containers/container-inventory-adjustment-panel.tsx`
- `apps/web/src/components/containers/container-generated-files.tsx`
- 对应 Web unit/E2E 和 i18n catalogs

## 已确认现状

柜子详情当前依次渲染拆柜工资、状态操作、目的仓库存、生成文件，最后才显示目的仓。用户需要先查看柜子的
目的仓明细，再处理与这些目的仓相关的拆柜工资和库存，因此当前页面阅读与操作顺序不符合业务心智模型。

## 产品决定与目标顺序

“放在目的仓下方”解释为页面 section 的视觉顺序和 DOM/键盘顺序，不把完整工资或库存卡片嵌套进单个目的仓卡片。

柜子详情的主顺序调整为：

1. 柜子标题、状态摘要和警告。
2. 柜子状态操作。
3. 目的仓明细与修正。
4. 拆柜工资信息。
5. 目的仓库存与人工消库存。
6. 生成文件与其他后续信息。

## 实现要求

1. 在 `containers/[id]/page.tsx` 中按上述顺序调整真实组件的 DOM，不使用 CSS `order` 制造视觉/键盘顺序不一致。
2. `ContainerDestinationCorrections` 必须位于工资和库存 section 之前；工资必须紧随目的仓，库存紧随工资。
3. 保留工资 section 的完成后自动收缩、手动展开、NEEDS_REVIEW 摘要、worker selector 和未保存 draft 行为。
4. 保留库存 read/adjust permission、目的仓历史、确认对话框、API 刷新和错误聚焦行为。
5. 保留状态更新、generated file、label/report/reprint 及 correction audit 的原业务 contract。
6. 仅调整层级所需的数据加载不得串行化或重复调用 API；现有 server-side 并发加载和 permission pruning 保持。
7. 无库存权限时直接省略库存 section，不保留空白占位；无工资管理权限时工资仍按既有只读规则显示。
8. 使用清晰 heading hierarchy 和 landmark；不得把 section 做成 card-inside-card，也不得新增解释代码结构的 UI 文案。
9. 390/768/1366/1920/2560 宽度下，长柜号、长目的仓、English 按钮和折叠摘要不重叠。

## 明确非目标

- 不改变柜子状态机、`UNLOADED` / loading / delivered 语义。
- 不改变工资算法、临时工目录、托盘同步或人工消库存 API。
- 不删除柜子详情中的人工消库存入口；`WEB-OPS-03` 只增加库存专页入口。
- 不借本任务重做目的仓编辑器或 generated files UI。

## i18n 硬门禁

1. 现有 section title、按钮、折叠 aria-label、toast/error 必须继续由 typed translator 生成。
2. 如新增 section summary、anchor、tooltip 或 accessibility 文案，必须同步加入 `en` / `zh-CN` catalogs。
3. English 和中文页面只显示当前语言，不得显示 raw enum、raw labelKey、双语标题或英文 fallback。
4. E2E 必须在两种语言中断言可见 heading 顺序，并验证 refresh/折叠后语言不变、无 hydration warning。

## 验收标准

1. DOM 和视觉顺序均为“目的仓 -> 拆柜工资 -> 目的仓库存”。
2. 状态操作在目的仓之前，生成文件在库存之后；键盘 Tab/heading navigation 与视觉顺序一致。
3. 工资自动收缩、worker selector、库存调整、历史、权限和错误状态无回归。
4. 重排没有增加重复 API 请求或改变后端库存/工资 source of truth。
5. en/zh-CN、light/dark、390/768/1366/1920/2560 和 200% zoom 无重叠、裁剪、页面横向溢出。
6. Web lint、typecheck、unit、build、Docker Playwright、healthcheck、`git diff --check` 通过。

## 必须执行的测试

```bash
docker compose -f infra/docker/compose.local.yml up -d --build web nginx
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web lint
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web typecheck
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web test
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web build
docker compose -f infra/docker/compose.local.yml --profile e2e run --rm e2e-web web-ops-container-detail.spec.ts --project=chromium
scripts/healthcheck.sh
git diff --check
```

E2E 使用真实本地 API 柜子数据或隔离 fixture，至少覆盖库存可调角色与只读角色，不得修改无法清理的真实业务记录。

## 完成输出

- 列出最终 section 顺序、修改文件和权限分支。
- 列出工资/库存交互回归、API 请求计数、双语截图和视觉检查结果。
- 更新任务索引与完成度报告。
