# WEB-DASHBOARD-09 E2E fixture cleanup verification

Date: 2026-07-24 MDT

The cleanup used `scripts/cleanup-web-dashboard-09-fixture.sh`. It required the
exact pay-container id plus the expected `PC-TRAILER-TR-E2E-*`, `TR-E2E-*`,
`Bestar E2E`, `TEMP-E2E-*`, completion timestamp, note, settlement-line
ownership, and storage-root markers. A provenance mismatch or a worker or
settlement shared with a non-target record stopped the cleanup.

Dry-run counts:

| Record type | Count |
| --- | ---: |
| Pay container | 1 |
| Source containers | 2 |
| Destinations / pallets | 2 / 2 |
| Temporary unloaders / assignments | 2 / 2 |
| Settlements / worker summaries / lines | 2 / 4 / 4 |
| Correction feedback | 13 |
| Wage generated-file metadata / storage artifacts | 4 / 4 |

The four storage paths were verified beneath the exact
`storage/unloading_wage_settlements/2099-06/<target-settlement>/` roots before
deletion. The database cleanup ran in one PostgreSQL transaction in
foreign-key-safe order. The two synthetic actor accounts were not deleted:
read-only provenance checks showed they are shared by older fixtures, so
deleting them would have exceeded this cleanup's exact target.

Post-cleanup verification:

- exact target pay container, two source containers, two temporary unloaders,
  and two settlements: `0`
- pay containers with `completed_at >= 2030-01-01`: `0`
- target wage generated-file metadata and the four exact storage artifacts:
  `0`
- non-target pay-container count and ordered id/status/completion-time
  fingerprint: unchanged

The utility is idempotent: a later dry-run reports zero target records while
still refusing an id collision with different provenance. No credentials,
customer rows, or personal data are included in this report.
