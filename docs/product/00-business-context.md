# Business Context

The first milestone is not a full ERP.

The system must reduce manual Excel work and loading scan errors in overseas warehouse unloading workflows.

Phase 0 focuses on:
1. Read real xlsx unloading files.
2. Detect file format.
3. Extract container number, destination, cartons, volume.
4. Aggregate by destination.
5. Calculate pallet count.
6. Generate unloading report Excel.
7. Generate 150mm x 100mm pallet label PDF.
8. Generate HTML task report with warnings and corrections.

Detailed pallet calculation rules are maintained in
`docs/product/03-pallet-calculation-rules.md`.

## Remote Office Access

Authorized office users must be able to use the Web application when they are
outside the company network. Public access must not depend on a stable company
public IP or host LAN IP. The system must still have exactly one canonical
writable PostgreSQL database and matching durable `storage/` tree; local and
cloud deployments must never accept concurrent business writes.

The approved first pilot keeps the local Docker stack canonical and publishes
nginx through a protected Cloudflare named tunnel. If off-site availability
must remain independent of company power/Internet, the complete canonical stack
may instead be migrated to one cloud VM under the cutover rules in
`docs/adr/0005-single-writer-public-access-and-cloud-hosting.md`. Public access
requires HTTPS, external identity/MFA, application RBAC, revocable sessions,
rate limits, audit, backup/restore and privacy review. All new user-visible
deployment, authentication and failure states remain strictly localized through
the typed `en` and `zh-CN` catalogs.
