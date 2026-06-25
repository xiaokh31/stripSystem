# ADR-0001: Phase 0 Batch Processing First

## Decision

We will implement a Python batch-processing prototype before building the full web application.

## Reason

The highest project risk is not UI. The highest risk is whether real customer Excel files can be reliably parsed and converted into unloading reports and pallet labels.

## Consequences

- Phase 0 does not require login.
- Phase 0 does not require PostgreSQL.
- Phase 0 must use real Excel fixtures.
- Phase 0 output must include parsed JSON, Excel report, label PDF, and HTML task report.
