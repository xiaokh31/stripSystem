# Bestar Agent Handoff

## Authoritative current public deployment state (2026-07-30)

- Active work: `PUBLIC-DEPLOY-02` Cloudflare Named Tunnel production pilot.
- Status: `CONTINUE`. The Tunnel, published route, DNS, connector, cache rule, and
  Bestar stack are healthy. At the operator's explicit request, the self-hosted
  Cloudflare Access application for `warehouse.bestarcca.cc` was deleted. Anonymous
  Internet traffic now reaches the Bestar login page directly.
- Security consequence: the public hostname no longer has Cloudflare identity
  enforcement, MFA challenge, default-deny policy evaluation, or Access request logs.
  Protection now depends on the Bestar application login/RBAC/audit controls and
  Cloudflare zone-level controls. This deliberate downgrade does not satisfy the
  Access-plus-MFA Definition of Done in `PUBLIC-DEPLOY-02`, so the Task cannot be
  marked `DONE` while Access remains absent.
- Retained for recovery: the Named Tunnel, published hostname route, DNS record,
  connector secret, reusable approved-administrator Allow policy, App Launcher policy,
  Cloudflare identity provider/MFA enrollment, and active hostname cache-bypass rule.
  Retaining these dormant settings does not protect or intercept the public hostname.
- Recovery procedure: follow section 9.1, "Temporarily Remove and Restore Access for
  the Warehouse Hostname", in
  `docs/runbooks/cloudflare-named-tunnel-deployment.md`. Recreate a self-hosted
  application named `Bestar Warehouse Production` for the whole
  `warehouse.bestarcca.cc` hostname, set a 24-hour application session, attach the
  retained `Allow approved warehouse administrator` policy, require the Authenticator
  MFA method, and do not add Everyone or Bypass rules. The approved login email remains
  deliberately omitted from tracked documentation.
- Actions and verification actually completed after removal:
  - Cloudflare confirmed that the self-hosted application was deleted.
  - An anonymous request returned `307` to `/login?next=%2F`, with no
    `Www-Authenticate` header and no redirect to a `cloudflareaccess.com` hostname.
  - Following redirects ended with HTTP `200` on the Bestar login page.
  - Response headers remained `Cache-Control: no-store` and
    `cf-cache-status: DYNAMIC`; the Cloudflare cache-bypass rule remained active.
  - Combined Compose status showed API, PostgreSQL, Redis, Web, worker, nginx, and
    cloudflared healthy. API/PostgreSQL/Redis remain unbound from public host ports.
  - `scripts/healthcheck.sh` passed database readiness, API, Web, static assets, and
    storage-write checks.
- Remaining external verification: use a private window or off-site device to confirm
  direct Bestar login, authorized and unauthorized Bestar-account behavior, RBAC,
  audit attribution, logout/session expiry, and monitoring/rate-limit behavior.
- Next action: obtain explicit security acceptance for operating the Bestar login
  directly on the public Internet, or restore Access using runbook section 9.1 and
  repeat the anonymous challenge, denied-identity, MFA, cache, and outage drills.
- Pitfalls: do not delete the retained reusable policy, App Launcher policy, MFA
  enrollment, Tunnel, route, DNS record, token, or cache rule merely because the Access
  application is absent. Never record credentials, approved email addresses, MFA
  secrets/recovery codes, session cookies, or the Tunnel token in this file.
- Supersession note: the older "public deployment preparation" section immediately
  below records the earlier Access-enabled state and is retained as historical
  chronology only. This section is authoritative for the current production state.

> 新会话必须先读 `AGENTS.md` 和本文件，再核对当前 Task、任务索引、完成度报告与 `git status`。本文件用于交接，不替代验收证据。

## 公网域名部署准备（2026-07-30）

- Active work: `PUBLIC-DEPLOY-02` 真实 Cloudflare Named Tunnel 外部激活准备。
- Status: `CONTINUE`；Named Tunnel、published route、默认拒绝 Access 应用、
  应用级 MFA 和 hostname cache bypass 已创建，本地 secret、overlay、
  connector-to-origin、MFA、已认证故障恢复和生产健康检查通过；Bestar
  登录/RBAC/审计和最终外网业务验收尚未完成。
- Current state: 根目录 `.env` 已配置非敏感 public deployment keys，目标为
  `https://warehouse.bestarcca.cc`，可信代理 CIDR 为当前 Docker default network
  的 `172.18.0.0/16`。Cloudflare 中存在 named tunnel
  `bestar-warehouse-production` 和唯一 published application route
  `warehouse.bestarcca.cc -> http://nginx:80`，DNS route 已创建。
  `.secrets/cloudflare-tunnel-token` 已存在、被 Git 忽略且使用受保护 NTFS ACL；
  不得读取或记录其内容。`cloudflared` 当前 healthy 并建立四条连接；PostgreSQL、
  Redis、API、Web、worker 和 LAN nginx 均保持 healthy。
- Access/cache state: Zero Trust Free 已由操作人亲自激活。Self-hosted application
  `Bestar Warehouse Production` 覆盖完整 hostname，24 小时应用 session，当前无
  Bypass/Everyone policy。唯一 Allow policy 只包含操作人明确批准的当前
  Cloudflare 登录邮箱，其他身份仍由 default-deny 拒绝；邮箱值不得写入交接。
  同一 policy 已复用于 App Launcher，App Launcher session 为 24 小时。Cloudflare
  内置 MFA 已允许 Authenticator application，仓库应用被配置为强制该第二因素，
  MFA duration 为 24 小时。Cache Rule
  `Bypass Bestar warehouse application cache` 只匹配
  `warehouse.bestarcca.cc`，状态 Active，动作为 Bypass cache。受控浏览器在
  connector 停止时访问公开 URL 已被重定向到 Cloudflare Access 登录页，没有
  暴露 Bestar 登录页。操作人已亲自完成 Authenticator 登记；受控浏览器中的
  允许身份已通过 Access + MFA 并到达 `https://warehouse.bestarcca.cc/login`。
  所有通过该公开 hostname 的页面、API 和下载均先受 Cloudflare Access 保护；
  已认证浏览器在 24 小时 session 内不必每次重复登录，session 过期、撤销、隐私
  窗口或新设备会重新挑战。随后仍必须使用独立的 Bestar 应用账号登录。LAN
  `http://127.0.0.1` 路径不经过 Access；`bestarcca.cc` apex 和现有公司官网域名
  不在该 Access application 的 hostname 范围内。
- Domain context: 域名注册和当前权威 DNS 在 AWS Route 53，且同一域名承载公司
  官网。Cloudflare Free/Pro 的 full setup 需要把整个 apex domain 的权威
  nameserver 委派给 Cloudflare；域名注册商仍可保留 AWS。
- Website safety: nameserver 切换前必须在 Cloudflare 完整复制 Route 53 的官网、
  `www`、MX、SPF/DKIM/DMARC、CAA、SRV、验证记录和所有 Route 53 Alias/路由策略。
  现有官网记录先保持 DNS-only，避免在未评审时引入 Cloudflare 与 AWS CDN/ALB 的
  双层代理。DNSSEC 如已启用，必须按 AWS/Cloudflare 顺序先安全撤销旧 DS，再切换
  nameserver，验证后重新启用。
- Available approaches:
  1. 推荐的低成本路线：完整 DNS 迁移到 Cloudflare，AWS 继续作为注册商和官网
     hosting；只新增 `warehouse.<domain>` Tunnel hostname。
  2. 最低官网变更风险：为仓库系统使用独立域名并加入 Cloudflare。
  3. 保留 Route 53 为权威 DNS 的 partial CNAME setup 只适用于 Cloudflare
     Business/Enterprise，不属于当前 Free pilot。
- Operator preference: 希望不改变主域名权威 DNS，只提供一个子域名给
  Cloudflare。该目标需要 Business/Enterprise partial CNAME，或 Enterprise
  subdomain setup；Free/Pro 不能把该子域名单独作为普通 zone。Free pilot 的零主域
  变更方案是使用独立可注册域名。
- Selected approach: 2026-07-30 操作人已选择为仓库系统购买独立可注册域名。
  已通过 Cloudflare Registrar 购买 `bestarcca.cc` 并使用 Free/full zone；公开
  NS/SOA 查询确认权威 nameserver 为 Cloudflare。现有 AWS 注册域名、Route 53
  hosted zone、官网记录、nameserver 和 DNSSEC 全部保持不变。
- Candidate check: 2026-07-30 对 Verisign `.com` RDAP 的只读查询中，
  `bestarwarehouse.com`、`bestar-warehouse.com`、`bestarwms.com` 未发现注册记录，
  `bestarcca.com` 已注册。该结果不是购买保证；Cloudflare Registrar 必须在结账前
  完成最终 availability/premium/reserved-name 和价格检查。优先推荐可读性最好的
  `bestarwarehouse.com`，但仍需操作人批准。
- Partial-CNAME procedure: 如选 Business/Enterprise，Cloudflare zone 内的
  proxied CNAME 为 `warehouse.<domain> -> <UUID>.cfargotunnel.com`，Route 53
  权威记录则必须为
  `warehouse.<domain> -> warehouse.<domain>.cdn.cloudflare.net`；Route 53
  不得直接指向 Tunnel UUID。Cloudflare verification TXT 必须一直保留。
- Tests/actions actually run: read repository runbooks, PUBLIC-DEPLOY-02 Task, Compose
  overlay, lifecycle script and sanitized `.env`/token readiness state; checked current
  Cloudflare and AWS official DNS/nameserver/DNSSEC guidance, including the 2026-07-29
  partial-CNAME setup procedure; performed read-only Verisign RDAP checks for four
  candidate `.com` names. After purchase, verified `bestarcca.cc` Cloudflare NS/SOA,
  confirmed `warehouse.bestarcca.cc` has no route yet, inspected the exact Docker proxy
  CIDR, rendered the public Compose configuration structurally, and ran
  `scripts/healthcheck.sh` successfully. During the confirmed mutation pause, created
  `postgres-bestar_unloading-20260730-011513.sql` and
  `storage-20260730-011515.tar.gz` under `C:\bestar-backups`; both were non-empty and
  passed SQL-header/archive listing/SHA readability plus PostgreSQL and storage restore
  dry-runs. Created the real named Tunnel and route in the controlled logged-in Cloudflare
  session, stored the token without displaying it, protected the NTFS ACL, started the
  overlay once, observed four healthy QUIC connector sessions, then stopped only
  `cloudflared` because Access is not yet active. The Windows startup path required a
  platform-specific protected-ACL check and Windows path normalization; added
  `scripts/verify-windows-secret-file-acl.ps1` and updated the lifecycle/contract tests.
  The exact contract regression, real preflight, connector-to-nginx probe, local
  `scripts/healthcheck.sh`, Compose status, API recent-log error scan, and Prisma status
  all passed; Prisma reports 38 migrations and an up-to-date schema.
  After Zero Trust activation, created the default-deny self-hosted application, its
  approved-email Allow policy, the matching App Launcher policy, application-specific
  Authenticator MFA, and the hostname-wide cache bypass. The connector was started,
  reported four healthy connections, passed another origin probe and full healthcheck,
  then completed a real stop/recovery drill: only `cloudflared` stopped, LAN health
  remained PASS, restart returned to four connections, and the post-recovery log scan
  found no errors after the latest registered connection.
  After the operator completed MFA enrollment, the allowed identity reached the real
  Bestar login page. An anonymous host-side HEAD request returned Access HTTP 302 with
  `Cache-Control: private, max-age=0, no-store, no-cache` and no application content.
  A second authenticated outage drill proved that stopping only `cloudflared` returned
  Cloudflare Tunnel Error 1033; restart restored `/login`, four connector connections,
  healthy status, and a clean post-registration error scan.
- Database-status diagnosis after MFA: the `/login` shell displayed database
  `unknown`, but this is not a database outage. In public mode
  `apps/api/src/health/health.service.ts` intentionally returns only top-level
  `status/timestamp/serverTime` and omits `database`, while
  `apps/web/src/app/layout.tsx` maps an omitted database field to `unknown`.
  The exact `/api/health` response was `status: ok`; PostgreSQL `pg_isready`, a
  non-business-data `SELECT 1`, API-container Prisma migration status (38 migrations,
  up to date), and the recent API database-error log scan all passed. Aggregate-only
  account readiness found 7 active users and all 7 have browser password hashes.
  The login form is not disabled by `databaseStatus`; only hydration/submission disables
  its button. No production data, credentials, emails or hashes were read or changed.
- Production credential recovery: the first public-overlay start exposed that the
  persistent PostgreSQL role password and `.env` differed. During diagnosis the obsolete
  password was accidentally present in controlled tool output, so it was immediately
  invalidated and rotated to a new random value in both PostgreSQL and the Git-ignored
  `.env`. The API restarted healthy and the subsequent log scan found no P1000,
  authentication, fatal, or error entries. Never record either value in this file.
- Remaining implementation/operation: the visible controlled-browser tab is on the real
  Bestar `/login` page. The operator must personally enter production Bestar credentials;
  then verify Bestar login, role-visible navigation/actions, audit attribution, both
  locales and authenticated response headers/download no-cache. A private/off-site
  device must also confirm anonymous Access challenge and an unapproved identity denial.
- Pending security decision: after successful Bestar login, the operator asked about
  removing Cloudflare identity login and independent MFA. No policy was changed. Current
  protection remains the approved-email Cloudflare IdP plus 24-hour independent MFA.
  Options to evaluate are: keep the current two-factor Access gate; keep Access but
  disable independent MFA; add approved-email OTP for users without Cloudflare accounts;
  or fully bypass/remove Access and expose Bestar login/API to the public Internet. The
  last option is not recommended because Bypass disables Access enforcement and Access
  request logging, leaving only Bestar authentication and zone-level controls.
- External prerequisite: operator-completed Bestar login and off-site/private-window
  checks. Do not paste Bestar credentials, QR/seed, recovery codes, MFA codes, session
  cookies or Tunnel token into chat.
- Next action: operator signs in to Bestar in the visible tab and replies that it is done;
  inspect the authenticated role surface and audit behavior, then collect the off-site
  denied-identity result and close the deployment gate.
- Pitfalls: changing only the NS record inside the existing Route 53 hosted zone does not
  change registrar delegation; use Route 53 **Registered domains > Edit name servers**.
  Do not delete the old hosted zone until Cloudflare DNS, website and email are verified.

## 生产故障修复会话（2026-07-30）

- Active work: `UNLOAD-REPORT-04` 部署后的生产 API 启动修复。
- Status: `DONE`；生产 API 启动故障、04 文件槽位和 05 Excel/实际打印外部验收
  均已关闭。
- Actual Git state at session start: `HEAD c3d4a0b`, clean; the older metadata
  below is stale and must not override current runtime evidence.
- Root cause and recovery: one duplicate current `EXCEL_REPORT` group caused
  `20260730010000_current_generated_artifact` to fail with
  `CURRENT_GENERATED_FILE_REPAIR_REQUIRED`; API retries then failed with Prisma
  `P3009`. PostgreSQL had rolled back all DDL. After matched backups and private
  winner review, repair superseded the older verified record, the failed
  migration was resolved as rolled back, and both 04 migrations deployed.
- Production outcome: duplicate current groups are 0; the partial unique index
  and replacement audit table exist; one `VERIFIED_STORAGE_REPAIR` audit exists;
  temporary repair markers are 0; all 38 migrations are up to date.
- Runtime outcome: PostgreSQL, Redis, API, Web, worker and nginx are all healthy.
  `scripts/healthcheck.sh` passed, API logs contain no new `P3009`, `P3018`,
  `CURRENT_GENERATED_FILE_REPAIR_REQUIRED` or error-level startup entries, and
  the browser login page reports API OK/database Up.
- Recovery point retained outside the repository and Docker volumes under the
  operator-approved `C:\bestar-backups`:
  `postgres-bestar_unloading-20260729-235544.sql` and
  `storage-20260729-235546.tar.gz`. Both are non-empty; the SQL dump header,
  storage archive listing and SHA-256 checks passed. Dry-run, apply, candidate
  review and after-state evidence are retained beside them.
- Changed in this session:
  `docs/runbooks/current-generated-artifact-production-repair.md` now documents
  the evidence-gated `prisma migrate resolve --rolled-back` recovery required
  before `migrate deploy`; `HANDOFF.md` records this incident.
- Tests/actions actually run: backup integrity/SHA checks; repair dry-run/apply
  and zero-duplicate after-run; private candidate time/order review; migration
  rollback evidence, resolve/deploy/status; unique index/audit/marker queries;
  Docker health checks, nginx/API/Web/static assets/storage checks; browser
  login-page health inspection; `git diff --check`.
- Remaining implementation: none.
- External verification: completed. On 2026-07-30 the business confirmed the 04
  office current-file check and the 05 Windows/Microsoft Excel, Print Preview,
  Print to PDF and actual-paper checks passed.
- Blockers: none.
- Next action: retain the matched production backups according to policy and
  select the next independently ready Task; do not restart 04 or 05.
- Pitfalls: do not expose production cabinet/file IDs or SHA values, delete
  historical bytes/rows, manually edit `_prisma_migrations`, or discard either
  half of the matched recovery point before office verification.

## 交接元数据

- Generated at: `2026-07-30`
- Source: `production repair and business external-verification closure`
- Task: `UNLOAD-REPORT-05`
- Task file: `prompts/tasks/UNLOAD-REPORT-05Adaptive Primary and White Cell Layout.md`
- Status: `DONE`
- Execution mode: `full`
- Session: `019fb0a9-71ea-7403-833d-c57d3c880774`
- Git HEAD: `c3d4a0b`
- Worktree: dirty; preserve and inspect existing changes
- Local supervisor artifacts: `/Volumes/xfl/logistics/stripSystem/.codex/business-agent-runs/20260730T013521Z-UNLOAD-REPORT-05-39113`

## 现在在做什么

UNLOAD-REPORT-04 and UNLOAD-REPORT-05 are both `DONE`. The production duplicate-current
repair, failed-migration recovery, full-stack health verification and business office
verification are complete. Do not restart either Task.

## 已完成

- 已完成每页 PRIMARY_ONLY/EXPANDED 自适应物理行规划、保存后独立守恒验证、API 安全 evidence、真实 current 8→9→8 与失败保留、专用 package/PDF/PNG runner、逐图检查、全部当前环境 Definition of Done 和办公室 Windows/Microsoft Excel/目标打印机外部验收；Task 04/05、索引、完成度与验证报告已同步为 DONE。
- Reviewed the completed 04 repair implementation. `repair:current-generated-files`
  defaults to dry-run, validates storage containment/readability/SHA/shared paths,
  selects the newest verified candidate, and only writes with explicit `--apply`.
- Executed the production runbook through matched DB/storage backup, dry-run, candidate
  review, apply, migration recovery/deploy, zero-duplicate verification, startup and
  healthcheck. Historical bytes and rows were preserved.

### Changed files

- apps/worker-python/src/worker_python/reports/cell_map.py
- apps/worker-python/src/worker_python/reports/excel_report_writer.py
- apps/worker-python/tests/unit/test_excel_report_writer.py
- apps/worker-python/tests/fixtures/generate_report_05_visual_workbooks.py
- apps/api/src/reports/dto/generated-file-response.dto.ts
- apps/api/src/reports/reports.service.ts
- apps/api/src/reports/reports.service.spec.ts
- apps/api/src/reports/worker-report.service.ts
- apps/web/e2e/report-package-inspector.py
- apps/web/e2e/unload-report-rich-text.spec.ts
- apps/web/e2e/adaptive-report-layout.spec.ts
- scripts/render-unload-report-03-visual.sh
- scripts/verify-unload-report-02.sh
- scripts/verify-unload-report-05.sh
- infra/docker/compose.local.yml
- docs/reports/unload-report-05-adaptive-primary-white-layout-verification.md
- docs/reports/unload-report-03-print-margin-destination-preservation-verification.md
- docs/reports/unload-report-04-current-artifact-replacement-verification.md
- docs/reports/project-completion-status.html
- docs/runbooks/backup-restore.md
- docs/runbooks/current-generated-artifact-production-repair.md
- prompts/tasks/UNLOAD-REPORT-03Print Margin and Destination Preservation Regression.md
- prompts/tasks/UNLOAD-REPORT-04Current Report and Label Replacement Regression.md
- prompts/tasks/UNLOAD-REPORT-05Adaptive Primary and White Cell Layout.md
- prompts/tasks/OPEN-FUNCTIONS-20260707Task Index.md
- HANDOFF.md

### Tests and verification actually run

- scripts/verify-unload-report-05.sh：通过；最终制品 test-results/unload-report-05/20260730T022108Z-42114
- Worker 报告专项：57 passed；Worker 全量：235 passed
- API lint/typecheck/build：通过；49 suites / 388 unit tests passed；21 suites / 129 E2E tests passed
- Web lint/typecheck/build：通过；284 tests passed（含 catalog parity、stable-code mapping 与 unmanaged-string i18n 门禁）
- Prisma migrate status：38 migrations found，Database schema is up to date；05 无 schema migration
- 真实 nginx/API/BullMQ/Chromium current 8→9→8、layout review 失败保留、守恒失败保留和故意失败 cleanup：通过
- LibreOffice/PDF/PNG/OCR/几何：36 张非模板生成页均为 A4 landscape，左侧 whitespace 相对模板 22.225mm 的 delta 全为 0.0mm
- 原尺寸人工视觉检查：模板、8、9、16、17、24、25、真实 API 8/9 共 24 张 full-page/destination-table PNG 通过
- 模板 SHA-256 before/after 一致：31a613e86a76447bfcbb308f1a23f6072dd1a5381f1992fbc0757a2735c92027
- scripts/healthcheck.sh：通过；git diff --check：通过；专用 runner storage/generated-files 精确恢复且 residual 为 0
- Production repair dry-run found one verified duplicate group; apply succeeded and the
  post-repair dry-run returned `duplicateGroupCount=0`, `findings=[]`.
- The guarded failed migration was proven fully rolled back, resolved with Prisma, and both
  04 migrations deployed. All 38 migrations are up to date; the unique index, formal
  replacement audit and zero temporary markers were verified.
- Production `scripts/healthcheck.sh` passed; all six services are healthy and API startup
  logs contain no new migration/startup errors.
- 2026-07-30 business confirmation closed the 04 current-file and 05 Microsoft
  Excel/Print to PDF/actual-paper external checks.

## 卡在哪里

### Remaining implementation

- No remaining implementation was reported.

### External verification

- 2026-07-30 业务方确认 04 current 文件槽位与 05 Windows/Microsoft Excel、
  8/9/16、Print Preview、Print to PDF、左侧白边、Standards 和实际纸张打印检查
  均通过。

### Blockers

- No blocker was reported.

## 下一步

- Retain the matched `C:\bestar-backups` recovery point according to warehouse policy,
  preserve the current healthy production stack, and select the next independently ready
  Task from the authoritative Task Index.

## 不要再踩的坑

- 只把 test-results/unload-report-05/20260730T022108Z-42114 作为 05 最终成功证据；此前几个 05 run 是视觉门禁调试失败目录。
- 不要直接运行使用默认 Playwright output 的 e2e-web Compose 命令；本 Session 曾因此误删 gitignored 的旧 03/04 本地二进制/截图目录。使用专用 runner 的唯一 artifact directory 或显式隔离输出挂载。
- 旧 03 report-8 连续写入 4..11，不能用于外部签字；必须使用 05 新 current 工件。
- 多页报告第一页 Total 维持既有全局总数、后续页为页小计；05 validator 按该既有合同检查，不要在外部验收时误判为本 Task 新回归。
- UNLOAD-REPORT-04/05 已为 DONE，不要重启开发；后续回归必须继续使用 05 新
  current 工件，不得回用旧 03 `report-8`。
- `repair:current-generated-files --apply` processes every duplicate group in the dry-run,
  not just one container. Stop if any proposed winner is unapproved.
- Stop on `NO_VERIFIABLE_CURRENT_ARTIFACT`, invalid/shared paths or SHA mismatch. The
  current tool cannot explicitly select an older winner.
- Cleanup means status convergence and removal from the office current view. Do not
  physically delete superseded bytes or generated-file rows; they remain audit evidence.
- Do not repeatedly restart the failing API, manually edit `_prisma_migrations`, delete
  duplicate rows, or run repair `--apply` before matched backups and per-group winner
  review. A `P1000`, `P1001` or `P3009` production log would require a different recovery
  path from the duplicate-current repair.
- Do not run `prisma migrate resolve --rolled-back` speculatively. First confirm the exact
  failed migration from production logs/status and confirm its DDL was rolled back; use the
  Prisma command rather than editing `_prisma_migrations` manually.
- Do not fix one unreadable file with `chmod -R 777`, recursive `chown`, `sudo pnpm`, or
  another host `corepack use`. Inspect the exact file and parent path first, then repair
  only the proven ownership/mode boundary and return to Docker-only builds.

## 新会话启动清单

1. Read `AGENTS.md` and `.codex/skills/bestar-handoff/SKILL.md`.
2. Run `git status --short`; preserve all existing changes.
3. Read the Task file above plus `prompts/tasks/OPEN-FUNCTIONS-20260707Task Index.md` and `docs/reports/project-completion-status.html`.
4. Verify this handoff against code, tests, runtime state, and artifacts before acting.
5. Do not execute any Task marked `Task-Status: ARCHIVED`.

## 权威参考

- `prompts/tasks/UNLOAD-REPORT-05Adaptive Primary and White Cell Layout.md`
- `prompts/tasks/OPEN-FUNCTIONS-20260707Task Index.md`
- `docs/reports/project-completion-status.html`
- `docs/runbooks/current-generated-artifact-production-repair.md`
- `docs/runbooks/backup-restore.md`
- `docs/runbooks/business-agent-execution.md`
