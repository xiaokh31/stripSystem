执行 UNLOAD-PALLET-05：Default Carton Package Type + Hide Package Selector。

优先级：
- High。当前托盘数计算功能存在业务口径偏差，必须在 pilot 前修复。

必须读取：
- AGENTS.md
- docs/product/03-pallet-calculation-rules.md
- prompts/tasks/UNLOAD-PALLET-01Detailed Pallet Rule Worker Calculator.md
- prompts/tasks/UNLOAD-PALLET-02Pallet Rule Persistence Report Label Regression.md
- prompts/tasks/UNLOAD-PALLET-03Detailed Pallet Calculation Regression.md
- prompts/tasks/UNLOAD-PALLET-04Packaging Type Pilot Verification + Correction.md
- .codex/skills/bestar-domain/SKILL.md
- apps/worker-python/src/worker_python/pallets/
- apps/worker-python/src/worker_python/parser/
- apps/api/src/imports/
- apps/api/src/corrections/
- apps/web/src/components/containers/

问题描述：
- 现在 container detail / actual unloading correction 中显示 `Package` 选择，用户需要在 Carton / Wooden crate / Unknown 之间选择。
- 业务要求改为：所有目的仓货物默认按纸箱计算，不要在普通办公室修正界面显示包装类型选择。
- 如果导入或创建的 destination 没有明确木箱信号，系统必须默认 `CARTON`，并按纸箱规则计算。

业务规则：
1. 所有导入 destination、手动创建 destination、人工修正 destination 的默认包装类型为 `CARTON`。
2. 普通 container detail / corrections UI 不展示 `Package` 下拉选择，不要求办公室人员选择包装类型后才能保存。
3. 私人/商业地址默认按纸箱规则：`ceil(totalVolumeCbm / 1.8)`。
4. 明确识别为木箱的源数据仍可按木箱规则：件数等于托盘数。
5. `UNKNOWN` / `UNSPECIFIED` / `null` package type 不再触发“必须人工确认包装类型”的 warning；它们应在计算时等价于 `CARTON`。
6. Manual pallet override 仍是最终 override，并且必须继续 auditable。
7. Report、label、task report 仍使用 `finalPallets`。

任务范围：
1. Worker pallet calculator：
   - 将 missing/unknown package type 的私人/商业地址默认计算为 `CARTON`。
   - 删除或调整 `PACKAGE_TYPE_CONFIRMATION_REQUIRED` warning，使其不再因缺少 package type 自动出现。
   - 保留明确木箱文本识别和木箱件数规则。
2. API import / correction：
   - 持久化时默认 package type 应为 `CARTON`，或在对外响应和重算时等价为 `CARTON`。
   - `createContainerDestination` 未传 packageType 时按 `CARTON` 计算。
   - `updateContainerDestination` 未传 packageType 时不得把已有 destination 变成 unknown review 状态。
3. Web container detail / corrections：
   - 移除普通列表和新增 destination 表单中的 `Package` 选择列/控件。
   - UI 可以展示 rule summary，但不应要求用户选择包装类型。
   - 不再显示 unknown package confirmation warning。
4. 兼容历史数据：
   - 历史 `UNKNOWN` / `UNSPECIFIED` destination 在页面展示和重算时按 `CARTON` 处理。
   - 历史 `WOODEN_CRATE` 不得被自动改成 `CARTON`，除非业务数据重新导入或用户做了明确托盘数修正。
5. 更新测试和必要的文案/i18n。

验收标准：
1. 导入私人/商业地址且没有包装类型字段的清单后，destination final pallets 使用 `ADDRESS_CARTON_VOLUME_1_8`，package confirmation warning 不出现。
2. 手动新增 destination 时，不显示 `Package` 选择，保存后按 `CARTON` 规则计算。
3. 修改 destination code / cartons / CBM / manual pallets / note 时，不需要触碰 package type 也可以保存。
4. 明确木箱样本仍使用 `ADDRESS_WOODEN_CRATE_PIECE_COUNT`。
5. 历史 unknown package destination 打开页面时不会要求选择包装类型；重算后按 carton 规则。
6. Excel report 和 label PDF 的托盘数继续等于 `finalPallets`。
7. 不影响 loading scan、库存、已装车/已送库状态、拆柜工资状态。

建议测试：
- Worker unit test：missing package type private/commercial address 默认 carton，无 confirmation warning。
- Worker unit test：explicit wooden crate 仍按件数。
- API unit/e2e：create/update destination 不传 packageType 时默认 carton 重算。
- Web test：container detail 不渲染 package selector；保存 payload 不包含 packageType 也成功。
- Web i18n test：不出现中英文混排 package review 文案。

建议测试命令：
- cd apps/worker-python && uv run pytest
- pnpm --filter api typecheck
- pnpm --filter api test
- pnpm --filter web typecheck
- pnpm --filter web test
- git diff --check

完成输出：
1. 列出改动文件。
2. 说明默认 carton 是在哪几层实现的：worker / API / Web。
3. 说明明确木箱规则是否保留。
4. 列出测试命令和结果。
5. 明确结论：`default carton package type complete`。
