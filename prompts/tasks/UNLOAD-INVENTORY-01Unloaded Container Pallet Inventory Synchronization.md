# 执行 UNLOAD-INVENTORY-01：Unloaded Container Pallet Inventory Synchronization

## 必须读取与使用的 skills

- `AGENTS.md`、`CONTEXT.md`
- `.codex/skills/bestar-domain/SKILL.md`
- `.codex/skills/nestjs-prisma-api/SKILL.md`
- `.codex/skills/warehouse-scan-flow/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- `apps/api/prisma/schema.prisma`
- `apps/api/src/reports/inventory-reports.service.ts`
- `apps/api/src/unloading-wage/unloading-wage.service.ts`
- `apps/api/src/corrections/corrections.service.ts`
- `apps/api/src/labels/labels.service.ts`
- `apps/api/src/common/container-lifecycle.ts`
- pallet/load-job/inventory-adjustment services and tests

## 当前数据来源与缺陷

目的仓库存当前不是直接读取 `ContainerDestination.finalPallets`。`InventoryReportsService` 查询数据库中的
`Container -> ContainerDestination -> Pallet[]`，按每条 `Pallet.status` 聚合：

- `LOADED` 为已扫码装车/已送库。
- `ADJUSTED_OUT` 为人工消库存。
- `CANCELLED` 不属于剩余库存。
- 其他有效托盘状态计入 remaining。

`finalPallets` 只在生成面单时用于创建托盘记录。当前 `completeContainerUnloading` 只把来源柜子状态更新为
`UNLOADED` 并写 correction feedback，没有同步或补齐托盘记录。因此未生成面单或实际托盘数后来修正的
柜子，标记已拆完后目的仓库存可能仍为 0 或与 `finalPallets` 不一致。

## 产品决定

1. 柜子进入 `UNLOADED`（已拆完）时，各目的仓 `finalPallets` 是当次“系统实际托盘数”快照。
2. 库存权威来源仍是数据库 `Pallet` 实体及状态；完成动作必须先把实体同步到 `finalPallets`，再提交
   `UNLOADED`，不能让前端用 `finalPallets` 临时拼库存。
3. 此同步不代表装车，严禁把托盘改成 `LOADED`；`LOADED` 仍只能由 scan transaction 写入。
4. 同步适用于所有进入 `UNLOADED` 的正式入口：拆柜工资“标记已拆完”、办公室手动状态修改，以及
   美转加关联柜组中的每个来源柜。

## 任务范围

### 1. 提取共享库存激活服务

- 新建深模块，例如 `ContainerPalletInventorySyncService`，由 unloading-wage completion 和 corrections
  status transition 共同调用；不要复制 labels service 的 pallet ID/QR 生成逻辑。
- 提取或复用统一 pallet identity builder，保证 `palletId`、`qrPayload` 全局唯一且后续可打印/扫码。
- 同步与 container `UNLOADED`、pay-container completion、correction feedback 必须在同一数据库事务中；
  任一步失败全部回滚。

### 2. 按目的仓对账

对每个 `ContainerDestination`：

- expected = `max(0, finalPallets)`。
- 读取现有 Pallet，并区分可安全复用与具有操作历史/装车状态的记录。
- 少于 expected：创建缺少的稳定 Pallet，写 `CREATED` event，metadata 标记
  `source=unloading-completion-inventory-sync` 和 actor/container/destination。
- 已有可复用 `PLANNED` / `LABEL_PRINTED`：保留 id、QR、面单时间和历史，不重复创建。
- 多于 expected：只对未进入 loading/loaded/adjusted/exception 且可安全移除的 surplus 执行可审计
  `CANCELLED` transition；不得删除 Pallet 或历史 event。
- 若存在无法安全缩减的 operational pallets，返回 stable conflict code 并阻止完成，不得静默篡改历史。

除非同时更新 scan、adjustment、report、label 和 lifecycle 全状态机并有 migration/e2e，本任务默认不新增
`IN_STOCK` enum。现有非 loaded/cancelled/adjusted 状态可作为 remaining inventory；重点是实体数量对账。

### 3. 库存统计语义

- 明确并测试 `totalPallets`、`loadedPallets`、`adjustedOutPallets`、`cancelledPallets`、
  `remainingPallets` 的互斥/包含关系。
- 当前库存 active total 不得因历史 cancelled surplus 高于 `finalPallets`；若保留历史 total，另返回明确的
  `activeTotalPallets`，Web 主库存使用 active total，不得暗改字段语义。
- 标记已拆完返回 per-destination sync summary：expected、reused、created、cancelled、active total、warnings。
- 重复执行 completion 必须幂等，不重复创建托盘、event 或增加库存。

### 4. 并发与历史保护

- 对 container/destination/pallet 同步路径使用数据库事务和必要锁，防止并发生成面单、修改托盘数或
  重复完成造成 duplicate ID/count。
- 已 `LOADING_IN_PROGRESS` / `LOADED` 的柜子不得倒退到 `UNLOADED` 或重算托盘。
- 已 `ADJUSTED_OUT`、`LOADED`、`CANCELLED` 的托盘历史不能覆盖或删除。
- `finalPallets` 在 UNLOADED 后继续服从现有 generation/correction lock。

## i18n 硬门禁

- API 仅返回 stable codes、enum、数字和 structured sync summary，不返回中文/英文 UI 句子。
- 新错误码至少覆盖 unsafe surplus、concurrent sync、invalid final count、sync failed；Web 文案进入
  `en` / `zh-CN` catalog。
- 不显示 raw code 作为主提示，不允许中英双语状态。

## 验收标准

1. 目的仓 `finalPallets=5`、无 pallet rows，完成拆柜后 inventory active total/remaining 为 5。
2. 已有 5 个 LABEL_PRINTED rows 时完成不新增，库存仍为 5且 identity/history 保留。
3. expected 从 5 变 3且 surplus 尚未操作时，2 个安全取消并审计，active total/remaining 为 3。
4. surplus 已 loading/loaded/adjusted/exception 时完成被 stable conflict 拒绝，事务不产生半完成状态。
5. 重复完成、并发完成不重复增加库存。
6. 美转加关联柜逐柜按自己的 destination/finalPallets 同步。
7. loaded 只由真实 scan transaction 产生，duplicate scan 规则不回归。
8. schema 变化有 migration，unit/e2e 和 Docker full-stack API smoke 通过。

## 测试命令

- `pnpm --filter api prisma generate`
- `pnpm --filter api lint`
- `pnpm --filter api typecheck`
- `pnpm --filter api test`
- `pnpm --filter api test:e2e`
- `git diff --check`

