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

An OCI Always Free Ampere A1 cloud-canonical migration was evaluated and then
archived by product decision on 2026-07-22. It is not an approved current
deployment route and `PUBLIC-DEPLOY-03` must not execute while archived. If
explicitly reactivated later, it remains a migration rather than a replica:
writes must be frozen, PostgreSQL and `storage/` restored and verified together,
and the old local deployment kept read-only or stopped after cutover.

Splitting Web, API, PostgreSQL, Redis and generated files across unrelated free
PaaS products, running local/cloud active-active, copying only the database, or
exposing nginx/PostgreSQL/Redis directly to the Internet are not supported.
Public activation requires HTTPS, an identity gate, hardened revocable browser
sessions, rate limits, verified backup/restore, audit logging and a privacy/data
residency review. Cloudflare Quick Tunnels (`trycloudflare.com`) are for
development only and are not an approved production path.
