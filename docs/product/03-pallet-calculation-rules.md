# Pallet Calculation Rules

## Background

Estimated pallet count must use the physical pallet footprint as well as the destination height limit. The previous
rules treated `1.7`, `1.8`, or `2.2` as direct CBM divisors and therefore omitted the footprint area.

These rules affect calculated pallet estimates. An audited `manualPallets` value remains the final override. Generated
reports, labels, inventory synchronization, and loading workflows continue to use the persisted `finalPallets` value.

## Configurable Pallet Footprint

- Default pallet length: `1.0 m`.
- Default pallet width: `1.2 m`.
- Office Settings allows an authorized user to update length and width independently.
- Length and width must be positive decimal values and are stored in meters.
- Destination height limits are fixed business rules, not editable dimensions:
  - low-height group: `1.7 m`;
  - other-destination group: `2.2 m`.
- The effective volume capacity is always:

```text
palletCapacityCbm = palletLengthM * palletWidthM * destinationHeightLimitM
```

With default settings:

- `1.0 * 1.2 * 1.7 = 2.04 CBM`;
- `1.0 * 1.2 * 2.2 = 2.64 CBM`.

The Settings page must show the configured length/width and the computed 1.7m/2.2m capacities. API responses use stable
keys/codes and numeric values; labels and explanatory text are localized by the Web catalog.

## Rounding Rule

- Pallet counts are whole numbers.
- Volume-based rules use ceiling integer rounding, never normal half-up/half-down rounding or truncation.
- Calculation: `ceil(totalVolumeCbm / palletCapacityCbm)`.
- If `cartons > 0` and a volume rule produces less than one pallet, use one pallet.
- If both cartons and volume are zero, the result is zero and no destination extra is added.

## Destination Groups

### YYC4 / YYC6 / YEG2

- Match destination codes after trimming and uppercasing.
- Fixed height limit: `1.7 m`.
- Default capacity: `2.04 CBM`.
- Calculation: `ceil(totalVolumeCbm / (length * width * 1.7))`.
- `YYC6` is retained in this group for compatibility because the latest requirement did not explicitly reassign it.

### YEG1

- Fixed height limit: `1.7 m`.
- Default capacity: `2.04 CBM`.
- For normal volume cargo, add `4` extra pallets after the base result.
- Calculation: `ceil(totalVolumeCbm / (length * width * 1.7)) + 4` when the group has goods.
- This supersedes the previous `+5` rule.
- If there are cartons but zero volume, retain the zero-volume warning, use the minimum base pallet of one, then add four.

### Other Destinations

The following all use the `OTHER_DESTINATION` group and a fixed `2.2 m` height limit:

- `YVR2`, `YVR3`, `YVR4`;
- courier aliases including `UPS`, `PUROLATOR`, `PURLATOR`, `PURO`, and `P/A`;
- `GOODCANG` / `GOOD CANG` aliases;
- private, commercial, and business addresses, including Chinese variants;
- other non-blank destinations that do not match the low-height or YEG1 groups.

Default capacity: `2.64 CBM`.

Calculation:

```text
ceil(totalVolumeCbm / (length * width * 2.2))
```

A recognized courier/address/Goodcang destination does not require package confirmation. A non-blank unmatched destination
uses the same other-destination calculation but carries a stable review warning. A missing destination remains a missing-data
warning/error and must not silently become a valid destination.

## Wooden Crates And Oversize Pieces

- Explicit wooden-crate cargo uses piece count: one piece equals one pallet.
- The default imported/manual package type remains carton when no explicit wooden marker exists.
- Volume alone must not rewrite `packageType` to `WOODEN_CRATE`; calculation method and package classification remain separate.
- For a homogeneous line/rule bucket with a reliable positive piece count, calculate:

```text
averagePieceVolumeCbm = totalVolumeCbm / pieceCount
```

- A reliable piece count is the audited corrected count when present; otherwise it is the parser-normalized positive integer
  count from the same homogeneous source line. A destination-level total assembled from mixed source lines is not reliable
  for oversize detection.
- Zero, negative, fractional, missing, or conflicting counts are not reliable and must not be rounded into an invented count.

- If `averagePieceVolumeCbm > palletCapacityCbm`, classify the calculation method as `OVERSIZE_PIECE_COUNT` and use
  `pieceCount` pallets.
- Explicit `WOODEN_CRATE` and `OVERSIZE_PIECE_COUNT` take precedence over volume division. The result is exactly one pallet
  per piece; YEG1's extra four does not apply because the latest rule says one piece equals one pallet.
- If an explicit wooden crate or suspected oversize line lacks a reliable piece count, retain the volume result and emit a
  stable piece-count-required warning for manual review; never return zero or invent a piece count.
- Manual pallet correction remains available and auditable when physical handling differs from the estimate.

## Mixed Cargo

Do not aggregate mixed standard cartons, explicit wooden crates, and oversize pieces before choosing the calculation rule.

Required order:

1. Normalize each source line's destination and explicit package markers.
2. Determine its destination height group and capacity from the effective settings snapshot.
3. Apply explicit wooden-crate or oversize piece calculation where applicable.
4. Apply volume calculation to homogeneous standard-carton buckets.
5. Aggregate calculated pallet counts only after each bucket has been calculated.
6. Preserve rule metadata for every bucket and destination summary.

## Settings And Historical Data

- Every calculation stores an immutable policy snapshot containing length, width, height, capacity, destination group,
  rounding mode, extra pallets, rule version, and settings revision/hash.
- Updating Settings affects future parse/reparse and future correction-triggered recalculation only.
- A Settings update must not silently rewrite historical destination rows, generated reports/labels, pallet identities,
  inventory, or scan history.
- Reports and labels use persisted `finalPallets`; they do not recalculate from the latest settings during download.
- A manual pallet override continues to take precedence after a settings change.

## Localization Contract

- Worker and API return stable codes, enums, numeric policy values, and raw source data rather than localized sentences.
- Settings, destination groups, formulas, units, rule names, warnings, errors, calculation modes, and audit summaries must have
  complete `en` and `zh-CN` catalog coverage.
- The Web UI displays only the active locale. It must not concatenate English and Chinese or expose raw codes as primary text.
- Locale switching and refresh must not flash the other language; long English and Chinese labels must not clip or shift the
  Settings or container-detail layout.

## Existing Behavior To Preserve

- Original uploaded Excel files are preserved.
- Unknown columns remain in raw JSON.
- Missing destination/cartons/volume and zero-volume-with-cartons warnings remain.
- Manual correction is auditable.
- Generated files remain recorded.
- QR payloads retain unique pallet IDs.
- Pallet loaded status changes only through scan transactions.
- Duplicate scans do not decrement inventory twice.
- Default package type remains carton and the normal correction form does not show a mandatory package selector.

## Required Test Matrix

Using default `1.0 m * 1.2 m` dimensions:

- `YYC4` volume `2.04` -> `1` pallet.
- `YYC4` volume `2.05` -> `2` pallets.
- `YYC4` volume `4.08` -> `2` pallets.
- `YYC4` volume `4.09` -> `3` pallets.
- `YYC6` volume `2.04` -> `1` pallet under the compatibility rule.
- `YEG2` volume `13.236` -> `7` pallets.
- `YVR2` volume `2.64` -> `1` pallet.
- `YVR3` volume `2.65` -> `2` pallets.
- `YVR4` volume `5.29` -> `3` pallets.
- `YEG1` volume `4.08` with goods -> `6` pallets (`2 + 4`).
- `YEG1` zero volume with cartons -> warning and `5` pallets (`1 + 4`).
- `UPS` volume `5.40` -> `3` pallets using 2.64 CBM capacity.
- `PUROLATOR`, `PURLATOR`, `GOODCANG`, private address, and commercial address use `OTHER_DESTINATION` / 2.2m.
- Private/commercial standard cartons volume `3.61` -> `2` pallets.
- Explicit wooden crates count `7` -> `7` pallets.
- Other-destination two-piece cargo volume `5.60` -> `2` pallets because average piece volume `2.80 > 2.64`.
- A standard multi-carton bucket with large aggregate volume but average piece volume below capacity remains volume-based.
- Mixed standard/wooden/oversize lines calculate separately before aggregation.
- Changing pallet width to `1.1 m` changes future capacity and results while historical rows retain their stored snapshot.
- Invalid zero/negative/non-numeric dimensions are rejected with stable codes.
