# 执行 UNLOAD-PALLET-10：Pallet Policy Full-Stack Artifact and i18n Regression

## 优先级与依赖

- P0 关闭任务。
- 前置：`UNLOAD-PALLET-08` 和 `UNLOAD-PALLET-09` 全部完成。
- 消费更新后的 `UNLOAD-PALLET-04` 真实/脱敏 fixture 证据；如果业务样本仍未提供，必须保留 pilot limitation，
  不得用合成数据宣称真实样本验证完成。

## 目标

使用真实 Excel 和 Docker full stack 证明新托盘尺寸/限高/超大件规则贯穿 Settings、导入、修正、持久化、
拆柜报告、托盘标签、库存和扫码流程，同时不破坏历史记录和中英文布局。

## 必须读取与使用

- `AGENTS.md`、`CONTEXT.md`
- `docs/product/03-pallet-calculation-rules.md`
- `UNLOAD-PALLET-08Configurable Pallet Footprint Settings and Policy Contract.md`
- `UNLOAD-PALLET-09Footprint Height Capacity and Oversize Piece Calculation.md`
- `UNLOAD-PALLET-04Packaging Type Pilot Verification + Correction.md`
- `.codex/skills/bestar-domain/SKILL.md`
- `.codex/skills/unloading-excel-parser/SKILL.md`
- `.codex/skills/unloading-report-generator/SKILL.md`
- `.codex/skills/pallet-label-generator/SKILL.md`
- `.codex/skills/warehouse-scan-flow/SKILL.md`
- `.codex/skills/nextjs-pwa-ui/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- real fixtures under `samples/unloading-plans/`
- Settings, container detail, correction, report, label, inventory and scan API/Web tests

## Full-stack Scenarios

1. Default settings display 1.0m/1.2m and computed capacities 2.04/2.64.
2. Import a real workbook containing fixed warehouse, courier/address, and ordinary destination data.
3. Verify parsed JSON, pallet plans, persisted destination rows and container detail show the same policy snapshot/result.
4. Exercise YYC4/YYC6/YEG2, YEG1 +4, YVR, UPS/Purolator, Goodcang, private/commercial and unmatched non-blank OTHER rules.
5. Add deterministic test fixtures derived from real workbook structure for explicit wooden, oversize and mixed lines; do not
   present synthetic values as production records.
6. Correct cartons/CBM/note/manual pallets and confirm recalculation/audit uses the current policy without save-regression.
7. Generate/download unloading report and label PDF; pallet counts and unique pallet IDs equal persisted `finalPallets`.
8. Complete unloading, create load job, scan one pallet, repeat duplicate scan, and confirm inventory changes only once.

## Settings Change Safety

1. Record a destination calculated under default settings.
2. Change one dimension through the real Settings API/UI and confirm audit/revision changes.
3. Prove historical destination, generated file, label identity, inventory and scan events do not change automatically.
4. Parse a new import or make an audited correction and confirm only the new calculation uses the new capacity snapshot.
5. Restore the default 1.0/1.2 settings during test teardown through the API, not direct DB mutation.
6. Test failure/teardown must not leave the local shared environment with changed settings.

## Generated Artifact Regression

- Excel report pallet totals equal persisted final pallets.
- Label PDF count equals final pallets; each QR retains a unique pallet ID and 150mm x 100mm page size.
- Task report/formula explanation includes localized group/rule labels and numeric dimensions/capacity.
- Existing `Palletizing Standards` rich-text fix remains intact.
- Generated file records, hashes, actors and storage paths remain auditable.

## Web And i18n Regression

1. Settings and container detail show dimensions, height, capacity, rounding, extra/piece mode and final override using explicit
   translators.
2. English and zh-CN each display one language only; no raw setting/rule keys as primary text.
3. Language switch + refresh, light/dark, 390/768/1366/1920 viewports and long English labels do not overlap.
4. Default carton behavior remains; do not reintroduce a mandatory package selector.
5. Warning/action copy tells the user what to review without exposing implementation text.

## Required Browser E2E

Run real Docker Chromium against nginx and cover:

- settings read/update/RBAC/audit;
- locale switch and refresh;
- import -> parse -> container detail formula;
- correction -> recalculated result;
- report/label generation and download;
- inventory/scan/duplicate scan regression;
- page-level and component-level overflow checks.

Capture Settings and container-detail screenshots in en/zh light/dark at desktop and mobile. Agent must inspect screenshots,
not merely generate them. Use existing profile-gated Docker E2E service and persist reports/artifacts to the workspace.

## Docker Verification

```bash
docker compose -f infra/docker/compose.local.yml up -d --build
docker compose -f infra/docker/compose.local.yml exec -T worker-python uv run pytest
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api prisma migrate status
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api lint
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api typecheck
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api test
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api test:e2e
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web lint
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web typecheck
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web test
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web build
scripts/healthcheck.sh
git diff --check
```

Run focused and existing dashboard/settings/container/locale Playwright through the Docker E2E service. Record exact command,
test counts, screenshots, trace/console status, and final restored settings.

## 验收标准

1. All formulas and aliases from the product document pass in Worker, API and browser flows.
2. Settings update affects only future/recalculated records and is safely restored after E2E.
3. Historical business/audit/scan data is unchanged.
4. Reports, labels, task reports, inventory and duplicate scan use the correct persisted final count.
5. en/zh, light/dark, desktop/mobile screenshots and overflow assertions pass with no mixed language or hydration errors.
6. Full Docker Worker/API/Web/E2E suites, migrations, healthcheck and diff checks pass.
7. No production fixture/template or real storage history is overwritten.

## 不得关闭任务的情况

- Only unit tests were run.
- Settings and Worker use different policy values.
- E2E changed settings and did not restore them.
- Reports/labels recalculate from latest settings instead of persisted final pallets.
- Oversize/mixed cargo lacks a real-structure fixture.
- i18n, screenshot, overflow, scan or duplicate-scan checks are missing/failing.

## 完成输出

List changed files, migrations, effective policy, formula matrix, real fixtures, generated artifacts, Docker commands/results,
E2E screenshots, i18n results, historical-data proof, restored settings and known limitations. Update index/report only after all
gates pass.
