执行 UNLOAD-PALLET-02：Pallet Rule Persistence, Report, and Label Regression。

必须读取：
- AGENTS.md
- docs/product/03-pallet-calculation-rules.md
- prompts/tasks/UNLOAD-PALLET-01Detailed Pallet Rule Worker Calculator.md
- .codex/skills/bestar-domain/SKILL.md
- .codex/skills/nestjs-prisma-api/SKILL.md
- .codex/skills/unloading-report-generator/SKILL.md
- .codex/skills/pallet-label-generator/SKILL.md
- apps/api/prisma/schema.prisma
- apps/api/src/imports/
- apps/api/src/reports/
- apps/api/src/labels/
- apps/api/src/corrections/
- apps/web/src/app/containers/[id]/
- apps/web/src/components/containers/
- apps/worker-python/src/worker_python/reports/excel_report_writer.py
- apps/worker-python/src/worker_python/task_reports/html_task_report.py

前置任务：
- UNLOAD-PALLET-01

任务范围：
1. 确认 API 导入、数据库持久化、Excel 报告、label PDF 和 container detail 都使用新的 `finalPallets`。
2. 保存或展示足够的计算依据，让办公室人员知道托数来自哪条规则。
3. 不改变 scan transaction 规则。
4. 不改变 PDF label 150mm x 100mm 和 QR 25mm 目标尺寸。

业务要求：
1. 导入 Excel 后，API 持久化的 `calculatedPallets` / `finalPallets` 必须来自新规则。
2. 手动 `manualPallets` 修正仍优先，且 correction audit 仍记录。
3. 如果新增 rule metadata 字段，需要 Prisma migration。
4. 建议持久化或至少在 generated parse artifact / task report 中保留：
   - `palletRuleCode`
   - `packageType`
   - `calculationBasisCbm`
   - `roundingMode`
   - warning code / message
5. Excel unloading report 写入的托数必须使用 `finalPallets`。
6. Label PDF 生成的 pallet 记录数量必须等于 `finalPallets`。
7. Container detail / corrections 页面应能看到：
   - calculated pallets
   - manual pallets
   - final pallets
   - destination type / package type / rule code 或可读计算说明
8. 对包装类型无法确认的私人/商业地址，页面和 task report 必须显示 warning，不得静默通过。

建议实现文件：
- apps/api/prisma/schema.prisma
- apps/api/prisma/migrations/
- apps/api/src/imports/imports.service.ts
- apps/api/src/imports/worker-parser.service.ts
- apps/api/src/reports/reports.service.ts
- apps/api/src/labels/labels.service.ts
- apps/api/src/corrections/corrections.service.ts
- apps/worker-python/src/worker_python/reports/excel_report_writer.py
- apps/worker-python/src/worker_python/task_reports/html_task_report.py
- apps/web/src/components/containers/container-destination-corrections.tsx
- apps/web/src/app/containers/[id]/page.tsx
- apps/web/src/lib/api-client.ts

验收标准：
1. API import detail 中的 destination summaries 使用新规则计算托数。
2. Generated Excel report 的托数列与 `finalPallets` 一致。
3. Label generation 创建的 pallet count 等于 `finalPallets`。
4. 手动修正托数后，再生成 report/labels 使用手动 final pallets。
5. correction audit 仍记录 `manualPallets` 和 `finalPallets` 变化。
6. 新 rule metadata 如果入库，migration 存在且测试覆盖。
7. 如果 rule metadata 不入库，必须说明原因，并确认 generated parse JSON / task report 可以追溯规则。
8. 私人/商业地址包装类型 unknown 的 warning 在 API / UI / task report 至少一个人工复核入口可见。
9. 不影响 loading scan、库存扣减、已装车状态。

建议测试命令：
pnpm --filter api lint
pnpm --filter api typecheck
pnpm --filter api test
pnpm --filter web lint
pnpm --filter web typecheck
pnpm --filter web test
pnpm --filter web build
cd apps/worker-python && uv run pytest

手工验证步骤：
1. 上传包含 `YYC4` / `YEG2` / `YVR2` / `YEG1` / 私人或商业地址的真实 unloading plan。
2. 打开 import detail，确认 calculated/final pallets 按新规则。
3. 生成 Excel report，确认报告托数一致。
4. 生成 Label PDF，确认 pallet 记录数和 PDF label 页数一致。
5. 对一个目的仓输入 manual pallets，确认 report/label 改用 manual final pallets。

完成输出：
1. 列出改动文件。
2. 列出是否新增 migration。
3. 列出测试命令和结果。
4. 明确说明 report / label / container detail 使用的是新规则 final pallets。
