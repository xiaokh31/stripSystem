---
name: unloading-excel-parser
description: Use for Excel parser detection, field mapping, row normalization, warnings, errors, and parsed JSON output.
---

# Unloading Excel Parser Skill

## Supported Formats

### Standard Chinese Unloading Plan

Expected headers may include:
- 运单号
- 客户单号
- 扩展单号
- 转单号
- 服务名称
- 仓库代码
- PO Number
- 收件人国家
- 件数
- 实际重量(KG)
- 材积重
- 体积(m³)
- 内部备注

### Bestar Receiving Report

Expected header area:
- CONTAINER #
- PO#
- CUSTOMER
- CLEAR ORDER #

Expected detail area:
- ITEM#
- DESCRIPTION
- TOTAL # OF CARTONS
- TOTAL SKID COUNT

## Output Contract

Every parser must output:

```json
{
  "containerNo": "string | null",
  "formatType": "UNLOADING_PLAN_CN | BESTAR_RECEIVING | UNKNOWN",
  "confidence": 0.0,
  "lines": [],
  "destinationSummaries": [],
  "warnings": [],
  "errors": [],
  "rawMetadata": {}
}
```

## Rules

- If container number is not found, create error.
- If destination is missing, create warning.
- If cartons is missing or zero, create warning.
- If volume is zero but cartons > 0, create warning.
- Never drop unknown columns.
- Preserve unknown columns in raw_json.
- Prefer extracting container number from internal fields.
- If internal container number is missing, extract from filename.
- Do not hardcode a single row number for headers; detect headers.