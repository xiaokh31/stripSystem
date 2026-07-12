# 执行 UNLOAD-INVENTORY-02：Unloaded Inventory Web Refresh and Regression

## 前置任务

- `UNLOAD-INVENTORY-01Unloaded Container Pallet Inventory Synchronization.md`
- `WEB-I18N-06Full Localization No Flash Regression Gate.md`

## 必须读取与使用的 skills

- `AGENTS.md`、`CONTEXT.md`
- `.codex/skills/bestar-domain/SKILL.md`
- `.codex/skills/nextjs-pwa-ui/SKILL.md`
- `.codex/skills/warehouse-scan-flow/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- UNLOAD-INVENTORY-01 contracts/tests
- container detail、inventory report、dashboard inventory 和 unloading completion Web flows

## 任务范围

1. “标记已拆完”成功后刷新 container detail、目的仓库存、Dashboard inventory pressure 和 inventory report，
   不保留提交前 frontend derived count。
2. completion success 显示简洁 sync result：同步目的仓数、实际托盘总数；per-destination 详情按需展开，
   不常驻技术信息。
3. API conflict 使用本地化可行动提示，例如先检查目的仓托盘数或已进入装车的托盘；raw code 仅诊断。
4. Inventory report 清晰显示 active total、loaded、manual adjusted out、remaining；cancelled 不计当前实际库存。
5. 保持人工消库存、扫码装车和 container effective status 原有行为。

## i18n 硬门禁

- sync result、错误、表头、tooltip、aria、empty/loading 文案全部通过显式 Server/Client translator。
- en/zh catalog parity，English/中文单语显示；不得依赖 DOM MutationObserver。
- API structured code/summary 与 UI locale 映射分离。

## 回归矩阵

- 无 labels + final pallets -> complete -> inventory。
- 已有 labels -> complete -> no duplicate。
- 多目的仓、0 托目的仓、美转加关联柜。
- manual adjusted out 后 inventory math。
- scan one pallet 后 loaded +1、remaining -1；duplicate scan 不再减。
- UNLOADED -> LOADING_IN_PROGRESS -> LOADED 状态流与库存一致。
- ADMIN/OFFICE/WAREHOUSE_MANAGER 权限及无权限状态。

## 验收标准

1. 完成拆柜后无需手工刷新即可看到与 backend pallet rows 一致的库存。
2. 刷新/重新打开页面数值不回退，Dashboard 和 inventory report 一致。
3. 前端不从 `finalPallets` 自行计算 remaining。
4. 中英文、light/dark、desktop/mobile 无混语或布局溢出。
5. Web unit/render/Playwright 和 Docker full-stack smoke 通过。

## 测试命令

- `pnpm --filter web lint`
- `pnpm --filter web typecheck`
- `pnpm --filter web test`
- `pnpm --filter web build`
- `pnpm --filter web test:e2e`
- Docker full-stack inventory/unloading/scan smoke
- `git diff --check`

