# Bestar Agent Handoff

> 新会话必须先读 `AGENTS.md` 和本文件，再核对当前 Task、任务索引、完成度报告与 `git status`。本文件用于交接，不替代验收证据。

## 交接元数据

- Generated at: `2026-08-03T03:41:55Z`
- Source: `product-planning-agent production ingress diagnosis`
- Task: `PUBLIC-DEPLOY-04`
- Task file: `prompts/tasks/PUBLIC-DEPLOY-04Public Domain and LAN IP Login Coexistence Regression.md`
- Status: `CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING`
- Execution mode: `production diagnosis plus tracked runbook/contract correction; no production access`
- Session: `not supervised`
- Git HEAD: `1b311c2`
- Worktree: dirty with the four scoped files listed below; preserve them

## 现在在做什么

The production LAN origin can log in, but the public hostname returns HTTP 403 with
`LAN_BROWSER_INGRESS_MISMATCH`. Diagnosis proves the public request entered nginx's LAN listener.
The production Cloudflare Published Route must be changed to the Tunnel-only public listener at
`http://nginx:8080`, then the public/LAN matrix must be rerun.

## 已完成

- Traced the stable code to `resolveBrowserIngressPolicy`: it is emitted only after a trusted request
  is marked `lan` but its protocol, CF header or exact LAN host contract does not match.
- Confirmed nginx port `8080` sets public/HTTPS ingress and port `80` sets LAN/HTTP ingress.
- Found the tracked Compose and contract correctly use `http://nginx:8080`, while both runbook
  Published Route tables still incorrectly instructed operators to use the LAN port.
- Corrected the Chinese and English route tables and added direct troubleshooting for this 403.
- Added a contract regression that rejects the obsolete route URL in the runbook and repaired the
  stale quick-tunnel mutation fixture to target the current public listener.
- Recorded the production report without claiming that the real Cloudflare change or retest occurred.

### Changed files

- `HANDOFF.md`
- `docs/reports/public-deploy-04-dual-origin-login-verification.md`
- `docs/runbooks/cloudflare-named-tunnel-deployment.md`
- `scripts/test-cloudflare-tunnel-contract.sh`

### Tests and verification actually run

- Focused API ingress policy in Docker: 1 suite / 8 tests passed.
- New documentation route gate first failed with
  `PUBLIC_ROUTE_DOCUMENTATION_POINTS_TO_LAN_LISTENER`, proving the tracked runbook regression.
- After the correction, `scripts/test-cloudflare-tunnel-contract.sh` passed both the base contract
  and contract regression.
- `git diff --check` passed before the final handoff update and must be rerun afterward.

## 卡在哪里

### Remaining implementation

- No application implementation remains. The production route is external Cloudflare state.

### External verification

- In the actual Tunnel's Published application route, change the service URL from the LAN listener
  to exactly `http://nginx:8080`.
- Confirm the running cloudflared command contains `http://nginx:8080` and running nginx has both
  the public 8080 and LAN 80 listener/markers; recreate from all three production overlays if stale.
- Retest public and LAN login independently, including refresh/reload/logout and Cookie attributes,
  then complete the remaining outage/isolation matrix before marking the Task `DONE`.

### Blockers

- The agent has no access to the real Cloudflare account or production host. An authorized operator
  must change the Published Route and report the sanitized result.

## 下一步

- Authorized operator edits the real Cloudflare Published application Service URL to
  `http://nginx:8080`, waits for propagation, then retries public login in a fresh private window.

## 不要再踩的坑

- Do not fix this by disabling Secure cookies, widening CORS, adding the public hostname to
  `LAN_BROWSER_ORIGINS`, or weakening ingress checks. The 403 is correctly failing closed.
- Port 8080 is public/Tunnel only; port 80 is LAN only.
- If public still fails after the dashboard edit, inspect running container command/config before
  changing environment variables. A wrong trusted proxy CIDR would normally return
  `UNTRUSTED_BROWSER_INGRESS`, not this stable code.
- Do not print the Tunnel token, `.env`, Cookie values, credentials, real domain or private IP.

## 新会话启动清单

1. Read `AGENTS.md` and `.codex/skills/bestar-handoff/SKILL.md`.
2. Preserve the four scoped worktree changes and inspect the production route result.
3. Read the PUBLIC-DEPLOY-04 Task, verification report and corrected Named Tunnel runbook.
4. Do not mark the Task `DONE` until the real public/LAN matrix is complete.

## 权威参考

- `prompts/tasks/PUBLIC-DEPLOY-04Public Domain and LAN IP Login Coexistence Regression.md`
- `docs/reports/public-deploy-04-dual-origin-login-verification.md`
- `docs/runbooks/cloudflare-named-tunnel-deployment.md`
- `infra/nginx/nginx.public.conf`
- `infra/docker/compose.cloudflare-tunnel.yml`
- `scripts/test-cloudflare-tunnel-contract.sh`
