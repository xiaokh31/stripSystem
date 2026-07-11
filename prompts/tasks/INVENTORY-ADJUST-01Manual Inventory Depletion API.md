执行 INVENTORY-ADJUST-01：Manual Inventory Depletion API。

优先级：
- High。现场存在目的仓已经送库、但因为未扫码或其它操作原因导致系统库存仍然存在的情况。办公室人员需要一个受权限控制、可审计的人工消库存能力。

必须读取：
- AGENTS.md
- prompts/agents/business-logic-agent.md
- prompts/agents/product-planning-agent.md
- .codex/skills/bestar-domain/SKILL.md
- .codex/skills/nestjs-prisma-api/SKILL.md
- .codex/skills/warehouse-scan-flow/SKILL.md
- .codex/skills/auth-rbac/SKILL.md
- docs/architecture/04-api-contracts.md
- docs/architecture/09-account-role-permission-management.md
- docs/runbooks/warehouse-operator-manual.md
- apps/api/prisma/schema.prisma
- apps/api/src/auth/
- apps/api/src/permissions/
- apps/api/src/reports/inventory-reports.service.ts
- apps/api/src/load-jobs/
- apps/api/src/scan/
- apps/api/src/corrections/
- apps/api/src/containers/

前置任务：
- 无。

业务背景：
- 现有规则规定 `Pallet loaded status must only be changed by scan transaction`。
- 人工消库存不是扫码，不代表托盘被扫码装车，也不应该增加 loaded count。
- 新需求要解决的是“系统仍显示库存，但业务上这批目的仓/托盘已经不应再作为可装车库存存在”。

目标：
1. 新增受权限控制的人工消库存 API。
2. 人工消库存必须减少库存剩余数，但不得伪造扫码记录，不得把托盘设置成 `LOADED`。
3. 所有人工消库存行为必须可审计：谁、什么时候、对哪个柜子/目的仓/托盘、消了多少、原因是什么。
4. 更新库存统计口径，让 `remainingPallets` 排除人工消库存托盘。

建议数据模型：
1. 新增 `PalletStatus.ADJUSTED_OUT`。
   - 含义：该托盘已被办公室人工从可用库存中移除。
   - 中文 UI label 建议：`已人工消库存`。
   - 英文 UI label 建议：`Adjusted out`。
2. 新增 `PalletEventType.MANUAL_INVENTORY_DEPLETION`。
   - 事件只表示人工库存调整，不表示 scan、loaded、delivery。
3. 建议新增 `InventoryAdjustment` 分组表，便于一次操作对应多托盘：
   - `id`
   - `containerId`
   - `containerDestinationId`
   - `adjustmentType`，首期可为 `MANUAL_DEPLETION`
   - `palletCount`
   - `reasonCode`
   - `reasonText` 或 `note`
   - `createdById`
   - `createdAt`
   - `metadata`
4. 如果不新增分组表，至少必须用 `CorrectionFeedback` 加 `PalletEvent` 形成可查询审计链路；但不建议只靠前端状态或单条 note。

权限建议：
1. 新增权限：`inventory.adjust`。
2. 默认授予：
   - `ADMIN`
   - `OFFICE`
3. 不默认授予普通 `WAREHOUSE`。仓库扫码人员仍通过扫描改变库存。
4. `WAREHOUSE_MANAGER` 是否默认授予可按现有角色职责判断；若不确定，保持不默认授予，只允许管理员在权限矩阵中开启。

建议 API：
1. `POST /api/container-destinations/:id/inventory-adjustments`
   - 权限：`inventory.adjust`
   - Body：
```ts
interface ManualInventoryDepletionRequest {
  count?: number;
  palletIds?: string[];
  reasonCode: "DELIVERED_WITHOUT_SCAN" | "SCAN_MISSED" | "DATA_CLEANUP" | "OTHER";
  note?: string;
}
```
   - `count` 和 `palletIds` 至少提供一个。
   - 若提供 `palletIds`，以指定托盘为准。
   - 若只提供 `count`，后端按稳定顺序选择当前 eligible remaining pallets。
2. `GET /api/container-destinations/:id/inventory-adjustments`
   - 权限：`inventory.read`
   - 返回该目的仓的人工调整历史。
3. Container detail / inventory report 相关 API 需要返回：
```ts
interface PalletStats {
  totalPallets: number;
  loadedPallets: number;
  adjustedOutPallets: number;
  cancelledPallets: number;
  remainingPallets: number;
}
```

库存统计口径：
1. `totalPallets`：系统生成过且未删除的托盘总数；如现有口径排除 `CANCELLED`，保持一致但必须文档化。
2. `loadedPallets`：`status=LOADED`，只能由扫描事务产生。
3. `adjustedOutPallets`：`status=ADJUSTED_OUT`。
4. `remainingPallets`：可作为库存继续装车的托盘数量，不包含 `LOADED`、`CANCELLED`、`ADJUSTED_OUT`。
5. 人工消库存不得递增 `loadedPallets`，不得生成 `SCANNED` / `LOADED` 事件。

事务和校验：
1. 必须使用数据库事务完成：
   - 校验权限。
   - 锁定/重新读取目标目的仓和候选托盘。
   - 校验数量不能超过 eligible remaining pallets。
   - 更新托盘状态为 `ADJUSTED_OUT`。
   - 写入每个托盘的 `PalletEvent`。
   - 写入分组审计记录或 `CorrectionFeedback`。
2. Eligible pallet 首期建议限制为：
   - `PLANNED`
   - `LABEL_PRINTED`
   - `EXCEPTION`，仅当没有 open/in-progress load job 锁定该托盘时允许。
3. 对以下状态必须拒绝：
   - `LOADED`
   - `CANCELLED`
   - `ADJUSTED_OUT`
4. 对 `LOADING` 托盘默认拒绝，避免和正在进行的扫码装车冲突；如业务要求强制消库存，应另开 supervisor override 任务。
5. `reasonCode` 必填；`OTHER` 时 `note` 必填。
6. API error 必须返回稳定 code，例如：
   - `INVENTORY_ADJUSTMENT_PERMISSION_DENIED`
   - `INVENTORY_ADJUSTMENT_NO_ELIGIBLE_PALLETS`
   - `INVENTORY_ADJUSTMENT_COUNT_EXCEEDS_REMAINING`
   - `INVENTORY_ADJUSTMENT_PALLET_NOT_ELIGIBLE`
   - `INVENTORY_ADJUSTMENT_REASON_REQUIRED`

I18n hard gate：
1. API 不返回中文/英文 UI 句子作为前端显示源，只返回 stable code、enum、reasonCode、metadata。
2. 新增 `PalletStatus.ADJUSTED_OUT`、`PalletEventType.MANUAL_INVENTORY_DEPLETION`、reasonCode、error code 必须在 Web i18n/status-label helpers 中有中英文 label。
3. 任何审计列表、错误提示、成功提示、empty state、reason selector option、aria/title 文案由 Web locale catalog 管理。
4. 测试必须覆盖至少一个 API response 中不存在中文/英文 UI sentence 的断言。

不做：
1. 不做 Web UI，UI 由 INVENTORY-ADJUST-02 完成。
2. 不改变扫码事务把托盘置为 `LOADED` 的唯一性规则。
3. 不自动修改柜子 `ContainerStatus` 为 `LOADED` 或 `UNLOADED`。
4. 不删除托盘记录，不覆盖历史 pallet events。
5. 不用人工消库存修正原始 Excel 或 generated report。

验收标准：
1. Prisma migration 新增状态、事件类型和必要审计表/字段。
2. `inventory.adjust` 权限存在，并在 seed/default role 中按要求授予。
3. `POST /api/container-destinations/:id/inventory-adjustments` 能按 count 或 palletIds 消除 eligible 库存。
4. 消库存后对应托盘 status 为 `ADJUSTED_OUT`，不是 `LOADED`。
5. 每个被调整托盘都有 `MANUAL_INVENTORY_DEPLETION` 事件，包含 operator、reason、adjustment id 或关联 metadata。
6. 审计记录能按目的仓查询。
7. `remainingPallets` 减少，`loadedPallets` 不增加，`adjustedOutPallets` 增加。
8. 数量超过剩余库存、状态不 eligible、缺 reason、无权限均返回稳定 error code。
9. Duplicate scan / scan loading 现有回归测试不受影响。
10. i18n 数据边界测试通过：API 不泄露 UI 文案。

建议测试命令：
- pnpm --filter api prisma generate
- pnpm --filter api lint
- pnpm --filter api typecheck
- pnpm --filter api test -- inventory
- pnpm --filter api test -- load-jobs
- pnpm --filter api test:e2e -- inventory
- pnpm --filter api test:e2e -- scan
- git diff --check

手工验收：
1. 在 Docker full-stack 中准备一个有剩余库存的柜子目的仓。
2. 用 OFFICE 或 ADMIN token 调用人工消库存 API。
3. 查看库存报告，确认 remaining 减少、adjusted out 增加、loaded 不变。
4. 尝试扫码已 `ADJUSTED_OUT` 托盘，确认不会被当作可正常装车库存。
5. 用无 `inventory.adjust` 权限账号调用，确认被拒绝。

完成输出：
1. changed files。
2. migration 名称。
3. API contract 摘要。
4. 权限 seed 变更说明。
5. 测试命令和结果。
6. 手工验收结果。
7. 明确结论：`manual inventory depletion API implemented`。
