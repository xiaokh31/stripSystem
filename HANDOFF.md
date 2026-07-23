# Bestar Agent Handoff

> 新会话必须先读 `AGENTS.md` 和本文件，再核对当前 Task、任务索引、完成度报告与 `git status`。本文件用于交接，不替代验收证据。

## 交接元数据

- Generated at: `2026-07-22T23:59:23Z`
- Source: `product-planning-agent`
- Task: `PUBLIC-DEPLOY-PLANNING`
- Task files: `prompts/tasks/PUBLIC-DEPLOY-01Public Internet Security Baseline.md`、`PUBLIC-DEPLOY-02Cloudflare Tunnel Local Canonical Pilot.md`、`PUBLIC-DEPLOY-03OCI Always Free ARM64 Cloud Canonical Profile.md`
- Status: `DONE`（规划/文档完成；运行时实现尚未开始）
- Execution mode: `planning-and-documentation`
- Last supervised implementation: `WAGE-HOURS-06` / `DONE` / Session `019f8bca-ebbf-7a71-9dac-e0422cbb8ac1`
- Last supervisor artifacts: `/Volumes/xfl/logistics/stripSystem/.codex/business-agent-runs/20260722T214558Z-WAGE-HOURS-06-18907`
- Git HEAD: `706df69`
- Worktree: dirty with the PUBLIC-DEPLOY planning files listed below; preserve and inspect them

## 现在在做什么

公网访问与免费云部署的产品/架构规划已完成，没有创建公网、域名、Cloudflare 或 OCI 资源，也没有修改运行时代码。当前唯一可立即执行的开发任务是 `PUBLIC-DEPLOY-01Public Internet Security Baseline.md`。

## 已完成

- 核对当前 full stack：Next.js、NestJS、PostgreSQL、Redis/BullMQ、Python/WeasyPrint/openpyxl/qrcode 文档生成、持久化 `storage/` 和 nginx 100 MB upload boundary。普通会休眠、无持久盘或只限个人用途的免费 PaaS 不适合直接承载该系统。
- 按 2026-07-22 官方资料复核 Cloudflare Tunnel/Quick Tunnel/upload limits、OCI Always Free A1/home region/storage/idle reclaim、Render、Koyeb、Vercel、Google/AWS/Azure/Fly.io 和加拿大隐私云服务指导。
- 新增 ADR 0005：任何时刻只有一个 canonical writable PostgreSQL + matching `storage/`；禁止 local/cloud active-active、只迁数据库、不一致文件同步和 public PostgreSQL/Redis。
- 新增公网部署 runbook：推荐先用 Cloudflare named tunnel + Access 保持 local canonical writer；它解决动态 IP，但公司 Internet、供电或主机故障时远程仍不可用。若远程可用性必须脱离公司网络，则把完整 stack 受控迁到 OCI Canadian-region A1；仓库此后依赖 outbound Internet，且接受 free capacity/no-SLA/idle reclaim 风险。
- 拆分并写入三个业务 Agent Task：01 公网安全基线为 current next；01 Done 后默认选择 02 Cloudflare 路线，只有产品明确选择 remote-availability-first 才执行 03 OCI migration。02/03 不得形成两个 writer。
- 三个 Task 均包含 strict typed `en` / `zh-CN`、单语 SSR/hydration/refresh、stable API code、RBAC/audit、Docker-only、backup/restore、负向测试和受监督终态要求。
- 同步产品上下文、本地/生产部署入口、Task Index、完成度 HTML 和 `.gitignore` tracking exceptions。完成度报告明确 Public Access implementation 为 0%，没有把规划写成已上线。

### Changed files

- `.gitignore`
- `HANDOFF.md`
- `docs/adr/0005-single-writer-public-access-and-cloud-hosting.md`
- `docs/product/00-business-context.md`
- `docs/reports/project-completion-status.html`
- `docs/runbooks/local-deployment.md`
- `docs/runbooks/production-deployment-beginner-guide.md`
- `docs/runbooks/public-access-and-free-cloud-deployment.md`
- `prompts/tasks/OPEN-FUNCTIONS-20260707Task Index.md`
- `prompts/tasks/PUBLIC-DEPLOY-01Public Internet Security Baseline.md`
- `prompts/tasks/PUBLIC-DEPLOY-02Cloudflare Tunnel Local Canonical Pilot.md`
- `prompts/tasks/PUBLIC-DEPLOY-03OCI Always Free ARM64 Cloud Canonical Profile.md`

### Tests and verification actually run

- Official provider/privacy source review: completed on 2026-07-22; limits are date-stamped in the runbook and must be rechecked before provisioning.
- New local document/task references: checked to exist.
- `xmllint --html --noout docs/reports/project-completion-status.html`: exit 0; libxml2 emitted only its expected HTML5 `main/header/section` unknown-tag notices.
- `git diff --check`: passed for tracked changes before the final handoff update.
- `git diff --no-index --check /dev/null <new-file>`: no whitespace diagnostics for each new ADR/runbook/Task; exit 1 is the expected “new file differs from /dev/null” status.
- No Docker test, build, migration, service, browser, cloud command or production mutation was run because this Session changed planning/documentation only.

## 卡在哪里

### Remaining implementation

1. Execute `PUBLIC-DEPLOY-01` completely: provider-neutral public base profile, fail-closed config, revocable secure HttpOnly browser sessions while preserving the 400-day ceiling, CSRF/Origin, Redis rate limits, trusted proxy, security headers, audit and strict i18n.
2. After 01 is `DONE`, choose exactly one route:
   - Default: `PUBLIC-DEPLOY-02` Cloudflare named tunnel to the local canonical stack.
   - Product decision alternative: `PUBLIC-DEPLOY-03` full OCI ARM64 canonical migration.

### External verification

- PUBLIC-DEPLOY-02 eventually needs a company-controlled domain, Cloudflare account, named tunnel, Access identity/MFA policy and a non-company-network verification.
- PUBLIC-DEPLOY-03 eventually needs explicit product/privacy approval, an OCI account, Canadian immutable home-region choice, A1 capacity, domain/Access, backup target, 72-hour observation and controlled cutover.
- These external items do not block completing PUBLIC-DEPLOY-01 or either route's automatable repository work.

### Blockers

- No blocker for PUBLIC-DEPLOY-01.
- PUBLIC-DEPLOY-03 is intentionally blocked by a product route decision until 01 is Done; this is a decision gate, not a reason to mark 01 blocked.

## 下一步

Run exactly one fresh supervised Task:

```bash
scripts/run-business-agent.sh task 'prompts/tasks/PUBLIC-DEPLOY-01Public Internet Security Baseline.md'
```

Do not start PUBLIC-DEPLOY-02 or 03 in that Session. When 01 reaches `DONE`, return to the latest Task Index for the branch decision.

## 不要再踩的坑

- Cloudflare Tunnel is public ingress, not cloud hosting. It fixes changing IPs but cannot keep remote access alive through company Internet/power/host failure.
- Do not use `trycloudflare.com` Quick Tunnels for production; use a named remotely managed tunnel and Access.
- Do not expose the existing LAN Compose/nginx directly. PostgreSQL, Redis and internal API ports must stay private.
- Do not leave the current JavaScript-readable 400-day bearer cookie unchanged on a public site. Preserve the persistence product goal through a server-side revocable/rotating HttpOnly session contract.
- Do not run local and OCI deployments as writable peers. PostgreSQL and `storage/` must move as one verified recovery point under a write freeze.
- OCI Always Free is not an SLA. Use the current conservative 2 OCPU/12 GB official allocation, prove ARM64 document generation, monitor capacity/reclaim risk and keep an off-provider restore path.
- Do not commit domain credentials, tunnel tokens, OCI credentials, private keys, customer workbooks, employee data or secrets to Git/HANDOFF/logs.
- All public/auth/failure UI must remain strict single-language `en` or `zh-CN`; infrastructure/provider errors cannot be shown raw to users.

## 新会话启动清单

1. Read `AGENTS.md`, this file and `.codex/skills/bestar-handoff/SKILL.md`.
2. Run `git status --short`; preserve all PUBLIC-DEPLOY planning changes and any newer user work.
3. Read `prompts/tasks/PUBLIC-DEPLOY-01Public Internet Security Baseline.md`, the latest Task Index, ADR 0005, the public deployment runbook and completion report.
4. Reconcile this handoff with Git HEAD, supervisor state, current code/config/tests and any newer Task status before acting.
5. Do not execute any Task marked `Task-Status: ARCHIVED`, and do not execute PUBLIC-DEPLOY-02/03 before their gates.

## 权威参考

- `prompts/tasks/PUBLIC-DEPLOY-01Public Internet Security Baseline.md`
- `prompts/tasks/OPEN-FUNCTIONS-20260707Task Index.md`
- `docs/adr/0005-single-writer-public-access-and-cloud-hosting.md`
- `docs/runbooks/public-access-and-free-cloud-deployment.md`
- `docs/reports/project-completion-status.html`
- `docs/runbooks/business-agent-execution.md`
