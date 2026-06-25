---
name: bestarcca-domain
description: Use for unloading, pallet, label, loading scan, inventory, correction, and audit business rules.
---

# BestarCCA Warehouse Domain Skill

## Use When

Use this skill when working on:
- container import
- unloading plan parsing
- pallet calculation
- report generation
- label generation
- QR payloads
- loading scans
- inventory statistics
- correction feedback
- audit events

## Core Rules

- Preserve original uploaded files.
- Detect duplicate imports by SHA-256.
- Store parser_version for parser output.
- Preserve unknown columns in raw_json.
- Manual correction overrides calculated values but must be audited.
- Every generated file must be recorded.
- Every pallet status change must create an event.
- Duplicate scans must not decrement inventory twice.
- Invalid scans must be persisted as exceptions.

## Forbidden

- Do not use mock data for core business logic.
- Do not silently ignore parse errors.
- Do not update historical scan events.
- Do not generate labels without a unique pallet ID.
- Do not calculate remaining inventory from frontend state.
