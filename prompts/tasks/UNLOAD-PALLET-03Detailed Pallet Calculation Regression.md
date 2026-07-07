执行 UNLOAD-PALLET-03：Detailed Pallet Calculation Regression。

必须读取：
- AGENTS.md
- docs/product/03-pallet-calculation-rules.md
- prompts/tasks/UNLOAD-PALLET-01Detailed Pallet Rule Worker Calculator.md
- prompts/tasks/UNLOAD-PALLET-02Pallet Rule Persistence Report Label Regression.md
- docs/runbooks/local-deployment.md
- .codex/skills/qa-regression/SKILL.md
- .codex/skills/bestar-domain/SKILL.md
- .codex/skills/docker-local-deploy/SKILL.md
- apps/worker-python/tests/
- apps/api/src/imports/
- apps/api/src/reports/
- apps/api/src/labels/
- apps/web/src/app/imports/
- apps/web/src/app/containers/

前置任务：
- UNLOAD-PALLET-01
- UNLOAD-PALLET-02

任务范围：
1. 做新托盘计算规则的全链路回归。
2. 覆盖 worker parser/calculator、API import persistence、report generation、label generation、manual correction、container detail UI。
3. 使用真实 fixture 或专门构造的测试 workbook；不要把 mock 业务数据当真实数据。
4. 不新增业务功能，除非是修复阻塞验收的缺陷。

必须验证：
1. `YYC4`、`YYC6`、`YEG2` 使用 `1.7 CBM`。
2. `YVR2`、`YVR3`、`YVR4` 使用 `2.2 CBM`。
3. `YEG1` 使用 `1.7 CBM + 5`。
4. 私人/商业纸箱使用 `1.8 CBM`。
5. 私人/商业木箱按件数算。
6. 所有 volume-based 规则使用向上取整，不使用四舍五入。
7. 私人/商业地址包装类型 unknown 会 warning。
8. `manualPallets` 仍覆盖计算值。
9. Excel report 和 label PDF 使用 `finalPallets`。
10. Label PDF 仍为 150mm x 100mm，QR payload 仍有唯一 pallet ID。
11. Loading scan、库存、duplicate scan 不受影响。

建议自动化测试：
1. Worker unit test 覆盖 rule matrix。
2. Worker integration test 覆盖 batch CLI 输出。
3. API import service test 覆盖 worker payload 持久化。
4. API report/label service test 覆盖 corrected final pallets。
5. Web smoke / component-level test 覆盖 container detail 中计算值和 warning 可见。
6. Docker full-stack smoke 覆盖上传、解析、生成报告、生成 label。

建议测试命令：
cd apps/worker-python && uv run pytest
pnpm --filter api lint
pnpm --filter api typecheck
pnpm --filter api test
pnpm --filter web lint
pnpm --filter web typecheck
pnpm --filter web test
pnpm --filter web build
docker compose -f infra/docker/compose.local.yml up -d --build
docker compose -f infra/docker/compose.local.yml ps

验收输出：
1. 列出改动文件。
2. 列出 rule matrix 验证结果。
3. 列出 Excel report / label PDF / task report 验证结果。
4. 列出 Docker full-stack smoke 结果。
5. 明确结论：
   - `detailed pallet calculation rules complete`
   - 或列出 blocker / remaining task。
