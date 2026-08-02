# Bestar Agent Handoff

> 新会话必须先读 `AGENTS.md` 和本文件，再核对当前 Task、任务索引、完成度报告与 `git status`。本文件用于交接，不替代验收证据。

## 交接元数据

- Generated at: `2026-08-02T14:45:26Z`
- Source: `product-planning-agent production configuration review`
- Task: `PUBLIC-DEPLOY-04`
- Task file: `prompts/tasks/PUBLIC-DEPLOY-04Public Domain and LAN IP Login Coexistence Regression.md`
- Status: `CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING`
- Execution mode: `read-only production configuration guidance; no deployment executed`
- Session: `not supervised`
- Git HEAD: `1b311c2`
- Worktree: clean before this handoff-only update

## 现在在做什么

PUBLIC-DEPLOY-04 repository implementation is committed and all recorded automated gates are
complete. The user is preparing the production `.env`; the real public-domain and warehouse-LAN
matrix remains the authoritative external gate before the Task can become `DONE`.

## 已完成

- Reconciled the Task, `.env.example`, public/tunnel Compose overlays, API configuration parser,
  nginx dual listeners, production update script and bilingual Named Tunnel runbook.
- Confirmed that PUBLIC-DEPLOY-04 adds `LAN_BROWSER_ENABLED`, `LAN_BROWSER_ORIGINS`,
  `LAN_BIND_ADDRESS`, `LAN_HTTP_PORT` and `PUBLIC_HTTP_PORT` to the production environment.
- Confirmed the existing public security values must remain enabled: exact HTTPS
  `PUBLIC_BASE_URL`/`CORS_ORIGINS`, Secure public cookies, Cloudflare trusted-proxy mode and CIDR,
  fail-closed auth rate limiting, same-origin Web API routing and file-backed Tunnel secret.
- No production `.env`, token, credential, domain or private IP was read or modified.

### Changed files

- `HANDOFF.md`

### Tests and verification actually run

- No Docker, unit, E2E, browser, deployment or production command was run in this read-only review.
- Inspected tracked configuration and the committed PUBLIC-DEPLOY-04 diff at Git HEAD `1b311c2`.

## 卡在哪里

### Remaining implementation

- None reported in the repository.

### External verification

- Configure the target production `.env` with the exact approved public HTTPS origin, canonical
  LAN HTTP origin, private interface bind address and the verified Docker network CIDR shared by
  nginx and API.
- Run `scripts\update-production.cmd -ValidateOnly`, then apply through the documented paused-business
  production update flow.
- Complete independent public/LAN login, refresh, reload and logout checks plus Tunnel-outage,
  LAN-listener isolation, Cookie attributes and host-port exposure checks.

### Blockers

- Production-specific public hostname, LAN interface address, approved LAN firewall CIDR and Docker
  bridge subnet must be supplied and verified on the target host; they must not be inferred here.

## 下一步

- On the production host, determine the canonical LAN URL and nginx/API Docker bridge subnet, edit
  the root `.env`, then run `scripts\update-production.cmd -ValidateOnly` before any apply.

## 不要再踩的坑

- Do not append the LAN origin to `CORS_ORIGINS`; put it only in `LAN_BROWSER_ORIGINS`.
- Do not set `BROWSER_COOKIE_SECURE=false`; request-aware policy handles LAN cookies separately.
- Do not use `0.0.0.0` as the production `LAN_BIND_ADDRESS`, wildcard origins, public LAN addresses,
  router port forwarding or the broad test fallback `172.16.0.0/12`.
- When `LAN_HTTP_PORT=80`, omit `:80` from `LAN_BROWSER_ORIGINS`; for a non-default port, include it.
- The Tunnel token stays in the gitignored secret file and never appears as a `.env` token value.
- Changing `POSTGRES_PASSWORD` in `.env` does not change the role password in an existing PostgreSQL
  volume; do not rotate it as part of this configuration update.

## 新会话启动清单

1. Read `AGENTS.md` and `.codex/skills/bestar-handoff/SKILL.md`.
2. Run `git status --short`; preserve this handoff update.
3. Read the PUBLIC-DEPLOY-04 Task, verification report and Named Tunnel runbook.
4. Reconcile the real target-host state without printing `.env`, token or credentials.
5. Do not mark the Task `DONE` until the named external matrix is actually complete.

## 权威参考

- `prompts/tasks/PUBLIC-DEPLOY-04Public Domain and LAN IP Login Coexistence Regression.md`
- `docs/reports/public-deploy-04-dual-origin-login-verification.md`
- `docs/runbooks/cloudflare-named-tunnel-deployment.md`
- `.env.example`
- `infra/docker/compose.public.yml`
- `infra/docker/compose.cloudflare-tunnel.yml`
- `scripts/update-production.ps1`
