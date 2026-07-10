执行 UNLOAD-PALLET-04：Packaging Type Pilot Verification + Correction。

优先级：
- Pilot 前建议做。此任务已根据 2026-07-09 新规则调整：缺少包装类型时默认纸箱，不再要求 unknown package 人工确认。

必须读取：
- AGENTS.md
- docs/product/03-pallet-calculation-rules.md
- prompts/tasks/UNLOAD-PALLET-01Detailed Pallet Rule Worker Calculator.md
- prompts/tasks/UNLOAD-PALLET-02Pallet Rule Persistence Report Label Regression.md
- prompts/tasks/UNLOAD-PALLET-03Detailed Pallet Calculation Regression.md
- .codex/skills/bestar-domain/SKILL.md
- .codex/skills/unloading-excel-parser/SKILL.md
- .codex/skills/qa-regression/SKILL.md
- apps/worker-python/src/worker_python/pallets/
- apps/worker-python/src/worker_python/parsers/
- apps/api/src/corrections/
- apps/api/src/imports/
- apps/web/src/components/containers/

背景：
- 详细托盘计算规则已经实现。
- 当前剩余风险是私人/商业地址真实 workbook 是否能稳定识别明确木箱。
- 如果 package type missing / unknown，系统应默认 `CARTON` 并按纸箱规则计算，不再进入人工确认/修正。

任务范围：
1. 用真实 pilot 私人/商业地址 Excel 样本验证 parser 是否能识别明确木箱。
2. 缺少包装类型或无法识别包装类型的私人/商业地址必须默认纸箱，不能生成 package confirmation warning。
3. Web container detail 不显示 package type 选择；可显示 rule code、basis、rounding 等计算说明。
4. Excel report、label、task report 继续使用 `finalPallets` 和可追溯 rule metadata。
5. 不破坏 manual pallet override 优先级。

业务规则：
1. 私人/商业纸箱按 1.8 CBM 向上取整。
2. 私人/商业木箱按件数算。
3. unknown / missing package type 默认按纸箱，不需要人工确认。
4. Manual correction 必须 auditable。
5. Generated report/label 必须记录 generated file。
6. QR payload 必须继续含 unique pallet ID。

验收标准：
1. 至少加入 1 份真实或脱敏 pilot workbook fixture，覆盖私人/商业默认纸箱和明确木箱。
2. Parser test 覆盖明确木箱 detection，以及 missing package type 默认纸箱。
3. API correction test 覆盖默认纸箱托盘重算、manual pallet override、audit metadata。
4. Web test 覆盖不显示 package selector、保存后 rule metadata 更新。
5. Report/label regression 证明修正后 `finalPallets` 被使用。
6. 更新 `docs/reports/project-completion-status.html` 中包装类型现场数据口径状态。

建议测试命令：
- cd apps/worker-python && uv run pytest
- pnpm --filter api lint
- pnpm --filter api typecheck
- pnpm --filter api test
- pnpm --filter web lint
- pnpm --filter web typecheck
- pnpm --filter web test
- git diff --check

手工验收：
1. 上传真实私人/商业地址 Excel。
2. 打开 container detail。
3. 确认没有 package selector。
4. 确认缺少包装类型的目的仓默认按纸箱规则计算。
5. 生成报告和 label。
6. 确认托盘数、rule metadata、audit history 正确。

完成输出：
1. 列出验证过的真实/脱敏 fixture。
2. 列出 package type detection 结果。
3. 列出是否新增 correction workflow。
4. 明确结论：
   - `packaging type pilot verification complete`
   - 或列出仍需业务提供样本/确认的字段。
