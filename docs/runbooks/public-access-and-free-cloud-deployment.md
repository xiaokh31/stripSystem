# Public Access and Free Cloud Deployment

## Purpose

This guide answers whether the Bestar Warehouse Unloading System can be used
from the public Internet without depending on a stable company IP address. It
records the approved current route, archived alternatives, free-tier limits,
security gates, cutover rules and rollback path.

Platform limits in this document were checked against official provider pages
on **2026-07-22**. Free plans can change without notice. Re-check the linked
sources immediately before provisioning or migration.

## Short Answer

Yes, with important limits:

1. **Recommended first pilot: Cloudflare named tunnel to the existing local
   Docker host.** The tunnel uses outbound connections, so changing company
   public/LAN IP addresses do not change the public hostname and no inbound
   router port is required. The application and data remain at the warehouse.
   Remote access is unavailable when the warehouse host, power or Internet is
   unavailable.
2. **Archived alternative: OCI Always Free Ampere A1.** Product withdrew this
   cloud-canonical route on 2026-07-22. `PUBLIC-DEPLOY-03` must not be executed
   unless it is explicitly reactivated together with the Task index and
   completion report. The historical capacity/cutover notes below remain only
   for a future approved reactivation review.
3. There is no supported zero-cost, highly available production deployment for
   this complete stack. A small paid Canadian VPS is the operational fallback.
   A domain name is also normally a separate paid/existing asset.

Do not activate both routes as writable production systems. See
[ADR 0005](../adr/0005-single-writer-public-access-and-cloud-hosting.md).

## Why Ordinary Free Web Hosting Does Not Fit

This repository is not only a Next.js site. The running system includes:

- Next.js Web and NestJS API containers;
- PostgreSQL as the authoritative business database;
- Redis/BullMQ for queued work;
- Python/openpyxl/pandas/WeasyPrint/qrcode and office-rendering dependencies for
  Excel, PDF, QR and task-report generation;
- durable original uploads and generated files under `storage/`;
- nginx request routing with uploads up to 100 MB.

Local observations on 2026-07-22 were approximately 22 MB of PostgreSQL data,
12 MB under `storage/`, and 1.35 GB of Docker images. Those measurements show
that the current pilot is small; they are not future capacity guarantees.

| Option | Free-tier fit | Decision | Main reason |
| --- | --- | --- | --- |
| Cloudflare named tunnel | Good for public ingress only | Recommended first pilot | Keeps the existing full stack intact and does not depend on a stable IP |
| OCI Always Free A1 VM | Plausible for the whole pilot stack | Archived / do not execute | Product withdrew this route; historical 2 OCPU/12 GB and 200 GB analysis is not current deployment approval |
| Render free services | Poor | Reject | Services sleep, local files are ephemeral, no free persistent disk, and free PostgreSQL expires after 30 days |
| Koyeb free instance | Poor | Reject | 0.1 vCPU/512 MB, sleeps when unused, and the free instance does not support volumes or Worker Services |
| Vercel Hobby | Not eligible | Reject | Hobby is for personal/non-commercial use and cannot host this stateful multi-container company system |
| Google Cloud Always Free VM | Too small | Reject | The free e2-micro is limited to selected US regions and about 1 GB memory |
| AWS/Azure free offers | Trial only | Reject as a permanent free route | Current VM benefits are time/credit limited rather than an ongoing full-stack allocation |
| Fly.io | No current free tier for new customers | Reject | Usage is billed for new accounts |

Splitting the system across a free serverless Web host, a free PostgreSQL
provider, a free Redis provider and a separate file store is not a deployment
shortcut. It changes authentication, networking, storage, queue, backup and
document-generation behavior and creates several independent free-tier failure
points. That architecture is not approved for the pilot.

## Non-Negotiable Deployment Rules

1. Exactly one PostgreSQL database and one matching `storage/` tree are
   canonical and writable.
2. Database and file backups belong to the same recovery point. A database
   restore without its referenced uploads/reports is incomplete.
3. Original uploads, generated reports, labels, wage files and audit history
   remain durable. Ephemeral container filesystems are not production storage.
4. Only the HTTPS Web/nginx entry point may receive public traffic. PostgreSQL,
   Redis and internal API ports must not be Internet-accessible.
5. Never expose the current LAN Compose file directly to the Internet. Its host
   PostgreSQL and Redis bindings are for local development/operations and must
   be constrained by a dedicated public deployment profile.
6. Public access requires HTTPS, an external identity gate/MFA, application
   RBAC, revocable browser sessions, login throttling, security headers, audit
   logs and tested restore procedures.
7. No secret, tunnel token, cloud credential, private key, customer workbook or
   unredacted employee data may be committed to Git or written into `HANDOFF.md`.
8. Deployment, authentication and failure UI must use the typed `en` and
   `zh-CN` catalogs. A public deployment must never introduce raw status codes,
   English fallback in Chinese mode or bilingual concatenation.

## Route A: Local Canonical Stack Through Cloudflare

## Public Security Baseline Profile

`PUBLIC-DEPLOY-01` provides a provider-neutral public overlay. It does not
create a tunnel, DNS record, domain, cloud account or public VM.

Render and verify the network/config contract before starting any public
connector:

```bash
scripts/verify-public-deployment-contract.sh
```

The public stack is composed from both files and accepts traffic on the host
loopback connector port only; nginx is the sole application ingress and the
PostgreSQL, Redis and API ports have no host publication:

```bash
docker compose \
  -f infra/docker/compose.local.yml \
  -f infra/docker/compose.public.yml \
  config
```

Provide all of these values from the host secret/configuration manager before
startup: `PUBLIC_DEPLOYMENT_ENABLED=true`, an origin-only HTTPS
`PUBLIC_BASE_URL`, the exact same HTTPS origin in `CORS_ORIGINS`,
`BROWSER_COOKIE_SECURE=true`, `TRUSTED_PROXY_MODE`, explicit private proxy
CIDRs, Redis, and a unique JWT secret of at least 32 characters. Public startup
fails with a stable `PUBLIC_CONFIG_INVALID:*` diagnostic for HTTP/wildcard
origins, placeholder secrets, insecure cookies, missing Redis/trusted proxy,
sessions over 400 days, or disabled fail-closed rate limiting. Diagnostics
must never include the rejected secret.

Browser delivery uses a short HttpOnly access cookie and a rotating opaque
HttpOnly refresh cookie. Only SHA-256 hashes of refresh and CSRF secrets are
stored. A separate HttpOnly `bestar_session=active` hint contains no secret and
only routes an expired page navigation to the refresh flow. Unsafe cookie-auth
requests require the exact configured Origin/Referer and matching CSRF
cookie/header. The old JavaScript-readable `bestar_auth_token` is cleared and
is rejected in public mode. Native applications continue to use their existing
Bearer access plus Native refresh contract.

The application session can be configured up to 400 days, but it is revocable
and does not promise 400 days without re-verification. Cloudflare Access/MFA is
an independent outer identity gate and may expire sooner; application RBAC is
the inner authorization gate and is still required on every request.

Redis authentication limits are shared by API instances and survive process
restart. Public mode fails authentication mutations closed when Redis is
unavailable. Client identity and audit attribution accept forwarding headers
only when the direct peer belongs to an explicit trusted proxy CIDR; direct
clients cannot select their limit/audit identity by spoofing
`X-Forwarded-*` or `CF-Connecting-IP`.

### Public Auth Incident Response

1. Disable the outer Access application/tunnel or nginx connector ingress to
   stop new public requests while retaining evidence.
2. Record the incident time, affected accounts/session IDs and stable auth
   audit codes. Preserve `auth_audit_events` and the ordinary business audit
   trail; do not delete either table.
3. Rotate the affected JWT, database, Redis or connector credential in the
   approved secret manager, rebuild/restart the affected service and verify
   the old credential fails. Never put the replacement in Git, shell history,
   screenshots or `HANDOFF.md`.
4. For a stolen browser/Native session, use the administrator revoke endpoints
   for the affected user. For a password/account incident, reset the password
   or deactivate the account; both revoke active refresh families.
5. If the JWT signing secret may have leaked, rotate it immediately (invalidates
   access JWTs) and revoke every affected user's Browser and Native sessions so
   an old refresh family cannot mint a token under the new key.
6. Review login failure/rate-limit/reuse/CSRF events and proxy logs, restore
   ingress only after cookie, CORS, proxy, health-redaction and role tests pass.

Do not respond by truncating/deleting session or audit tables. Revocation is a
state transition and must remain auditable.

### What This Route Solves

- The public hostname remains stable when the company ISP address or host LAN
  address changes.
- `cloudflared` opens outbound connections; no inbound router forwarding is
  required.
- The warehouse can continue using the existing LAN URL if the Internet or
  tunnel fails.
- Data and document generation remain on the existing Docker host.

### What It Does Not Solve

- Remote access stops when company power, Internet, Docker host, nginx or the
  tunnel is down.
- A named production tunnel needs a domain managed in a Cloudflare account.
- The free service is not a substitute for a business continuity SLA.

### Required Order

1. Execute `PUBLIC-DEPLOY-01Public Internet Security Baseline.md` and close all
   automated security/i18n regression gates.
2. Confirm a company-controlled domain/subdomain, Cloudflare account, approved
   identity provider or one-time PIN policy, named users and MFA policy.
3. Execute `PUBLIC-DEPLOY-02Cloudflare Tunnel Local Canonical Pilot.md`.
4. Take a PostgreSQL plus `storage/` backup and perform the documented restore
   drill before the hostname is shared with users.
5. Configure a **named, remotely managed tunnel**, not a Quick Tunnel. Route one
   public hostname to nginx only. Protect the full application with Cloudflare
   Access and still require the application's own account/RBAC login.
6. Verify from a non-company network: login/logout, English and Chinese refresh,
   upload/parse, generated-file download, wage access by role, audit attribution,
   rate limits and the 100 MB upload boundary.
7. Stop the tunnel and company Internet separately. Confirm public access fails
   closed while the LAN URL and local warehouse workflow remain usable.

### Named Tunnel Repository Profile

The Cloudflare route is an overlay on the canonical local stack:

```text
infra/docker/compose.local.yml
+ infra/docker/compose.public.yml
+ infra/docker/compose.cloudflare-tunnel.yml
```

`cloudflared` is pinned to version `2026.7.2` and its multi-architecture image
digest. It has a read-only filesystem, drops every Linux capability, has no
host network, privileged mode, Docker socket, host port or broad filesystem
mount, and is attached only to the `public_tunnel` bridge shared with nginx.
The API, PostgreSQL, Redis and Worker are not attached to that connector
network. nginx keeps its warehouse LAN port; protect that port with the host
firewall so it is reachable only from approved private LAN/VPN ranges, and
never create router port forwarding.

Run the static and negative contract checks without a Cloudflare account or
real token:

```bash
scripts/verify-cloudflare-tunnel-contract.sh
scripts/test-cloudflare-tunnel-contract.sh
```

The tests parse `docker compose config --format json` with `jq`. They reject a
Quick Tunnel/`trycloudflare.com`, `latest` or changed image, token arguments or
environment values, a route other than `http://nginx:80`, public
PostgreSQL/Redis/API ports, host/privileged/socket access, HTTP or wildcard
public origins, CORS mismatch, insecure cookies, incorrect trusted-proxy mode,
missing proxy CIDRs, and a rendered token value.

The local integration/failure drill uses a controlled connector sentinel and
does not contact Cloudflare:

```bash
scripts/verify-cloudflare-tunnel-local-integration.sh
```

It proves that a connector-network client reaches only nginx, private
responses carry `Cache-Control: no-store`, an over-100 MB request receives the
stable `PAYLOAD_TOO_LARGE` JSON contract, stopping or network-isolating the
connector leaves LAN health available, nginx recreation restores the
service-name route, and PostgreSQL/container/storage identities plus business
row counts remain unchanged.

### Secret And Public Environment Setup

Never put a tunnel token in `.env`, YAML, a command argument, a screenshot,
logs, a rendered Compose artifact or `HANDOFF.md`. Create a remotely-managed
named tunnel in the Cloudflare dashboard and save only its connector token in
the gitignored file:

```text
.secrets/cloudflare-tunnel-token
```

On Linux, make the file readable only by the account/UID that runs the pinned
connector. Compose file-backed secret ownership follows the host on Linux; if
the default container UID `65532` cannot read it, install/chown the file to
that UID and run the preflight with sufficient local permission. On Docker
Desktop, Compose reports that file-secret `uid`/`gid`/`mode` are unsupported
and ignores those mount attributes, so keep the host file access restricted to
the deployment owner and verify connector readability during preflight. The
wrapper accepts only a regular, non-symlink, `0400` or `0600` file with the
expected token shape and never prints its contents:

```bash
scripts/cloudflare-tunnel-local.sh preflight
```

Set these public values in the host secret/configuration manager and `.env`
without adding any token value:

```dotenv
PUBLIC_DEPLOYMENT_ENABLED=true
PUBLIC_BASE_URL=https://<approved-public-hostname>
CORS_ORIGINS=https://<approved-public-hostname>
BROWSER_COOKIE_SECURE=true
TRUSTED_PROXY_MODE=cloudflare-tunnel
TRUSTED_PROXY_CIDRS=<exact-private-Docker-proxy-CIDRs>
AUTH_RATE_LIMIT_FAIL_CLOSED=true
CLOUDFLARE_TUNNEL_TOKEN_FILE=../../.secrets/cloudflare-tunnel-token
```

Keep `NEXT_PUBLIC_API_BASE_URL=/api`; do not compile the public hostname into
the Web bundle. Keep the Native scan app on its approved LAN API URL. Do not
put a Cloudflare Access service token in the Native app.

### Cloudflare Dashboard Checklist

Configure one remotely-managed named tunnel and exactly one public hostname:

1. Route the approved hostname to `http://nginx:80`. Do not add API, database,
   Redis, SSH, metrics, debug or wildcard catch-all hostnames.
2. Create a self-hosted Access application covering the entire hostname and
   all paths, including `/api`, downloads and error responses.
3. Add one allow policy for approved company identity groups only. Add no
   bypass policy. Deny is the default for everyone else.
4. Require MFA through the approved identity provider or Cloudflare's
   independent MFA control. Use a documented application/policy session
   duration appropriate for the pilot; 24 hours is the starting review value,
   not a hardcoded application promise.
5. Test an unapproved identity and a logged-out private browser before sharing
   the hostname. Both must stop at Access and never reach Bestar login.
6. Record the emergency owner who can revoke an identity, terminate Access
   sessions, disable the application, rotate the tunnel token and review Access
   audit logs. Do not record employee email addresses in this repository.
7. Disable cache for the entire authenticated hostname. Confirm no cache rule,
   Cache Everything rule, Worker, APO or page rule overrides origin
   `Cache-Control: no-store` for HTML, `/api`, Excel/PDF/label/wage downloads,
   redirects or private error bodies. Check `CF-Cache-Status` during external
   verification.

Cloudflare's `CF-Access-*` and `CF-Connecting-IP` headers are request metadata,
not Bestar business identity. The API accepts forwarding metadata only after
the direct peer passes the PUBLIC-DEPLOY-01 trusted-proxy boundary. The
application account remains the actor for RBAC and audit attribution.

### Start, Stop, Update, Rotate, And Revoke

After backup/restore drill approval and dashboard configuration:

```bash
scripts/cloudflare-tunnel-local.sh start
scripts/cloudflare-tunnel-local.sh status
scripts/cloudflare-tunnel-local.sh logs
```

`restart: unless-stopped` supplies host-boot restart after Docker itself is
configured to start at boot. Test a real host reboot before pilot sign-off.
`cloudflared` reconnects by Docker service name, so nginx recreation or a host
DHCP/LAN IP change does not require a public DNS change.

Stop only remote access while preserving the LAN stack:

```bash
scripts/cloudflare-tunnel-local.sh stop
```

For an image update, review the official release notes, resolve the exact
multi-architecture digest, change both the version and digest in the overlay,
run both contract scripts and the full regression, then recreate only
`cloudflared`. Do not enable cloudflared auto-update.

For planned token rotation, create a replacement token in Cloudflare, write it
to a new restricted host file without printing it, run preflight, atomically
replace the configured file, and run:

```bash
scripts/cloudflare-tunnel-local.sh restart
```

Confirm the hostname works, then revoke the old token/connector in the
dashboard. For compromise, first disable Access/tunnel ingress, revoke the old
credential, preserve logs, install the replacement, and re-enable only after
Access, Bestar login/RBAC and audit checks pass. Deleting a token does not
justify deleting application sessions or audit history.

### Upload Boundary

Cloudflare Free/Pro currently documents a 100 MB request limit, and nginx keeps
`client_max_body_size 100m`. The Bestar import application deliberately limits
Excel uploads to 50 MB, safely below that edge boundary. The browser rejects a
larger selected workbook before upload with a typed English or Chinese
message; direct API/nginx 413 responses use the stable
`PAYLOAD_TOO_LARGE` code. Do not display raw codes or a provider HTML body.

Verify a real, de-identified workbook well below 50 MB through the external
hostname. Verify the over-limit case with isolated synthetic bytes; never send
customer data to a third-party load-test service. Do not promise that a request
at exactly 100 MB will succeed because encoding overhead, zone settings and
provider plan limits can differ.

### Activation Backup And Failure Drills

Immediately before enabling Route A, create PostgreSQL and `storage/` backups
from the same quiet recovery point and complete the dry-run commands in
[backup-restore.md](backup-restore.md). Tunnel activation must not run a data
migration, restore, seed or second database.

Perform and timestamp these drills:

1. Stop only `cloudflared`: public access fails closed; LAN health, login,
   inventory, scan and document routes continue.
2. Disconnect company Internet/connector egress: the public hostname fails;
   LAN and the unique PostgreSQL + `storage/` writer continue.
3. Reconnect Internet and recreate nginx plus `cloudflared`: the same hostname
   automatically recovers without DNS/IP edits. Re-submit only idempotent reads
   and confirm no import, scan, correction or generation was duplicated.
4. Compare PostgreSQL volume identity, storage mount identity, row counts and a
   representative file/hash manifest before and after. The tunnel deployment
   must not modify or migrate business data.

If a real domain/account is unavailable, keep the repository drill as
automation evidence and record the real tunnel/Internet/recovery drill as an
external gate. Never substitute a Quick Tunnel.

### External Browser And Operations Evidence

From a non-company network, test the approved hostname in English and Chinese,
light and dark mode, 320/390/1366 widths and browser 200% zoom. Cover Bestar
login, refresh/reload, logout, locale/theme persistence, Access redirect
return, expired/401 refresh, ADMIN/OFFICE/HR_MANAGER/WAREHOUSE_MANAGER RBAC
denial, de-identified Excel upload/parse, report/label/wage downloads,
inventory read and audit attribution. Capture zero console errors, page errors,
hydration warnings, missing translations, raw codes and bilingual strings.
Cloudflare's own Access page is provider-owned and is not claimed as part of
the Bestar catalog.

Monitor tunnel/container health, a public synthetic request that expects
Access rather than origin content, Access/auth failures, Bestar rate limits,
disk and paired-backup freshness, queue health, document failures and
Cloudflare status incidents. External alert delivery is a site configuration
gate; do not mark it connected without an observed test alert.

The application's configured 400-day session ceiling does not override the
Cloudflare Access/MFA session. The outer identity gate can expire sooner and
require a new identity check even while the application session remains valid.

### Route A Rollback

Disable the Cloudflare Access application and named tunnel/DNS route. Keep the
existing LAN nginx endpoint and canonical local database/storage unchanged.
No data migration is required, so rollback must not restore or replace data.

## Route B: OCI Always Free as the Canonical Host (Archived)

This route was archived by product decision on 2026-07-22. Do not provision,
migrate, cut over, or execute `PUBLIC-DEPLOY-03` while its
`Task-Status: ARCHIVED` marker is present. The remaining section is historical
reactivation reference only.

### Current Free-Tier Boundary

OCI currently documents an Always Free Ampere A1 allocation equivalent to
2 OCPUs and 12 GB memory, 200 GB combined boot/block-volume storage, five volume
backups, 20 GB object storage for an Always Free-only account, and 10 TB monthly
outbound transfer. Free resources must be in the tenancy home region. The home
region cannot be changed after tenancy creation.

Use a Canadian home region, such as Toronto or Montreal, only after confirming
current A1 capacity and the provider/data review. Size and test against the
conservative documented 2 OCPU/12 GB allocation even if a console or marketing
page displays a larger historical allowance.

OCI signup can require identity, phone and payment-card verification. That does
not make out-of-quota resources free. Budget notifications are alerts, not a
hard spending cap; use service quotas plus an explicit resource inventory and
verify the Always Free label before creating each resource.

OCI explicitly warns that A1 capacity can be unavailable and that an Always
Free instance may be reclaimed when CPU, network and A1 memory all remain below
its documented seven-day thresholds. Do not generate fake traffic to avoid
reclamation. Monitor utilization, keep verified off-provider backups and retain
a paid-host migration plan. Free-only accounts do not include production
support or an SLA.

### Required Order

1. Execute `PUBLIC-DEPLOY-01Public Internet Security Baseline.md`.
2. Before creating the tenancy, approve the Canadian home region, provider
   terms, data location, administrators, budget/quota alarms and account
   recovery ownership. The home-region choice is permanent.
3. Only after explicit product reactivation, removal of the archived marker,
   and synchronized Task index/completion report updates, execute
   `PUBLIC-DEPLOY-03OCI Always Free ARM64 Cloud Canonical Profile.md`. The task
   must prove `linux/arm64` builds and actual Excel/PDF/QR generation; an
   amd64-only image is not deployable on A1.
4. Provision one VM and durable block volume. Expose only HTTPS ingress; keep
   PostgreSQL, Redis and internal API private. Do not store runtime data only in
   the container writable layer.
5. Complete a restore rehearsal with non-production data before cutover.
6. Schedule a write freeze on the local system. Create a final PostgreSQL dump
   and matching `storage/` archive, record checksums, restore both on OCI, apply
   migrations, and compare database counts plus file/hash manifests.
7. Run the complete smoke and role/i18n matrix against the cloud hostname.
8. Switch users only after sign-off. Stop or make the local application
   read-only before accepting cloud writes. Never allow both systems to accept
   business changes.

### Route B Rollback

1. Stop public writes and record the last accepted cloud transaction time.
2. If the cloud system has accepted no writes, disable its ingress and restart
   the unchanged local canonical stack.
3. If it has accepted writes, export a new consistent PostgreSQL plus `storage/`
   recovery point and restore/verify it locally before reopening local writes.
4. Do not point users back to an older local snapshot while newer cloud records
   exist. That would lose inventory, scan, correction, wage and audit history.

## Privacy and Business Approval

Attendance and wage records contain employee personal information. Customer
workbooks and warehouse history may also contain commercially sensitive data.
Using an external tunnel or cloud host does not transfer accountability to the
provider. Before either route, the business owner must review provider terms,
administrators, MFA, encryption, traffic/auth logs, subcontractor access,
retention and breach handling. Route B additionally requires approval of the
region/data location, data-at-rest controls, backup, deletion and provider-exit
procedures. This runbook is an engineering control list, not legal advice;
obtain the organization's privacy/legal approval for the actual deployment.

## Cost and Capacity Guardrails

- Enable budget and quota alerts before provisioning, including a zero/small
  threshold notification where the provider supports it.
- Treat budget notifications as alerts rather than an automatic spend cap.
- Do not create non-free shapes, extra regions, oversized boot volumes, paid
  load balancers, public IP products or backups outside the Always Free limits.
- Monitor PostgreSQL size, `storage/` size, backup size, disk percentage, memory,
  CPU, queue depth and failed document jobs. The 2026-07-22 pilot measurements
  are not a sizing ceiling.
- Keep at least one encrypted, verified backup outside the active VM/provider
  failure domain. A provider volume backup alone is not a complete exit plan.
- If free capacity, reliability or support becomes an operational problem,
  migrate the same single-writer Docker profile to a paid Canadian VM. Do not
  compensate by creating an unsupervised second writer.

## Official Sources

- [OCI Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)
- [OCI Free Tier overview](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier.htm)
- [OCI home region rules](https://docs.oracle.com/en-us/iaas/Content/Identity/Tasks/managingregions.htm)
- [OCI Canadian cloud regions](https://www.oracle.com/ca-en/cloud/public-cloud-regions/)
- [OCI Free Tier FAQ](https://www.oracle.com/cloud/free/faq/)
- [Cloudflare Tunnel](https://developers.cloudflare.com/tunnel/)
- [Cloudflare Quick Tunnel limitations](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/)
- [Cloudflare upload limits](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/4xx-client-error/error-413/)
- [Cloudflare Zero Trust plans](https://www.cloudflare.com/plans/zero-trust-services/)
- [Render free-service limitations](https://render.com/docs/free)
- [Koyeb instance limits](https://www.koyeb.com/docs/reference/instances)
- [Vercel Hobby plan](https://vercel.com/docs/plans/hobby)
- [Google Cloud free program](https://docs.cloud.google.com/free/docs/free-cloud-features)
- [AWS six-month Free Plan announcement](https://aws.amazon.com/about-aws/whats-new/2025/07/aws-free-tier-credits-month-free-plan/)
- [Azure free account](https://azure.microsoft.com/en-us/pricing/purchase-options/azure-account)
- [Fly.io cost management](https://fly.io/docs/about/cost-management/)
- [Office of the Privacy Commissioner of Canada cloud guidance](https://www.priv.gc.ca/en/privacy-topics/technology/online-privacy-tracking-cookies/online-privacy/cloud-computing/gd_cc_201206/)
- [PIPEDA safeguards guidance](https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/p_principle/principles/p_safeguards/)
