---
name: pallet-label-generator
description: Use for 150mm x 100mm pallet label PDF layout, QR payloads, and print-size checks.
---

# Pallet Label Generator Skill

## Physical Size

- Label size: 150mm x 100mm.
- QR size target: 25mm x 25mm.
- Main text should be large and readable.
- Long destination text may wrap or shrink, but QR must remain scannable.

## Label Content

Each label must show:
1. Date
2. Container number
3. Destination
4. Pallet number
5. QR code

## QR Payload

Use compact v1 payload:

```text
SSP1|PALLET|YYYY-MM-DD|CONTAINER_NO|DESTINATION|PALLET_NO|PALLET_ID
```

## Rules

- QR payload must include unique pallet ID.
- Do not use display-only text as QR payload.
- Generated PDF must not default to A4.
- Print scaling assumptions must be documented.
- Reprint events must be auditable in later phases.
