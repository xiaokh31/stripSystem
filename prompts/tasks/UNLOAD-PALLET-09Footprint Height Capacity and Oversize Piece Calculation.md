# 执行 UNLOAD-PALLET-09：Footprint Height Capacity and Oversize Piece Calculation

## 优先级与依赖

- P0 核心业务计算任务。
- 前置：`UNLOAD-PALLET-08` policy contract 已完成并通过。
- 后续：`UNLOAD-PALLET-10` 负责真实全链路和生成物关闭门禁。

## 目标公式

```text
capacityCbm = palletLengthM * palletWidthM * destinationHeightLimitM
basePallets = ceil(totalVolumeCbm / capacityCbm)
```

默认 1.0m * 1.2m 时：

- 1.7m group capacity = 2.04 CBM；
- 2.2m group capacity = 2.64 CBM；
- YEG1 normal cargo = `ceil(volume / 2.04) + 4`；
- explicit wooden crate / oversize cargo = one piece per pallet。

## 必须读取与使用

- `AGENTS.md`、`CONTEXT.md`
- `docs/product/03-pallet-calculation-rules.md`
- `UNLOAD-PALLET-08Configurable Pallet Footprint Settings and Policy Contract.md`
- `.codex/skills/bestar-domain/SKILL.md`
- `.codex/skills/unloading-excel-parser/SKILL.md`
- `.codex/skills/nestjs-prisma-api/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- `apps/worker-python/src/worker_python/pallets/rules.py`
- `apps/worker-python/src/worker_python/pallets/calculator.py`
- parser destination/package normalization and Worker CLI/batch
- `apps/api/src/imports/worker-parser.service.ts`
- `apps/api/src/imports/imports.service.ts`
- `apps/api/src/corrections/corrections.service.ts`
- Prisma destination schema/migrations
- worker/API pallet tests, report/label tests

## Destination Classification

1. `LOW_HEIGHT_1_7`: YYC4, YYC6, YEG2.
2. `YEG1_1_7_PLUS_4`: YEG1.
3. `OTHER_DESTINATION_2_2`:
   - YVR2/YVR3/YVR4;
   - UPS;
   - PUROLATOR/PURLATOR/PURO/P/A;
   - GOODCANG/GOOD CANG;
   - private/commercial/business addresses and existing Chinese aliases;
   - any other non-blank destination not in groups 1-2.
4. Blank destination keeps the missing-destination warning/error.
5. Unmatched non-blank destination uses OTHER capacity but carries a stable review warning; it must not return zero.

Do not classify by loose substring rules that turn unrelated text into a fixed warehouse code. Normalize case/spacing and use
tested code/alias boundaries.

## Oversize And Piece-count Rule

Precedence for each homogeneous source line/rule bucket:

1. audited `manualPallets` controls final result;
2. explicit `WOODEN_CRATE` -> piece count;
3. reliable positive piece count and `averagePieceVolumeCbm > capacityCbm` -> `OVERSIZE_PIECE_COUNT`;
4. otherwise use destination volume capacity and CEIL.

Rules:

- `averagePieceVolumeCbm = totalVolumeCbm / pieceCount`.
- Reliable count precedence is audited corrected `actualCartons`/piece count first, then the parser-normalized positive integer
  count from the same homogeneous source line. Follow the repository's canonical field names, but persist the source used.
- Never use a destination-level carton total assembled from mixed rows to decide whether each piece is oversized.
- Zero, negative, fractional, missing, or conflicting counts are unreliable; do not round or invent a piece count.
- Piece-count result is exactly `pieceCount`; YEG1 +4 does not apply to explicit piece-count/oversize mode.
- Do not change `packageType` to wooden crate merely because average volume is high.
- If explicit wooden or oversize cargo has missing/unreliable count, retain volume calculation and emit a stable
  `WOODEN_CRATE_PIECE_COUNT_REQUIRED` or `OVERSIZE_PIECE_COUNT_REQUIRED` warning for review.
- Aggregate volume of many normal cartons must not be treated as one oversized piece.
- Mixed normal cartons, wooden crates, and oversize lines calculate separately before destination aggregation.

## Worker And API Parity

1. Replace old direct divisors 1.7/1.8/2.2 with computed capacity from the UNLOAD-PALLET-08 snapshot.
2. Change YEG1 extra from 5 to 4.
3. Remove the old private/commercial 1.8 CBM special divisor; those destinations now use the 2.2m group capacity.
4. Python Worker receives the exact API-resolved policy snapshot for parse jobs. Do not let Worker silently use different DB,
   environment, or hardcoded settings during API-triggered calculations.
5. Direct Worker CLI remains deterministic with documented 1.0/1.2 defaults when no snapshot is provided.
6. API manual create/correction uses the same effective policy and rule precedence.
7. Add cross-language contract fixtures so Python and TypeScript produce identical rule code, capacity, rounding, calculated
   pallets, warning codes, and snapshot for the same inputs.
8. Use Decimal/Prisma Decimal; avoid binary float boundary errors around 2.04/2.64.

## Persistence And Audit

Persist enough immutable metadata on every calculated destination/rule bucket to reproduce the result:

- policy/rule version and settings revision/hash;
- pallet length/width;
- destination height and group;
- computed capacity CBM;
- package/calculation mode;
- YEG1 extra pallets;
- rounding mode;
- calculated/manual/final pallets;
- warnings.

Add an additive Prisma migration if the current schema cannot preserve this snapshot. Do not rewrite legacy rows. Legacy rows
remain readable and use their persisted final pallet count; new calculations use the new rule version.

## Stable Rule Codes

Use stable values that do not embed editable dimensions, for example:

- `FOOTPRINT_HEIGHT_VOLUME_LOW_1_7`;
- `YEG1_FOOTPRINT_HEIGHT_PLUS_4`;
- `OTHER_DESTINATION_FOOTPRINT_HEIGHT_2_2`;
- `WOODEN_CRATE_PIECE_COUNT`;
- `OVERSIZE_PIECE_COUNT`.

Exact names may follow repository conventions, but old codes must not be reused with changed semantics without a rule-version
distinction.

## Required Matrix

Default dimensions 1.0m * 1.2m:

- YYC4 2.04 -> 1; 2.05 -> 2; 4.08 -> 2; 4.09 -> 3.
- YYC6 2.04 -> 1.
- YEG2 13.236 -> 7.
- YEG1 4.08 -> 6; zero volume with cartons -> warning + 5.
- YVR2 2.64 -> 1; YVR3 2.65 -> 2; YVR4 5.29 -> 3.
- UPS 5.40 -> 3.
- PUROLATOR/PURLATOR/GOODCANG/private/commercial -> OTHER/2.64 capacity.
- Private/commercial standard carton 3.61 -> 2.
- Explicit wooden crates 7 pieces -> 7.
- OTHER two pieces / 5.60 CBM -> 2 via oversize piece count.
- Missing piece count in oversize candidate -> volume result + stable warning.
- Explicit wooden crate with missing/unreliable count -> volume result + stable warning, never zero.
- Mixed standard/wood/oversize buckets aggregate correctly.
- manual override remains final and pallet ID count equals final pallets.
- custom width 1.1 changes future capacities/results with exact decimal behavior.

## i18n 硬门禁

1. Worker/API return stable codes and numeric metadata, never bilingual user-facing messages.
2. New rule names, destination group labels, warning/error descriptions, formula labels and units shown in Web/report/task report
   must map through en/zh catalogs.
3. English/中文页面只显示当前语言；raw code may appear only in an explicitly diagnostic field, never as the primary label.
4. Update catalog parity/status helper/AST gates for all new visible states.

## Docker Tests

```bash
docker compose -f infra/docker/compose.local.yml up -d --build
docker compose -f infra/docker/compose.local.yml exec -T worker-python uv run pytest tests/unit/test_pallet_calculator.py
docker compose -f infra/docker/compose.local.yml exec -T worker-python uv run pytest tests/integration/test_batch_cli.py
docker compose -f infra/docker/compose.local.yml exec -T worker-python uv run pytest
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api prisma migrate status
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api lint
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api typecheck
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api test
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api test:e2e
scripts/healthcheck.sh
git diff --check
```

## 验收标准

1. Python/API use footprint * fixed height capacities and pass the full matrix with exact parity.
2. YEG1 is +4, old 1.8 address divisor is removed, aliases map to OTHER, and blank destination still warns.
3. Oversize/wood uses one piece per pallet without mutating package classification.
4. Policy snapshots make every new result reproducible and legacy records remain unchanged.
5. Reports/labels continue consuming persisted final pallets; inventory/scan behavior is not modified.
6. Migration, Worker/API tests, i18n gates, Docker health and diff checks pass.

## 完成输出

列出 formula/group/rule-code matrix、policy transport、schema snapshot、legacy behavior、warnings、Python/TS parity and
tests. Do not start `UNLOAD-PALLET-10` until this task is complete.
