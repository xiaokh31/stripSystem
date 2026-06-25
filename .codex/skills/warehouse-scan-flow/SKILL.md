---
name: warehouse-scan-flow
description: Use for loading scan APIs, pallet status transitions, duplicate scan prevention, and mobile sync.
---

# Warehouse Scan Flow Skill

## Pallet Statuses

- planned
- label_printed
- unloaded
- in_stock
- loaded
- void
- exception

## Scan Transaction

A valid scan must:

1. Lock pallet row.
2. Validate pallet exists.
3. Validate pallet is not void.
4. Validate pallet is not already loaded.
5. Validate load job is open.
6. Insert pallet event.
7. Update pallet status to loaded.
8. Return updated load job progress.

## Duplicate Scan Rules

- Same load job + same pallet: return duplicate result; do not create another loaded event.
- Different load job + already loaded pallet: block unless supervisor override.
- Unknown QR payload: persist exception.
- Old QR version: persist exception.

## Mobile Input

Support both:
- Camera QR scan.
- Focused input field + scanner gun keyboard input + Enter submit.
