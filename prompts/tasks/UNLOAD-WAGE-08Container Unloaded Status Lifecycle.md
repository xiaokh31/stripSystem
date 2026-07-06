执行 UNLOAD-WAGE-08：Container Unloaded Status Lifecycle。

必须读取：
- AGENTS.md
- prompts/agents/business-logic-agent.md
- docs/product/02-work-hours-and-unloading-wage-settlement.md
- prompts/tasks/UNLOAD-WAGE-01Container Detail Unloading Wage API.md
- prompts/tasks/UNLOAD-WAGE-02Container Detail Unloading Wage UI.md
- CONTEXT.md
- .codex/skills/bestar-domain/SKILL.md
- .codex/skills/nestjs-prisma-api/SKILL.md
- .codex/skills/nextjs-pwa-ui/SKILL.md
- apps/api/prisma/schema.prisma
- apps/api/src/common/container-lifecycle.ts
- apps/api/src/unloading-wage/
- apps/api/src/load-jobs/
- apps/api/src/reports/
- apps/web/src/components/containers/
- apps/web/src/lib/api-client.ts

前置任务：
- UNLOAD-WAGE-01
- UNLOAD-WAGE-02

任务范围：
1. 新增柜子生命周期状态 `UNLOADED`，中文显示为 `已拆完`。
2. 当用户点击 `标记已拆完` / 保存拆柜完成时，同步更新 container status。
3. 保持 pallet `LOADED` 和 container `LOADED` 仍然只能由装车/扫码流程推进。
4. 更新 Web 状态显示、状态筛选、load job 可选柜逻辑和相关测试。
5. 不改拆柜工资金额规则。
6. 不做月度拆柜数据总结导出；该功能由 UNLOAD-WAGE-09/10 执行。

业务要求：
1. 当前问题：柜子完成拆柜后仍显示 `LABELS_GENERATED`，业务上不合适。
2. 新增 `ContainerStatus.UNLOADED`，用于表示办公室/仓管已确认拆柜完成。
3. 状态推荐流转：
   - `LABELS_GENERATED` -> `UNLOADED` when `标记已拆完`
   - `UNLOADED` -> `LOADING_IN_PROGRESS` when loading scan/load job starts
   - `LOADING_IN_PROGRESS` -> `LOADED` when all active pallets are loaded by scan
4. 如果柜子已经是 `LOADING_IN_PROGRESS` 或 `LOADED`，保存拆柜完成不能降级回 `UNLOADED`。
5. `UNLOADED` 之后仍应能进入装车计划/扫描流程；不要因为原有查询只找 `LABELS_GENERATED` 而漏掉已拆完柜子。
6. `UNLOADED` 应视为已进入后续操作阶段，报表/标签重新生成等高风险动作应按现有 operation lock 规则审查，不能静默覆盖。
7. `LOADED` 仍然只代表装车完成，不能由办公室手动状态更新直接设置。
8. 状态变更必须写审计记录或 correction feedback，记录操作者、old status、new status、原因。

建议实现点：
1. Prisma enum 增加 `UNLOADED` 并创建 migration。
2. 更新 generated Prisma client。
3. 更新 `effectiveContainerStatus` / `containerStatusFromInventoryCounts`：
   - 无装车扫描时保留 `UNLOADED`
   - 有部分/全部 loaded pallet 时返回 `LOADING_IN_PROGRESS` / `LOADED`
4. 更新完成拆柜 API：
   - 从 `LABELS_GENERATED`、`REPORT_GENERATED`、`CORRECTED` 等未装车状态标记为 `UNLOADED`
   - 不从 `LOADING_IN_PROGRESS` / `LOADED` 降级
5. 更新 load job container suggestion / planning 过滤条件，确保 `UNLOADED` 可用于装车。
6. 更新 Web 状态 label / i18n / filters。

验收标准：
1. 一个 `LABELS_GENERATED` 柜子点击 `标记已拆完` 后，详情页显示 `已拆完` / `UNLOADED`。
2. `LOADING_IN_PROGRESS` 柜子保存拆柜完成后仍保持 `LOADING_IN_PROGRESS`。
3. `LOADED` 柜子保存拆柜完成后仍保持 `LOADED`。
4. `UNLOADED` 柜子仍能被加入装车计划或进入后续 loading workflow。
5. 办公室手动操作不能直接把柜子设为 `LOADED`。
6. 状态变更有审计记录。
7. API/Web tests 覆盖新状态、状态显示、load job 兼容和不降级规则。

测试命令：
pnpm --filter api lint
pnpm --filter api typecheck
pnpm --filter api prisma migrate status
pnpm --filter api test
pnpm --filter api test:e2e
pnpm --filter web lint
pnpm --filter web typecheck
pnpm --filter web test
pnpm --filter web build
