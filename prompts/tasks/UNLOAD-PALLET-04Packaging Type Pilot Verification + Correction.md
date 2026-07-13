# 执行 UNLOAD-PALLET-04：Packaging Type Pilot Verification + Correction

## 优先级与依赖

- Pilot 前真实数据验证任务。
- 本任务已按 2026-07-12 托盘 policy 更新，不再使用私人/商业地址 `1.8 CBM` 旧除数。
- 前置：`UNLOAD-PALLET-08` 和 `UNLOAD-PALLET-09` 完成。
- 本任务的真实/脱敏 fixture 和结论交给 `UNLOAD-PALLET-10` 做 full-stack 关闭验证。

## 必须读取与使用

- `AGENTS.md`、`CONTEXT.md`
- `docs/product/03-pallet-calculation-rules.md`
- `prompts/tasks/UNLOAD-PALLET-08Configurable Pallet Footprint Settings and Policy Contract.md`
- `prompts/tasks/UNLOAD-PALLET-09Footprint Height Capacity and Oversize Piece Calculation.md`
- `.codex/skills/bestar-domain/SKILL.md`
- `.codex/skills/unloading-excel-parser/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- Worker pallet/parser code, API imports/corrections, Web container detail, report/label tests

## 背景

- 缺失、unknown 或 unspecified 包装类型继续默认 `CARTON`，不要求办公室人员选择包装类型。
- 当前现场风险是私人/商业/其他目的仓真实 workbook 是否能稳定识别明确木箱，以及是否提供足够可靠的件数。
- 体积大不能自动把业务包装类型改写为木箱；木箱识别和 `OVERSIZE_PIECE_COUNT` 计算模式必须分开审计。

## 任务范围

1. 使用真实或脱敏的私人/商业/其他目的仓 Excel 样本验证 parser 对明确木箱、默认纸箱、件数和体积的识别。
2. 缺少包装类型时默认纸箱且不产生 package confirmation warning。
3. 明确木箱按可靠件数一件一托；符合新 policy 的超大件使用 `OVERSIZE_PIECE_COUNT`，但不改写 `packageType`。
4. 私人、商业、courier、Goodcang 和其他非空目的仓均使用 policy snapshot 的 2.2m OTHER 容量；空目的仓仍告警。
5. Web container detail 不显示 package type selector，但显示本地化 rule、capacity、calculation mode、warning 和 final override。
6. Excel report、label、task report 使用持久化 `finalPallets` 和不可变 policy/rule metadata。
7. 保留 manual pallet override 优先级、correction audit、generated file audit、唯一 pallet ID 和扫码库存规则。

## 业务规则

1. 默认托盘尺寸 `1.0m * 1.2m`；OTHER 默认容量为 `1.0 * 1.2 * 2.2 = 2.64 CBM`。
2. 私人/商业默认纸箱按 `ceil(volume / effectiveOtherCapacityCbm)` 计算。
3. 明确木箱按件数计算，一件一托。
4. 平均单件体积大于有效容量且件数可靠时按超大件一件一托；普通多件纸箱不能因总体积大而误判。
5. unknown / missing package type 默认纸箱，不需要人工确认。
6. Manual correction 必须可审计；历史记录不能因 Settings 变化被静默重算。

## i18n 硬门禁

1. API/Worker 只返回 stable code、enum、数字和 raw source data，不返回中英双语 UI 句子。
2. 新增 package/calculation mode、OTHER group、warning、formula、unit、success/error 和 audit labels 必须进入 en/zh-CN catalog。
3. English/中文只显示当前 locale；不把 raw rule/setting key 当作主要文案。
4. Container detail 在 en/zh、light/dark 和长文案下不得错位、裁切或闪现另一语言。

## 验收标准

1. 至少加入 1 份真实或脱敏 pilot workbook fixture，覆盖私人/商业默认纸箱和明确木箱；样本证据不足时明确记录缺口，不能伪造生产数据。
2. Parser test 覆盖明确木箱、missing package 默认纸箱、可靠件数和无法可靠判断的 warning。
3. Calculator/API tests 覆盖 OTHER 2.64 默认容量、超大件一件一托、manual override 和 policy snapshot。
4. API correction test 覆盖默认纸箱重算、manual pallet override、audit metadata 和历史不追改。
5. Web test 覆盖隐藏 package selector、本地化 rule metadata、单语显示和保存后刷新。
6. Report/label regression 证明修正后 `finalPallets` 被使用，生成数量与唯一 pallet ID 一致。
7. 更新任务索引与完成度报告，并把 fixture 路径/脱敏方式交给 `UNLOAD-PALLET-10`。

## Docker 验证

```bash
docker compose -f infra/docker/compose.local.yml up -d --build
docker compose -f infra/docker/compose.local.yml exec -T worker-python uv run pytest
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api lint
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api typecheck
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api test
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api test:e2e
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web lint
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web typecheck
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web test
scripts/healthcheck.sh
git diff --check
```

不得在宿主运行 pnpm、Jest、uv 或开发服务。

## 手工验收

1. 上传真实/脱敏私人、商业或其他目的仓 Excel。
2. 打开 container detail，确认没有 package selector。
3. 核对默认纸箱、明确木箱和超大件的件数/体积/policy/rule metadata。
4. 生成报告和 label，核对托盘数、pallet ID、audit history。
5. 切换 English/中文并刷新，确认单语显示且布局无错位。

## 完成输出

列出 fixture、脱敏说明、package detection、piece-count reliability、公式结果、policy snapshot、correction/audit、
report/label、i18n 和 Docker tests。明确输出 `packaging type pilot verification complete`，或列出仍需业务提供的
真实字段/样本；不得用合成业务数据冒充现场验证。
