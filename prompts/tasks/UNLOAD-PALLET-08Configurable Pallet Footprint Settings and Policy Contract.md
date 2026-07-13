# 执行 UNLOAD-PALLET-08：Configurable Pallet Footprint Settings and Policy Contract

## 优先级与依赖

- P0 新业务规则基础任务。
- 前置：读取当前 `UNLOAD-PALLET-01` 至 `07` 的实现和回归。
- 后续：`UNLOAD-PALLET-09` 必须消费本任务的 policy contract，不得另建第二套设置来源。

## 目标

在办公室 Settings 中增加托盘长、宽设置，默认 `1.0m * 1.2m`。目的仓限高继续是固定业务规则：

- YYC4 / YYC6 / YEG2：1.7m；
- YEG1：1.7m，正常体积规则额外加 4 托；
- YVR2 / YVR3 / YVR4 / courier / Goodcang / 私人地址 / 商业地址 / 其他目的仓：2.2m。

Settings/API 必须提供一个唯一、可审计、可传给 Worker 的 pallet policy snapshot，避免 Python 和 TypeScript
分别读取不同配置。

## 必须读取与使用

- `AGENTS.md`、`CONTEXT.md`
- `docs/product/03-pallet-calculation-rules.md`
- `.codex/skills/bestar-domain/SKILL.md`
- `.codex/skills/nestjs-prisma-api/SKILL.md`
- `.codex/skills/nextjs-pwa-ui/SKILL.md`
- `.codex/skills/frontend-design/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- `apps/api/prisma/schema.prisma`
- `apps/api/src/settings/`
- `apps/api/src/imports/worker-parser.service.ts`
- `apps/web/src/app/settings/page.tsx`
- `apps/web/src/components/settings/operational-settings-form.tsx`
- `apps/web/src/lib/i18n/operational-settings-labels.ts`
- `apps/web/src/lib/i18n/locales/en.ts`
- `apps/web/src/lib/i18n/locales/zh.ts`
- settings API/Web tests and route permissions

## Settings Contract

### Editable fields

- `palletLengthM`: default `1.0` meters.
- `palletWidthM`: default `1.2` meters.

Rules:

1. Use decimal values, not binary floating-point strings for capacity calculation.
2. Reject blank, non-numeric, zero, negative, NaN, Infinity, and values outside a documented physical range.
3. Normalize persisted precision without silently changing a valid value.
4. Only `settings.update` users may change the values; reads follow existing settings permissions.
5. Existing `OperationalSetting` audit actor/time behavior remains authoritative.

### Fixed policy metadata

Expose stable, non-editable metadata for:

- low-height limit `1.7m`;
- other-destination height limit `2.2m`;
- YEG1 extra pallets `4`;
- low-height destination codes;
- recognized other-destination aliases;
- policy version.

The API must expose stable codes/enums/numbers, not localized labels. The Settings page maps those codes through the locale
catalog and displays the computed capacities:

```text
lowHeightCapacityCbm = length * width * 1.7
otherDestinationCapacityCbm = length * width * 2.2
```

Do not calculate an authoritative policy only in React. The backend returns the effective values and policy revision/hash.

## API Design

1. Extend the existing operational settings contract or add a focused authenticated pallet-policy read endpoint.
2. Implement one injectable policy resolver used by imports, corrections, and future recalculation paths.
3. The resolved snapshot must include at least:
   - `policyVersion`;
   - `settingsRevision` or deterministic hash;
   - `palletLengthM`;
   - `palletWidthM`;
   - fixed heights;
   - computed capacities;
   - YEG1 extra count;
   - destination group codes and alias version.
4. Settings update returns changed keys and audit actor using the existing contract.
5. Do not expose database ids, Prisma implementation details, or localized sentences as policy data.
6. Settings changes do not trigger bulk recalculation or mutate existing destination/pallet records.

## Settings UI

1. Add a compact `Pallet calculation` section to the existing Settings workflow.
2. Use labeled numeric inputs with visible meter units for length and width.
3. Show read-only capacity results for 1.7m and 2.2m groups, plus a concise fixed-rule summary.
4. Explain `Other destinations` using localized operational language; do not expose regexes or source code terms.
5. Preserve existing save, permission-denied, loading, success, error, dirty-state, light/dark, and responsive behavior.
6. Long English and Chinese text must wrap without shifting controls or causing horizontal overflow.

## i18n 硬门禁

1. New category, field labels, descriptions, units, fixed-rule summaries, validation messages, title/tooltip/aria text, and
   success/error copy must exist in both `en` and `zh-CN` catalogs.
2. Update `operational-settings-labels.ts` mappings for every new field/code; unknown settings must retain localized fallback.
3. English/中文只显示当前 locale，不显示双语，不显示 raw setting key、policy code 或 API message。
4. API returns stable error codes such as `PALLET_DIMENSION_INVALID`; Web maps codes to localized actionable messages.
5. Catalog parity, no-flash refresh, and existing i18n AST gates must pass.

## Tests

API tests:

- defaults are exactly 1.0/1.2;
- computed capacities are 2.04/2.64;
- valid update persists with actor audit;
- invalid values return stable codes and do not partially update;
- fixed height/YEG1 metadata cannot be edited;
- policy revision/hash changes when dimensions change;
- reads and updates enforce RBAC.

Web tests:

- fields and units render in en/zh;
- ADMIN/settings editor can save; read-only role cannot edit;
- derived capacities come from API effective policy;
- locale/theme/refresh preserve values without mixed-language flash;
- 390/768/1366/1920 layouts do not clip field labels or units.

## Docker Commands

```bash
docker compose -f infra/docker/compose.local.yml up -d --build
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

## 验收标准

1. Settings 可持久化 1.0m/1.2m 长宽并显示后端计算的 2.04/2.64 CBM 容量。
2. 固定限高和 YEG1 +4 只读展示，不能通过通用 settings payload 篡改。
3. Policy snapshot 有稳定版本/revision，可供 Worker/API calculation 使用。
4. Settings 更新不自动改变任何历史托盘、报告、标签、库存或扫码记录。
5. API/Web/RBAC/audit/i18n/响应式测试全部通过。
6. 不在宿主运行开发命令；Docker full-stack 和 `git diff --check` 通过。

## 完成输出

列出设置 keys、policy response、默认值、验证边界、RBAC/audit、i18n keys、测试结果和已知限制。完成后更新
任务索引与完成度报告，但不要提前执行 `UNLOAD-PALLET-09`。
