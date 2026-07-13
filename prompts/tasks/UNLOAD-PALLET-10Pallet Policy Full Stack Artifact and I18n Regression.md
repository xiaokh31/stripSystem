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

## 2026-07-13 执行结果

### 状态

- 仓库实现和当前环境自动化验收已完成；无 schema 变更、无新增 migration。
- 保留外部 pilot limitation：现有真实样本没有业务确认的木箱、可靠超大件、混合货型和商业地址组合，不能把
  deterministic derived fixture 或 E2E 边界记录宣称为真实生产样本。
- 仍需目标打印机完成 150mm x 100mm、25mm x 25mm QR 实体测量和扫码签字。

### 有效策略与公式矩阵

- 默认设置已恢复并由数据库确认：`palletLengthM=1.0`、`palletWidthM=1.2`、
  `qrTargetSizeMm=25`；默认容量为 `1.0 * 1.2 * 1.7 = 2.04 CBM` 和
  `1.0 * 1.2 * 2.2 = 2.64 CBM`。
- Settings E2E 将宽度改为 `1.1m` 后，当前 policy 容量变为 `1.87/2.42 CBM`，revision 和
  `updatedById` 改变；teardown 通过 Settings API 恢复默认值。
- YYC4/YYC6/YEG2 使用 1.7m 体积容量；YEG1 使用同一容量并仅对普通体积桶 `+4`；YVR、UPS、
  Purolator/Purlator、Goodcang、私人/商业地址和未匹配非空 OTHER 使用 2.2m 容量并对需确认分类保留告警。
- 明确木箱与可靠超大件按件数一件一托；混合行先按普通/木箱/超大件分桶再相加；manual override 只改变
  `finalPallets`，报告、标签和库存消费持久化 final 结果。

### Fixture、历史安全与生成物

- 浏览器通过 nginx 导入真实 `samples/unloading-plans/CAAU8011090 UNLOADING PLAN.xlsx` 的结构派生副本；
  保留 fixed warehouse、Purolator、私人地址、普通目的仓和 raw JSON 证据。Worker integration 从同一真实结构
  派生 deterministic 木箱、超大件和混合行，E2E API 边界记录明确标注为非生产 fixture 证据。
- 默认策略历史柜 `TSPU9528246` 生成 41 个托盘并扫码 1 次；修改 Settings 后，其 destination snapshots、
  generated file rows/hashes、pallet IDs/status、inventory 及 loaded-pallet event 逐项深比较不变。
- 新策略柜 `TSPU9528247` 在修正和边界记录后持久化 61 个 final pallets，生成并下载：
  - `unloading-report.xlsx`，SHA-256
    `45fd7fe6f6d9e8dcfcd403896181ecc9cfc3dcba1bf54360d0a712f5a9863697`，3 个 worksheet，
    pallet total 为 61，`Palletizing Standards` 保留多个 rich-text runs；
  - `pallet-labels.pdf`，SHA-256
    `79091870ba3c6f5031aea3bfc8909a23aa91c4cc52cebd6a202a59b744552765`，61 页，
    每页 150mm x 100mm，61 个唯一 pallet ID/QR payload，QR CSS/校准目标为 25mm x 25mm。
- 柜子完成卸柜后第一次扫码使 remaining 仅减 1，重复扫码返回 duplicate 且 inventory、loaded event 数量不变。

### Docker 与浏览器证据

- `docker compose -f infra/docker/compose.local.yml up -d --build`：通过，API/Web/Worker/nginx/PostgreSQL/Redis
  全部 healthy。
- Worker：124/124；API lint/typecheck、unit 220/220、E2E 15 suites/92 tests、build：通过；Web
  lint/typecheck、unit 189/189、production build：通过。
- Prisma：22 migrations，database up to date；`scripts/healthcheck.sh` 与 `git diff --check`：通过。
- focused Docker Chromium：1/1，最终四档 viewport 版本 2.1 分钟通过；Settings、导入、解析、修正、报告、
  标签、inventory、scan、duplicate、历史安全、teardown、console/page-error assertions 全部通过。
- 既有 dashboard/settings/core/locale/pilot Chromium 覆盖 18 项；production build 在运行中替换 `.next` 曾造成
  stale chunk 500，重建 Web/nginx 后受影响 5/5 隔离复跑通过，其余 13 项通过。
- `test-results/unload-pallet-10-*.png` 共 32 张：Settings/柜子详情 × en/zh-CN × light/dark ×
  390/768/1366/1920；已逐张检查，无混合语言、raw rule key、强制 package selector、页面横向溢出、组件裁切或
  hydration error。

### 外部验收

1. 业务提供真实/脱敏且明确标注木箱、可靠超大件、混合货型和商业地址的 workbook 后，补跑
   `UNLOAD-PALLET-04` pilot sign-off，不得用当前 synthetic boundary 代替。
2. 在目标打印机关闭自动缩放，以 100% 打印校准页和标签，测量 150mm x 100mm 外框与 25mm x 25mm QR，
   再用现场 PDA/扫码枪记录可扫性签字。
