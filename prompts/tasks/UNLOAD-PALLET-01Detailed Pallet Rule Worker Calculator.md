执行 UNLOAD-PALLET-01：Detailed Pallet Rule Worker Calculator。

必须读取：
- AGENTS.md
- docs/product/00-business-context.md
- docs/product/03-pallet-calculation-rules.md
- .codex/skills/bestar-domain/SKILL.md
- .codex/skills/unloading-excel-parser/SKILL.md
- apps/worker-python/src/worker_python/pallets/rules.py
- apps/worker-python/src/worker_python/pallets/calculator.py
- apps/worker-python/src/worker_python/parser/unloading_plan_cn.py
- apps/worker-python/src/worker_python/parser/bestar_receiving.py
- apps/worker-python/tests/unit/test_pallet_calculator.py
- apps/worker-python/tests/unit/test_unloading_plan_cn_parser.py
- apps/worker-python/tests/integration/test_phase0_e2e.py

前置任务：
- 当前 Phase 0 parser / pallet calculator 已可运行。

任务范围：
1. 将托盘数估算规则从通用“体积 + 高度容量”改为产品规则文档中的目的仓/地址细分规则。
2. 先实现 worker 侧 parser/calculator 和测试，不先改 UI。
3. 不修改原始 Excel fixture。
4. 不改 loading scan、库存扣减、label PDF 尺寸或 QR payload 规则。

业务规则：
1. `YYC4`、`YYC6`、`YEG2`
   - `1.7 CBM` 算一托。
   - 使用向上取整，不四舍五入。
2. `YVR2`、`YVR3`、`YVR4`
   - `2.2 CBM` 算一托。
   - 使用向上取整，不四舍五入。
3. `YEG1`
   - 先按 `1.7 CBM` 向上取整。
   - 有货时额外加 `5` 托。
4. 私人/商业地址
   - 纸箱：按 `1.8 CBM` 向上取整。
   - 木箱：按件数算，几件就是几托。
5. 不能把木箱和纸箱混合后按同一个体积规则计算。
6. 如果私人/商业地址无法识别纸箱/木箱，必须产生 warning，提示人工确认或人工托数修正。
7. `manualPallets` 仍然优先于计算值，且负数 manual override 仍回退到计算值并 warning。

实现要求：
1. 在 `apps/worker-python/src/worker_python/pallets/rules.py` 中建立清晰的 rule code / destination classification / package type 逻辑。
2. 在 `calculator.py` 中实现 volume divisor 和 piece-count 两类规则。
3. volume-based pallet count 使用 `ceil(totalVolumeCbm / divisor)`，不得使用 `round()`。
4. `cartons > 0` 且 volume 为 0 时，保留现有 warning / minimum volume 行为；`YEG1` 应在 minimum base 后加 5。
5. parser 需要尽力从真实字段、raw JSON、派送方式、服务名称、备注等文本中识别 package type：
   - wooden crate markers：`木箱`、`木架`、`木托`、`wood`、`wooden`、`crate`
   - carton markers：`纸箱`、`carton`、`ctn`
6. 如果现有 workbook 没有明确包装类型字段，不得丢弃 raw JSON；必须 warning。
7. 对私人/商业地址按 line 或同质 rule bucket 计算，避免先按目的仓汇总后丢失包装类型。
8. 保持 `palletIds` 唯一且数量等于 `finalPallets`。

建议新增/修改文件：
- apps/worker-python/src/worker_python/pallets/rules.py
- apps/worker-python/src/worker_python/pallets/calculator.py
- apps/worker-python/src/worker_python/parser/unloading_plan_cn.py
- apps/worker-python/tests/unit/test_pallet_calculator.py
- apps/worker-python/tests/unit/test_unloading_plan_cn_parser.py
- apps/worker-python/tests/integration/test_phase0_e2e.py

验收标准：
1. `YYC4` volume `3.39` -> `2` pallets。
2. `YYC4` volume `3.41` -> `3` pallets。
3. `YYC6` volume `1.70` -> `1` pallet。
4. `YEG2` volume `13.236` -> `8` pallets。
5. `YVR2` volume `4.39` -> `2` pallets。
6. `YVR3` volume `4.41` -> `3` pallets。
7. `YVR4` volume `0.5` 且 cartons > 0 -> `1` pallet。
8. `YEG1` volume `3.4` 且 cartons > 0 -> `7` pallets。
9. `YEG1` volume `0` 且 cartons > 0 -> warning + `6` pallets。
10. 私人/商业纸箱 volume `3.59` -> `2` pallets。
11. 私人/商业纸箱 volume `3.61` -> `3` pallets。
12. 私人/商业木箱 cartons/pieces `7` -> `7` pallets。
13. 私人/商业混合纸箱和木箱不会被错误合并到一个体积 divisor。
14. unknown destination 仍有 confirmation warning。
15. `manualPallets` 覆盖计算结果，最终 `palletIds` 数量等于 `manualPallets`。

建议测试命令：
cd apps/worker-python && uv run pytest tests/unit/test_pallet_calculator.py
cd apps/worker-python && uv run pytest tests/unit/test_unloading_plan_cn_parser.py
cd apps/worker-python && uv run pytest tests/integration/test_phase0_e2e.py
cd apps/worker-python && uv run pytest

完成输出：
1. 列出改动文件。
2. 列出 rule code / destination / divisor / rounding matrix。
3. 列出 tests run 和结果。
4. 明确说明是否存在包装类型无法从真实 Excel 判断的 fixture，以及对应 warning code。
