---
status: accepted
date: 2026-07-22
---

# Keep one canonical writer for public access and cloud hosting

The Bestar system stores one business transaction across PostgreSQL and durable
files under `storage/`. Inventory, scans, corrections, generated reports and
audit history must therefore use exactly one canonical writable deployment.
The supported first public-access route is a Cloudflare named tunnel to the
existing local Docker deployment. This removes the dependency on a stable
public or LAN IP while preserving local warehouse access during an Internet
outage; remote access still stops if the warehouse host, power or Internet is
down.

If off-site availability must not depend on the warehouse network, the whole
canonical stack may instead be cut over to one OCI Always Free Ampere A1 VM in
a Canadian home region. This is a migration, not a replica: writes are frozen,
PostgreSQL and `storage/` are restored and verified together, and the old local
deployment remains read-only or stopped after cutover. OCI's free capacity,
idle-reclamation policy and lack of a production SLA are accepted pilot risks;
a paid VM is the fallback when those risks are unacceptable.

Splitting Web, API, PostgreSQL, Redis and generated files across unrelated free
PaaS products, running local/cloud active-active, copying only the database, or
exposing nginx/PostgreSQL/Redis directly to the Internet are not supported.
Public activation requires HTTPS, an identity gate, hardened revocable browser
sessions, rate limits, verified backup/restore, audit logging and a privacy/data
residency review. Cloudflare Quick Tunnels (`trycloudflare.com`) are for
development only and are not an approved production path.
