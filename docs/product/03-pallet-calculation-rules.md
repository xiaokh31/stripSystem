# Pallet Calculation Rules

## Background

The previous pallet estimate used a generic volume plus pallet-height capacity
formula. The business now needs destination-specific and address-specific
calculation rules so generated unloading reports and pallet labels better match
warehouse operations.

These rules affect estimated pallet count only. Manual pallet correction remains
the final override and must stay auditable.

## Rounding Rule

- Pallet counts must be whole numbers.
- Do not use normal round half up / half down behavior.
- Product planning default: use ceiling integer rounding for volume-based rules.
  For example, `3.41 / 1.7 = 2.006` becomes `3`, not `2`.
- If `cartons > 0` and volume-based calculation produces less than one pallet,
  use one pallet.
- If the business intends floor/truncate instead of ceiling, confirm before
  development because floor can under-generate pallet labels.

## Destination Rules

### YYC4 / YYC6 / YEG2

- Match destination code exactly after trimming and uppercasing.
- Use `1.7 CBM` per pallet.
- Calculation: `ceil(totalVolumeCbm / 1.7)`.
- Do not four-round the quotient.

### YVR2 / YVR3 / YVR4

- Match destination code exactly after trimming and uppercasing.
- Use `2.2 CBM` per pallet.
- Calculation: `ceil(totalVolumeCbm / 2.2)`.
- Do not four-round the quotient.

### YEG1

- Match destination code exactly after trimming and uppercasing.
- Use `1.7 CBM` per pallet as the base.
- Add `5` extra pallets after the base pallet count.
- Calculation: `ceil(totalVolumeCbm / 1.7) + 5` when the row/group has goods.
- If there are no cartons and no volume, pallet count remains `0`; do not add
  the extra five pallets to an empty group.

### Private / Commercial Addresses

- Address destinations include private address, commercial address, business
  address, and Chinese variants such as `私人地址` and `商业地址`.
- If the goods are paper cartons, use `1.8 CBM` per pallet.
- Calculation: `ceil(totalVolumeCbm / 1.8)`.
- If the goods are wooden crates, use piece count directly.
- Calculation: `totalCartons` / parsed piece count, where one piece equals one
  pallet.
- Wooden-crate lines must not be divided by volume.
- If package type cannot be detected from the workbook fields, raw JSON, note,
  service name, or other parsed text, create a warning requiring manual
  confirmation. Do not silently mark unknown address cargo as wooden crates.

## Mixed Package Type

Private/commercial address cargo can be mixed. The calculation must not collapse
wooden crates and paper cartons into one destination summary before applying
rules.

Required behavior:
- classify package type at line level when possible;
- calculate each line or homogeneous rule bucket with the proper rule;
- aggregate final pallets only after applying the correct rule per bucket;
- preserve enough metadata to explain which rule created the pallet count.

## Existing Behavior To Preserve

- Original uploaded Excel files are preserved.
- Unknown columns remain in raw JSON.
- Missing destination, cartons, volume, and zero volume with cartons warnings
  remain.
- Manual pallet override remains auditable and controls final pallet count.
- Generated reports and labels use final pallet count.
- QR payloads still contain unique pallet IDs.
- Pallet loaded status is changed only by scan transactions.

## Required Test Matrix

- `YYC4` volume `3.39` -> `2` pallets.
- `YYC4` volume `3.41` -> `3` pallets.
- `YYC6` volume `1.70` -> `1` pallet.
- `YEG2` volume `13.236` -> `8` pallets.
- `YVR2` volume `4.39` -> `2` pallets.
- `YVR3` volume `4.41` -> `3` pallets.
- `YVR4` volume `0.5` with cartons -> `1` pallet.
- `YEG1` volume `3.4` with cartons -> `7` pallets.
- `YEG1` volume `0` with cartons -> warning, minimum base `1`, plus `5`, final `6`.
- Private/commercial paper cartons volume `3.59` -> `2` pallets.
- Private/commercial paper cartons volume `3.61` -> `3` pallets.
- Private/commercial wooden crates count `7` -> `7` pallets.
- Mixed private/commercial paper and wooden-crate lines calculate by separate
  rule buckets before aggregation.
