# 执行 PUBLIC-DEPLOY-04：Public Domain and LAN IP Login Coexistence Regression

## 优先级与执行状态

- 优先级：P0。Named Tunnel 公网域名可登录，但同一部署经局域网 IP 打开时无法登录，
  与“公网故障时 LAN 业务继续”的既有承诺冲突。
- Task-Status: CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING
- 前置任务：PUBLIC-DEPLOY-01 保持 `DONE`；PUBLIC-DEPLOY-02 的仓库实现与真实 Named
  Tunnel 保留，不重跑旧 Task。本 Task 是新发现的双入口回归，完成前不能再以旧证据
  宣称 public mode 下 LAN login healthy。
- Access 当前是否启用属于独立现场安全决定；本 Task 不自动创建、删除、绕过或恢复
  Cloudflare Access policy。
- 只执行本 Task。达到终态后更新本文件、PUBLIC-DEPLOY-02 状态说明、Task Index、
  完成度报告、双语 runbook、专项验证报告和 `HANDOFF.md`。

## 用户报告

启用 Cloudflare Named Tunnel 后：

- 使用公网域名可以登录 Bestar；
- 使用局域网 IP 打开同一个网站，无法登录 Bestar。

## 已确认的配置冲突

当前 public overlay 同时存在以下全局规则：

1. `PUBLIC_DEPLOYMENT_ENABLED=true` 时 `CORS_ORIGINS` 只允许 HTTPS origin；
2. `BROWSER_COOKIE_SECURE=true` 对所有入口统一写 `Secure` session cookie；
3. `nginx.public.conf` 对所有请求硬编码 `X-Forwarded-Proto https`；
4. public overlay 只把 nginx 发布到 loopback port，runbook 却仍声明 LAN login 可用。

公网 HTTPS 需要这些安全约束，但局域网 `http://<private-ip>` 浏览器不会接受/发送
`Secure` cookie，且其 Origin 也不在 HTTPS allowlist。不能通过全局关闭 Secure cookie、
`CORS_ORIGINS=*` 或信任任意 forwarded header 来修复。

## 产品决策与业务合同

1. 同一 canonical PostgreSQL + `storage/` writer 同时提供两个隔离入口：
   - Public：批准的 `https://<public-host>`，经 Cloudflare Named Tunnel；
   - LAN：显式配置的 `http://<private-ip-or-lan-host>`，仅仓库私网/主机防火墙可达。
2. 两个 origin 均使用 Bestar browser session、CSRF、RBAC、rate limit 和 audit；用户可在
   任一入口独立登录、刷新、持久化和退出。
3. Public response 的 auth cookies 始终 `Secure; HttpOnly; SameSite=Lax`（CSRF cookie
   按既有设计可被 Web 读取），不得因 LAN 兼容而降级。
4. LAN HTTP 入口只在显式 opt-in、精确 allowlist、受信 nginx ingress 和 private/LAN
   host 下使用 non-Secure host-only cookies。文档必须说明局域网 HTTP 无传输加密风险，
   要求可信仓库网络与防火墙；不能把它开放到 Internet。
5. Public 和 LAN 是不同 origin/host-only cookie jars。一次登录不要求自动共享到另一
   origin；各自登录后会话都按现有最长 400 天政策持续，直到主动退出、管理员撤销、
   账号停用或到期。
6. Tunnel/Internet 停止时，LAN login、业务操作、生成和下载继续；LAN 停止或错误
   Host 不得影响 public login。两边仍操作同一数据库/storage，不建立 replica 或
   active-active。

## 必须读取与使用

- `AGENTS.md`、`HANDOFF.md`
- `prompts/agents/business-logic-agent.md`
- `prompts/tasks/PUBLIC-DEPLOY-01Public Internet Security Baseline.md`
- `prompts/tasks/PUBLIC-DEPLOY-02Cloudflare Tunnel Local Canonical Pilot.md`
- `docs/adr/0005-single-writer-public-access-and-cloud-hosting.md`
- `docs/runbooks/cloudflare-named-tunnel-deployment.md`
- `docs/runbooks/local-deployment.md`
- `docs/runbooks/deploy-windows.md`
- `.codex/skills/bestar-handoff/SKILL.md`
- `.agents/skills/diagnosing-bugs/SKILL.md`
- `.codex/skills/auth-rbac/SKILL.md`
- `.codex/skills/docker-local-deploy/SKILL.md`
- `.codex/skills/nestjs-prisma-api/SKILL.md`
- `.codex/skills/nextjs-pwa-ui/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- `apps/api/src/config/public-deployment.config.ts`
- `apps/api/src/auth/browser-cookie.ts`
- `apps/api/src/auth/browser-session.service.ts`
- `apps/api/src/auth/browser-csrf.guard.ts`
- `apps/api/src/common/trusted-proxy.ts`
- `apps/api/src/app.setup.ts`
- `apps/web/src/middleware.ts`、`apps/web/src/lib/server-auth.ts`
- `infra/docker/compose.local.yml`、`infra/docker/compose.public.yml`
- `infra/nginx/nginx.conf`、`infra/nginx/nginx.public.conf`
- Cloudflare lifecycle/contract scripts；不得读取或输出 Tunnel token

## 修改前红灯复现

建立一个专用、无真实 Cloudflare credential 的 dual-ingress Docker repro：

1. 同一 stack 创建 public-host equivalent 和 LAN-IP equivalent 两个浏览器 origin。
2. Public origin 登录成功，断言四类 cookie 的 Secure/path/expiry 属性；LAN origin 提交
   同一合法账号，复现 `CSRF_ORIGIN_REJECTED`、cookie 被丢弃或登录后仍回 `/login` 的
   用户原始症状。
3. 分别记录 request `Host`、`Origin`、可信 peer、有效 protocol、ingress class、
   response status/stable code 和 Set-Cookie attributes；不记录账号、cookie value、JWT、
   refresh token、CSRF token、Tunnel token 或公网身份。
4. 明确区分 Origin rejection、Secure cookie、wrong forwarded proto、middleware 和
   nginx port/bind 五个边界；不能只看页面现象后同时放宽所有配置。
5. 把最小 repro 固定为 failing integration/Chromium test，修复后重新运行 public + LAN
   原始矩阵和 tunnel outage drill。

## 实现要求

### 1. 显式双入口配置

1. 保留唯一 `PUBLIC_BASE_URL`，新增明确的 LAN browser origin/host 配置（名称可按现有
   风格确定，例如 `LAN_BROWSER_ORIGINS`），禁止 wildcard、CIDR 直接充当 browser
   Origin 或从任意请求自动学习 host。
2. Public origin 必须是 HTTPS、无 userinfo/path/query/hash；LAN origin 只允许
   `http://localhost`、loopback 或 RFC1918/批准的内部 hostname，并要求显式启用。
3. 配置启动时 fail closed：重复/冲突 origin、public HTTP、LAN public IP、`*`、
   malformed URL、缺少 trusted ingress/CIDR、LAN 与 public host 混用均拒绝并返回稳定
   config code。`.env.example` 只写占位说明，不写真实生产 IP/hostname/secret。
4. CORS 对 credentials 使用 exact origins；不能返回 `*`。由于 Web/API 同源，正常
   browser flow 不应依赖跨 origin token 转发。

### 2. 可信 ingress 与 protocol 分类

1. nginx/Compose 必须让 public Tunnel 和 LAN listener 可被 API 区分，推荐使用独立
   internal listener/server block 或等价深度实现：
   - public listener 仅 loopback/Tunnel connector 可达，effective scheme 为 HTTPS；
   - LAN listener 绑定批准的 LAN interface/port，effective scheme 为 HTTP；
   - PostgreSQL、Redis、API internal port 仍不对公网或 LAN 直接发布。
2. ingress marker、`X-Forwarded-Proto`、`Host`、`CF-Connecting-IP` 只在 direct peer
   属于配置的 trusted nginx/proxy CIDR 时可信。客户端伪造这些 headers 必须被覆盖或
   拒绝，不能借此取得 public Secure policy 或绕过 LAN allowlist。
3. Public nginx 继续 no-store、安全 headers、上传限制和 Tunnel-only route；LAN HTTP
   不发送误导性的 HSTS/HTTPS forwarded proto。两条 ingress 都只代理同一 Web/API。
4. 主机防火墙只允许批准 LAN ranges 访问 LAN listener；Tunnel connector 只访问 public
   internal listener。更新 contract script 证明端口、network、secret 和 single-writer
   约束。

### 3. Request-aware browser cookie policy

1. `setBrowserSessionCookies`、refresh、logout/clear 和 legacy-cookie cleanup 使用同一
   经验证 request ingress policy：public cookies `secure=true`，LAN cookies
   `secure=false`。不能只修 login 而 refresh/logout 清错属性。
2. cookies 保持 host-only（不设置共享 `Domain`）、既有 path、SameSite、HttpOnly 和
   400-day absolute/idle session contract；LAN/public cookie value 和 session id 不共享。
3. API response body、日志和 audit 不包含 cookie/token。audit 可记录稳定 ingress type
   和 hashed client address，用于区分 LAN/public login，不记录真实 secret。
4. refresh rotation、reuse detection、concurrent refresh grace、logout、admin revoke、
   inactive user 和 JWT access expiry在两个入口行为一致。

### 4. Origin、CSRF、Web middleware

1. login、refresh、logout 和所有 browser mutation 对照 ingress class 验证 exact
   Origin/Referer：public request 只接受 public origin，LAN request 只接受对应 LAN
   origin。不能因为两个 origin 都在全局 list 中允许 public ingress 携带 LAN Origin。
2. 缺失、malformed、cross-origin、wrong-host、wrong-port、HTTP public、HTTPS-spoofed LAN
   全部 fail closed，返回稳定 code并写安全审计。
3. Web middleware/server auth 必须识别两边同名 host-only browser cookie；不能因
   `PUBLIC_DEPLOYMENT_ENABLED=true` 在 LAN 回退到 legacy bearer cookie 或登录循环。
4. locale/theme/session hint 在两个 origin 独立持久化；中文 refresh 不闪英文。

### 5. 部署与回滚

1. 更新 Named Tunnel 中英文 runbook，增加 public+LAN 拓扑、配置表、Windows Docker
   host 防火墙、启动/停止、双入口登录、cookie inspection、Tunnel outage 和 rollback。
2. 不在文档写真实域名、LAN IP、账号、邮箱、Cookie、Tunnel token 或 MFA secret。
3. 生产 apply 前建立 PostgreSQL + storage matched backup；本 Task 预计无需业务 migration，
   若实际 schema 变化必须说明原因并通过现有/空库 gate。
4. 回滚只能停用 LAN listener/配置或恢复前一镜像；不得关闭 public Secure cookie、公开
   API/DB/Redis、删除 Tunnel/DNS/Access state 或建立第二 writer。

## Strict i18n 硬门禁

1. 新增 LAN origin rejected、untrusted ingress、session unavailable、configuration
   help、login/refresh/logout failure 等应用内 visible copy 全部进入 typed `en` /
   `zh-CN` catalog。
2. API 返回 stable code/enum/raw ingress type，不返回直接显示的 English sentence；
   provider-owned Cloudflare 页面另行记录，不伪称由应用 catalog 控制。
3. English 只显示 English，中文只显示中文；public/LAN 登录、refresh、session expiry、
   401 return、logout 和 locale switch 不得显示 raw code、双语拼接或英文闪现。
4. UI 不显示内部 IP、proxy CIDR、Compose service/listener、cookie flags、token、storage
   path 或“请修改代码/环境变量”之类技术提示。
5. catalog parity、unmanaged-string、stable-code mapping、SSR/hydration/no-flash gate
   必须通过。

## 必须新增/更新的测试

### Config / API / security

1. valid public HTTPS + explicit private LAN HTTP profile 启动成功；public HTTP、LAN public
   IP、wildcard、malformed、missing trusted proxy、origin/host mismatch 均 fail closed。
2. Public login/refresh/logout cookie attributes始终 Secure；LAN 同流程 cookies 仅在批准
   LAN ingress 为 non-Secure。所有 clear-cookie attributes 与 set 对称。
3. public ingress + LAN Origin、LAN ingress + public Origin、wrong port/host、missing Origin、
   spoofed ingress/proto/CF headers、untrusted peer 均拒绝。
4. 两边 session rotation、400-day max、revocation、inactive user、RBAC、CSRF mutation、
   rate limit和audit attribution通过；cookie/session value不出现在日志。
5. nginx/Compose contract 证明 public listener 只给 Tunnel/loopback、LAN listener 只给
   host/LAN、API/DB/Redis 无直接 host exposure、storage/DB single writer 不变。

### Chromium / outage

1. 同一 browser project 使用两个独立 context：public-host equivalent 登录、reload、
   protected page、mutation、logout；LAN-IP equivalent 重复完整流程。
2. 验证登录一边不自动认证另一边；分别登录后都可持续 refresh。任一 logout 不错误
   清除另一 host cookie/session。
3. en/zh-CN、light/dark、390/1366、200% zoom；login error、refresh、RBAC denied、locale
   switch 无 mixed language、flash、overflow、console/pageerror/hydration/missing key。
4. stop `cloudflared`/public equivalent 后 public fail closed，LAN 已登录 session、重新
   登录、生成和下载继续；恢复 Tunnel 后 public 返回且无 duplicate business mutation。
5. stop LAN listener 不影响 public；错误 Host/Origin 从 LAN/public 都不能取得 session。
6. 外部最终验收必须在真实公网域名和真实仓库 LAN IP 各使用隐私窗口登录，并检查
   cookies、RBAC、logout、refresh。无目标主机/现场 LAN 时，先完成全部自动化，只能
   返回 `CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING`。

## Docker-only 验证

```bash
docker compose -f infra/docker/compose.local.yml up -d --build
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api lint
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api typecheck
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api test --runInBand
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api test:e2e --runInBand
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web lint
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web typecheck
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web test
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web build
docker compose -f infra/docker/compose.local.yml exec -T worker-python uv run pytest
scripts/verify-cloudflare-tunnel-contract.sh
scripts/healthcheck.sh
git diff --check
```

新增 PUBLIC-DEPLOY-04 dual-ingress runner，使用 synthetic hostnames/private test IP 和
脱敏 manifest，不需要真实 Cloudflare token即可完成仓库门禁。真实生产激活只补外部
证据，不能替代自动化。

## 验收标准

1. 同一 public-mode stack 经批准公网 HTTPS 域名和批准局域网 IP 均可独立登录、刷新、
   使用、持久化和退出。
2. Public auth cookies始终 Secure；LAN compatibility 不放宽 public CORS/Origin、Cookie、
   trusted proxy、rate limit或security headers。
3. ingress/protocol/host/origin 分类可验证且防 spoof；API/DB/Redis 不暴露，DB/storage
   仍为唯一 writer。
4. Tunnel/Internet 中断时 LAN login和业务继续，恢复无重复 mutation；LAN 故障不影响
   public。
5. strict en/zh-CN、no-flash、RBAC、audit、400-day session、responsive/a11y 和 secret
   redaction 全部通过。
6. Docker API/Web/Worker、config/security、dual Chromium、outage、backup/rollback、
   healthcheck 和 diff check 通过。
7. 生成 `docs/reports/public-deploy-04-dual-origin-login-verification.md`，更新中英文 Named
   Tunnel runbook、PUBLIC-DEPLOY-02 状态说明、Task Index、completion report 和 handoff。
8. 真实公网域名 + 真实 LAN IP 外部矩阵关闭后 `DONE`；否则只能准确结束为
   `CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING`。

## 非目标

- 不关闭 public Secure cookie，不使用 `CORS_ORIGINS=*`，不信任任意 forwarded header。
- 不让 LAN HTTP listener 暴露到公网，不开启 router port forwarding。
- 不自动共享 public 与 LAN cookies，不承诺一次登录覆盖两个 origin。
- 不创建第二数据库/storage writer、cloud replica 或 active-active。
- 不自动修改 Cloudflare Access、DNS、Tunnel token、MFA 或 cache policy。
- 不修改 Native App auth、业务权限、Excel parser、工资或库存规则。

## 2026-08-02 实施终态证据

- 仓库实现和当前环境自动化已完成；真实公网域名与真实仓库 LAN IP 的现场矩阵仍是
  外部门禁，因此本 Task 为 `CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING`，不是 `DONE`。
- 修复前聚焦配置测试为 1 failed / 10 passed；修复后 ingress/config/cookie/trusted
  proxy 聚焦测试 4 suites / 35 tests 通过。
- Docker API lint、typecheck、52 suites / 429 unit tests、21 suites / 131 E2E tests、
  production build 通过；Web lint、typecheck、285 unit tests、production build 通过；
  Worker 247 tests 通过。
- PUBLIC-DEPLOY-04 runner 在无真实 Cloudflare credential 下完成 public HTTPS + LAN HTTP
  独立会话、refresh/logout、en/zh-CN、light/dark、390/1366、真实 Chromium 200% zoom、
  cross-origin/wrong-host 拒绝、public edge 中断期间 LAN 导入/解析/生成/下载、edge 恢复，
  以及取消 LAN host publication 时 public 登录保持正常；全部阶段通过。
- 专项 runner 在清理前机器断言 public/LAN 成功登录与两类受拒请求均带正确 ingress audit
  metadata；未把代码存在性当作审计归属证据。
- public deployment/Tunnel 正负向合同、Tunnel 本地故障演练、39 migrations up to date、
  full-stack healthcheck 与 `git diff --check` 通过。专项 runner 最终清理后任务导入、用户、
  session、auth audit 与 task-named storage artifact 残留均为 0。
- 当前环境未使用或输出 Tunnel token、真实域名/IP、Cookie/token value、账号或客户数据；
  未修改 Prisma schema，不需要 migration。
- 终态报告：`docs/reports/public-deploy-04-dual-origin-login-verification.md`。
