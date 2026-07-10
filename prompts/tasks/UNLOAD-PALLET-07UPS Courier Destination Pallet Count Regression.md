执行 UNLOAD-PALLET-07：UPS Courier Destination Pallet Count Regression。

优先级：
- Critical。现场已发现真实导入清单中 `UPS` 有 57 箱且体积不为 0，但系统计算托盘数为 0，直接影响报告、标签和库存。

必须读取：
- AGENTS.md
- docs/product/03-pallet-calculation-rules.md
- prompts/tasks/UNLOAD-PALLET-01Detailed Pallet Rule Worker Calculator.md
- prompts/tasks/UNLOAD-PALLET-05Default Carton Package Type + Hide Package Selector.md
- prompts/tasks/UNLOAD-PALLET-06Destination Correction Save Regression.md
- .codex/skills/bestar-domain/SKILL.md
- .codex/skills/unloading-excel-parser/SKILL.md
- .codex/skills/qa-regression/SKILL.md
- apps/worker-python/src/worker_python/parser/
- apps/worker-python/src/worker_python/pallets/
- apps/api/src/imports/
- apps/api/src/corrections/
- apps/web/src/components/containers/

现场问题：
- 导入清单中存在目的地 `UPS`。
- `UPS` 行有 57 箱，并且体积字段有值。
- 系统结果中 `UPS` 的 calculated/final pallets 为 0。

业务规则：
1. `UPS`、`PUROLATOR`、`PURO`、`P/A` 属于 courier/private/commercial address 类目的地。
2. 这些目的地默认按纸箱规则计算：`ceil(totalVolumeCbm / 1.8)`。
3. 只要 `cartons > 0` 且 `volume > 0`，calculated pallets 不得为 0。
4. 如果 `cartons > 0` 且 `volume = 0`，继续按现有 `ZERO_VOLUME_WITH_CARTONS` 规则给 warning，并至少按 1 托参与计算。
5. Manual pallet override 仍然优先；但导入阶段不能把系统 calculated pallets 写成 0 后让用户被迫手修。
6. Report、label PDF、container detail、inventory 继续使用 `finalPallets`。

重点排查方向：
1. Worker parser：
   - `UPS` 是否被正确保留为 destinationCode。
   - `UPS` 的 cartons/volume 是否进入 destination summary。
   - `UPS` 是否被 classify 为 private/commercial/courier address。
2. Worker pallet calculator：
   - `UPS` missing package type 是否默认 `CARTON`。
   - `UPS` 57 箱、体积大于 0 是否得到 `ADDRESS_CARTON_VOLUME_1_8` 和大于 0 的 calculated pallets。
3. API import persistence：
   - 检查 `containerDestinationRows` 中 summary 与 plan 的匹配 key。
   - 当前高风险点：summary 的 packageType 可能为空，而 pallet plan 默认成 `CARTON`，导致 `(destinationCode, packageType)` 配对失败，API 落库时 `plan` 为 undefined，calculated/final pallets 变成 0。
   - 修复时应统一 destination summary key 和 plan key 的 package type normalization，missing/unknown 应等价于 `CARTON`。
4. API correction：
   - 对历史 UPS destination 重新保存 cartons/volume 或清空 manual override 时，应按 carton rule 重算。
5. Web：
   - Container detail 中 UPS 显示 rule metadata、expected/final pallets，不得显示 0 托作为系统计算结果。

任务范围：
1. 使用用户提供的真实清单，或创建脱敏 fixture，覆盖 `UPS` 57 箱且体积大于 0。
2. 修复 worker/API 中导致 UPS 计划托数为 0 的根因。
3. 补充从 worker parsed JSON 到 API persisted destination 的全链路回归。
4. 确认生成 Excel report 和 Label PDF 时 UPS 托盘数使用修复后的 `finalPallets`。
5. 不改变 QR payload、PDF label 尺寸、scan transaction、库存扣减规则。

验收标准：
1. Worker unit test：`UPS`、`PUROLATOR`、`P/A` 默认按 `ADDRESS_CARTON_VOLUME_1_8`。
2. Worker fixture/integration test：`UPS` 57 箱且体积大于 0，calculated/final pallets 大于 0，且等于 `ceil(volume / 1.8)`。
3. API import test：worker summary packageType missing/null、plan packageType `CARTON` 时，API 仍能配对并持久化正确 calculated/final pallets。
4. API import/e2e test：导入包含 UPS 的 workbook 后，container destination 中 UPS 的 calculated/final pallets 不为 0。
5. Report/label regression：UPS 的 report 托数和 label 数量等于 `finalPallets`。
6. Web test：container detail 显示 UPS 的 rule summary 和非 0 托数。
7. `git diff --check` 通过。

建议测试命令：
- cd apps/worker-python && uv run pytest
- pnpm --filter api typecheck
- pnpm --filter api test
- pnpm --filter web typecheck
- pnpm --filter web test
- git diff --check

手工验收：
1. 上传现场发现问题的真实或脱敏清单。
2. 打开 import detail 和 container detail。
3. 找到 `UPS` 57 箱记录。
4. 确认 calculated pallets / final pallets 大于 0，并使用 `ADDRESS_CARTON_VOLUME_1_8`。
5. 生成 Excel report，确认 UPS 行托数正确。
6. 生成 Label PDF，确认托盘标签数量正确。

完成输出：
1. 说明根因，尤其是否为 summary/plan packageType key mismatch。
2. 列出使用的真实/脱敏 fixture。
3. 列出改动文件。
4. 列出测试命令和结果。
5. 明确结论：`UPS courier pallet count regression fixed`。
