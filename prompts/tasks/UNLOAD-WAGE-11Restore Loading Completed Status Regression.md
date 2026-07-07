执行 UNLOAD-WAGE-11：Restore Loading Completed Status Regression。

必须读取：
- AGENTS.md
- prompts/agents/business-logic-agent.md
- docs/product/02-work-hours-and-unloading-wage-settlement.md
- prompts/tasks/UNLOAD-WAGE-08Container Unloaded Status Lifecycle.md
- prompts/tasks/WAGE-QA-04Unloaded Status and Monthly Summary Regression.md
- CONTEXT.md
- .codex/skills/bestar-domain/SKILL.md
- .codex/skills/warehouse-scan-flow/SKILL.md
- .codex/skills/nestjs-prisma-api/SKILL.md
- .codex/skills/nextjs-pwa-ui/SKILL.md
- apps/api/prisma/schema.prisma
- apps/api/src/common/container-lifecycle.ts
- apps/api/src/load-jobs/
- apps/api/src/corrections/
- apps/api/src/reports/
- apps/api/src/unloading-wage/
- apps/web/src/components/containers/container-status-control.tsx
- apps/web/src/components/containers/container-files-flow.ts
- apps/web/src/app/containers/[id]/page.tsx
- apps/web/src/app/reports/inventory/page.tsx
- apps/web/src/lib/api-client.ts
- apps/web/src/lib/i18n/

前置任务：
- UNLOAD-WAGE-08
- UNLOAD-WAGE-09
- UNLOAD-WAGE-10

问题背景：
1. 新增 `UNLOADED` / `已拆完` 后，用户发现原来的柜子装车完成状态不见了。
2. `已拆完` 不能替代原有 `LOADED`。
3. 原有装车完成功能必须保留：
   - 扫码装车完成后，container status 仍为 `LOADED`
   - 库存/装车进度/柜子详情/筛选仍能看到 `LOADED`
   - 不能把 `LOADED` 文案改成 `已拆完`
4. `UNLOADED` 只是拆柜完成、准备进入装车；`LOADED` 是装车/送库完成。
5. 中文显示名需要优化，避免“已拆完”和“已装完车”被误解为同一阶段：
   - `UNLOADED` 显示为 `已拆完`
   - `LOADING_IN_PROGRESS` 显示为 `装车中`
   - `LOADED` 显示为 `已送库`

任务范围：
1. 审查并修复所有因为新增 `UNLOADED` 导致 `LOADED` 不显示、不可筛选、不可作为当前状态展示的地方。
2. 恢复原有装车完成状态在 UI、API response、报表筛选、库存视图、装车流程中的可见性。
3. 保持 `LOADED` 的业务含义不变：它仍然由 loading scan / loading workflow 推进，不是 `标记已拆完` 的结果。
4. 优化状态中文显示名：`LOADED` 使用 `已送库`，不要使用 `已拆完`。
5. 不回滚 `UNLOADED`，只修复它和 `LOADED` 的边界。
6. 不改变拆柜工资结算金额规则。
7. 不改变 pallet scan 规则。

必须检查的高风险点：
1. `apps/web/src/components/containers/container-status-control.tsx`
   - 当前状态列表不能让已是 `LOADED` 的柜子显示空白或缺失。
   - 如果继续禁止办公室手动设置 `LOADED`，也必须能显示当前 `LOADED` 状态，并给出 scan-only 说明。
2. `apps/web/src/components/containers/container-files-flow.ts`
   - `containerStatusLabel("UNLOADED")` 必须显示 `已拆完`。
   - `containerStatusLabel("LOADING_IN_PROGRESS")` 应显示 `装车中`。
   - `containerStatusLabel("LOADED")` 必须显示 `已送库`，不能显示成 `已拆完`。
3. `apps/web/src/app/containers/[id]/page.tsx`
   - 柜子详情 status badge 必须能显示 `LOADED`。
4. 库存/报表/筛选页面
   - 仍能按 `LOADED` 查看装车完成柜子。
   - `UNLOADED` 和 `LOADED` 不应合并为同一个筛选值。
5. `apps/api/src/common/container-lifecycle.ts`
   - loaded pallet 全部完成时必须返回 container `LOADED`。
   - `UNLOADED` 不能阻止后续 scan 推进到 `LOADING_IN_PROGRESS` / `LOADED`。
6. `apps/api/src/load-jobs/`
   - 装车扫描完成后仍同步 container status 为 `LOADED`。
   - 不允许出现扫描完成但 container 仍停在 `UNLOADED` 的情况。
7. `apps/api/src/corrections/`
   - 如果已禁止手动设置 `LOADED`，错误文案必须清楚说明 `LOADED` 只能由扫描流程产生。
   - 这不等于隐藏 `LOADED` 当前状态。

业务要求：
1. `UNLOADED` = 已拆完 / 拆柜完成 / 还没有装车完成。
2. `LOADING_IN_PROGRESS` = 装车中。
3. `LOADED` = 已送库 / 装车送库完成。
4. 三个状态都必须可以在柜子详情和相关列表中被清楚区分。
5. 新增 `已拆完` 不得移除、隐藏、重命名、覆盖原有装车完成状态。
6. 月度拆柜数据总结可以把 `UNLOADED`、`LOADING_IN_PROGRESS`、`LOADED` 都作为已拆完来源，但 UI 明细必须保留真实 current status。
7. 拆柜工资结算可以读取已拆完数据，但不能把 wage completion status 当作 loading completed status。

验收标准：
1. 一个已由扫码流程完成装车的柜子，在柜子详情显示为 `LOADED` / `已送库`，而不是 `已拆完`。
2. 一个只点击 `标记已拆完`、尚未装车的柜子显示为 `UNLOADED` / 已拆完。
3. 一个开始装车但未全部完成的柜子显示为 `LOADING_IN_PROGRESS`。
4. 库存或报表筛选中仍能选择/查看 `LOADED` 装车完成数据。
5. `UNLOADED` 柜子经过正常装车扫描后，可以变为 `LOADING_IN_PROGRESS`，最终变为 `LOADED`。
6. 前端状态控件不会因为当前值是 `LOADED` 而显示空白、丢失选项或误导用户。
7. 如果前端状态控件不允许手动选择 `LOADED`，必须显示明确 scan-only 说明；不能让用户以为装车完成状态不存在。
8. 自动化测试覆盖：
   - container lifecycle `UNLOADED -> LOADING_IN_PROGRESS -> LOADED`
   - `LOADED` 当前状态显示
   - 中文显示名：`UNLOADED=已拆完`、`LOADING_IN_PROGRESS=装车中`、`LOADED=已送库`
   - `LOADED` 筛选/报表仍可用
   - `UNLOADED` 和 `LOADED` 不混淆
9. Docker full-stack smoke 验证柜子详情中三种状态都能显示。

建议测试命令：
pnpm --filter api lint
pnpm --filter api typecheck
pnpm --filter api test
pnpm --filter api test:e2e
pnpm --filter web lint
pnpm --filter web typecheck
pnpm --filter web test
pnpm --filter web build
docker compose -f infra/docker/compose.local.yml ps

手工验证步骤：
1. 找一个 `LABELS_GENERATED` 柜子，点击 `标记已拆完`，确认显示 `UNLOADED` / 已拆完。
2. 将该柜子加入装车流程并扫描部分 pallet，确认显示 `LOADING_IN_PROGRESS`。
3. 扫描完成所有 active pallets，确认显示 `LOADED` / 已送库。
4. 打开库存/报表筛选，确认 `LOADED` 仍可单独查看。
5. 打开月度拆柜数据总结，确认该柜子可以被包含，但明细 current status 仍显示真实的 `LOADED`。

完成输出：
1. 列出改动文件。
2. 列出测试命令和结果。
3. 明确说明 `UNLOADED` 与 `LOADED` 的最终边界。
4. 明确说明是否恢复了原有装车完成状态显示，并确认中文显示名为 `已送库`。
