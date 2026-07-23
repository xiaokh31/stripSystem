# Public Access and Free Cloud Deployment

## Purpose

This guide answers whether the Bestar Warehouse Unloading System can be used
from the public Internet without depending on a stable company IP address. It
records the approved architecture choices, free-tier limits, security gates,
cutover rules and rollback path.

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
2. **Alternative when remote uptime matters more: move the entire canonical
   stack to one OCI Always Free Ampere A1 VM.** This removes the warehouse host
   and company network from the off-site request path, but warehouse users then
   depend on outbound Internet access. OCI free capacity has no production SLA,
   can be unavailable at provisioning time and idle instances may be reclaimed.
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
| OCI Always Free A1 VM | Plausible for the whole pilot stack | Approved migration alternative | 2 OCPU/12 GB A1 allocation and 200 GB combined boot/block storage currently fit a small pilot, subject to ARM64 and runtime validation |
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

The current Cloudflare Free/Pro upload limit is 100 MB, matching nginx's current
`client_max_body_size`. Use a file below the boundary for the success case and
verify that an oversized file returns an explicit localized error. Do not rely
on a request exactly at the nominal boundary because protocol overhead and
provider policy can differ.

The application's configured 400-day session ceiling does not override the
Cloudflare Access/MFA session. The outer identity gate can expire sooner and
require a new identity check even while the application session remains valid.

### Route A Rollback

Disable the Cloudflare Access application and named tunnel/DNS route. Keep the
existing LAN nginx endpoint and canonical local database/storage unchanged.
No data migration is required, so rollback must not restore or replace data.

## Route B: OCI Always Free as the Canonical Host

Choose this route only if remote availability must not depend on the company's
host, power and network, and the company accepts that warehouse access will
depend on outbound Internet connectivity.

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
3. Execute `PUBLIC-DEPLOY-03OCI Always Free ARM64 Cloud Canonical Profile.md`.
   The task must prove `linux/arm64` builds and actual Excel/PDF/QR generation;
   an amd64-only image is not deployable on A1.
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
