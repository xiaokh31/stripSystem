# 执行 WEB-OPS-03：Dedicated Inventory Workspace and Destination Depletion

## 优先级与前置任务

- 优先级：P0 库存运营入口补全。
- 前置任务：`WEB-OPS-01Wide 2048 Office Workspace.md`、`WEB-OPS-02Container Detail Destination First Section Order.md`。
- 后续任务：`WEB-OPS-05I18n Visual and Performance Exit Gate.md`。

## 必须读取与使用

- `AGENTS.md`、`CONTEXT.md`
- `prompts/agents/business-logic-agent.md`
- `.codex/skills/frontend-design/SKILL.md`
- `.codex/skills/nextjs-pwa-ui/SKILL.md`
- `.codex/skills/bestar-domain/SKILL.md`
- `.codex/skills/nestjs-prisma-api/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- `INVENTORY-ADJUST-01Manual Inventory Depletion API.md`
- `INVENTORY-ADJUST-02Manual Inventory Depletion UI.md`
- `INVENTORY-ADJUST-03Manual Inventory Depletion Regression + Full-Stack Smoke.md`
- `UNLOAD-INVENTORY-01Unloaded Container Pallet Inventory Synchronization.md`
- `UNLOAD-INVENTORY-02Unloaded Inventory Web Refresh and Regression.md`
- `apps/web/src/components/layout/office-shell.tsx`
- `apps/web/src/app/reports/inventory/page.tsx`
- `apps/web/src/components/reports/inventory-*`
- `apps/web/src/components/containers/container-inventory-adjustment-*`
- `apps/web/src/lib/api-client.ts`、permissions、i18n catalogs
- API reports/container summary/inventory-adjustments controller/service/tests
- Docker Web/API E2E configuration

## 已确认现状

1. 现有 `/reports/inventory` 已展示按柜子和按目的仓汇总的后端库存，但它位于 Reports 二级入口。
2. 现有 `POST /api/container-destinations/:id/inventory-adjustments` 已实现可审计人工消库存，状态为
   `ADJUSTED_OUT`，不会伪装成装车扫码或 `LOADED`。
3. 现有柜子详情能取得 `containerDestinationId`、各目的仓 active/loaded/adjusted/remaining 和调整历史。
4. 当前人工消库存 UI 只在柜子详情；库存汇总页不能直接选择“指定柜子 + 指定目的仓”执行操作。

## 产品目标

新增顶层“库存 / Inventory”菜单和专用库存工作区。办公室用户可以从库存页精确选择一个柜子，再选择该柜子的
一个目的仓执行人工消库存；操作后所有库存视图从后端重新读取并保持审计一致。

## 路由与导航决定

1. 新增 canonical route `/inventory`，作为顶层库存工作区。
2. Office nav 顺序建议为 Dashboard、Imports、Containers、Inventory、Load Jobs、Reports、工资/设置等现有项。
3. 只有具备 `inventory.read` 的用户看到 Inventory 菜单并访问页面；调整按钮继续要求 `inventory.adjust`。
4. 旧 `/reports/inventory` 必须保留兼容并重定向或无损转发到 `/inventory`，保留 containerNo、destinationCode、
   status 等 query filters；现有 Dashboard、Reports、书签和 E2E 链接不得 404。
5. Reports 页可保留 Inventory report 入口，但应指向 canonical route；不得形成两套不同库存页面和逻辑。

## 库存工作流

1. 页面首屏显示真实后端汇总、过滤器、刷新状态、柜子表和目的仓总表。
2. 用户通过柜号过滤或柜子表的明确操作选择一个精确 `containerId`；不得仅用可能重复或模糊的柜号文本作为
   mutation identity。
3. 选中柜子后，页面加载该柜子的后端 inventory detail summary，显示柜号、状态及每个目的仓的
   `containerDestinationId`、active、loaded、adjusted out、cancelled、remaining。
4. 用户在指定目的仓行点击“人工消库存 / Manual inventory depletion”。确认界面必须明确显示柜号、目的仓、
   当前 remaining、消减数量或 pallet IDs、预计剩余、reason 和 note。
5. 继续复用现有 adjustment request、reason codes、stable errors、确认和 audit history；优先抽取/复用共享组件，
   禁止复制出第二套 request validation、error mapping 或状态计算。
6. 成功后从 API 刷新选中柜子、柜子汇总、目的仓汇总、调整历史、Dashboard inventory pressure 和其他已打开
   inventory/container tab；不得在前端直接 `remaining - count` 作为最终状态。
7. stale inventory、并发扫码/调整、已装车、已取消、已人工消减托盘必须由后端事务和 stable code 决定；失败
   不得产生部分 mutation。
8. 只读用户可以选择柜子并查看目的仓和历史，但不显示可操作的消库存按钮。
9. 操作成功继续生成真实 inventory adjustment/pallet event audit，actor 来自登录用户，不接受客户端伪造 userId。

## API 与数据边界

1. 首先证明现有 container summary、container detail summary 和 inventory-adjustments API 足够；能复用时不得新增
   平行 endpoint 或 schema。
2. 如确需扩展 list/detail DTO，只增加 stable id/code/raw counts；API 不返回中文或英文 UI 句子。
3. 不改变 `ADJUSTED_OUT` 语义，不创建 scan transaction，不增加 loaded count，不覆盖 pallet event 历史。
4. inventory remaining 始终由数据库 Pallet 状态计算；前端缓存、Dashboard 或 destination aggregate 不能成为 source of truth。
5. 不允许对 destinationCode aggregate 直接 mutation；每次 mutation 必须落到一个明确的
   `containerDestinationId`。

## UI 与交互要求

1. 页面是高密度运营工作区：过滤器、汇总、柜子选择、目的仓库存和历史清晰分区，不制作 landing page。
2. 选中柜子和目的仓必须有稳定视觉状态、键盘操作和 `aria-current` / dialog focus management。
3. destructive/financially relevant action 使用明确确认，不靠颜色表达；关闭/取消不丢失页面过滤器。
4. 2048px workspace 下柜子与目的仓可以并排；窄屏改为纵向，不出现 card-inside-card 或页面横向溢出。
5. 页面不得显示 API route、permission code、raw enum、React/数据库等技术说明。

## i18n 硬门禁

1. Inventory nav、页面标题、filter、select action、确认、预计结果、success/error、empty/loading、history、tooltip、
   aria-label 和 placeholder 全部进入 typed `en` / `zh-CN` catalogs。
2. adjustment reason/status/error 使用 stable code -> localized label helper；API 不返回本地化句子。
3. English 只显示 English，中文只显示中文；不得出现 `ADJUSTED_OUT`、reason code、labelKey 或双语 fallback 作为主 UI。
4. locale 切换和 refresh 保留 filters、selected container 和主题，不重复提交 mutation、不闪现另一语言。
5. i18n test 必须覆盖新 route/nav/component 的 catalog parity、visible-string AST gate 和动态参数消息。

## 验收标准

1. `inventory.read` 用户看到顶层 Inventory 菜单并能进入 `/inventory`；无权限用户菜单隐藏且 API/page 拒绝访问。
2. 旧 `/reports/inventory` 和所有已有链接无损进入 canonical inventory workspace。
3. 用户可以从库存页选择准确柜子和准确目的仓，完成一笔受权限控制、理由必填、可审计的人工消库存。
4. 操作只增加 adjusted out，loaded 不变；remaining 按后端状态减少；重复/并发操作不二次扣减。
5. 成功后页面、Dashboard、柜子详情和库存报告口径一致；失败时无部分更新。
6. 只读角色无操作按钮；`inventory.adjust` 角色具有完整 keyboard/dialog/error flow。
7. en/zh-CN、light/dark、390/768/1366/1920/2560、200% zoom 无混语、裁剪、重叠或页面溢出。
8. API/Web unit、API E2E、Docker Playwright、build、healthcheck 和 `git diff --check` 通过。

## 必须执行的测试

```bash
docker compose -f infra/docker/compose.local.yml up -d --build api web nginx
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api lint
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api typecheck
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api test -- --runInBand
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api test:e2e
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web lint
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web typecheck
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web test
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web build
docker compose -f infra/docker/compose.local.yml --profile e2e run --rm e2e-web web-ops-inventory.spec.ts --project=chromium
scripts/healthcheck.sh
git diff --check
```

E2E 必须创建带唯一前缀、可精确清理的测试柜子/目的仓/托盘，验证 adjustment 前后和 audit 后清理；不得对现有
业务柜子执行消库存，也不得通过 mock response 冒充 full-stack 验收。

## 完成输出

- 列出 route/nav/permission/API 复用或扩展决定。
- 给出测试 fixture、指定柜子/目的仓 mutation、loaded/adjusted/remaining/audit 前后证据。
- 列出双语角色矩阵、截图路径和人工视觉检查。
- 更新任务索引、完成度报告和必要 runbook。
