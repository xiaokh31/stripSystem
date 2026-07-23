# 执行 PUBLIC-DEPLOY-01：Public Internet Security Baseline

## 优先级与执行边界

- 优先级：P0，任何公网 Tunnel 或云主机部署之前的强制前置任务。
- 只执行本 Task；使用一个 fresh supervisor Session。不得同时启动 Cloudflare 或 OCI Task。
- 本任务建立公网运行模式、浏览器会话、CSRF、代理信任、限流、安全响应和 i18n 基线，不创建云账号、域名、
  Tunnel 或 OCI 资源。
- 允许为可撤销浏览器 session 增加 Prisma schema/migration；不得改变 Native access/refresh token 的既有
  contract、400 天持久登录产品目标、业务 RBAC、库存、扫码、工资或文件生成规则。
- 保留工作区已有未提交修改，不得 reset、checkout、覆盖或清理真实数据库、`storage/`、样本和备份。

## 对应产品需求

授权办公室人员需要在公司外通过公网使用系统，不能依赖公司固定公网 IP 或主机固定 LAN IP。公网开放前必须防止
当前长生命周期、JavaScript 可读的 browser bearer token 和本地开发默认配置被原样暴露到 Internet。

## 必须读取

- `AGENTS.md`、`HANDOFF.md`、`CONTEXT.md`
- `prompts/agents/business-logic-agent.md`
- `.codex/skills/bestar-handoff/SKILL.md`
- `.codex/skills/docker-local-deploy/SKILL.md`
- `.codex/skills/auth-rbac/SKILL.md`
- `.codex/skills/nestjs-prisma-api/SKILL.md`
- `.codex/skills/nextjs-pwa-ui/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- `docs/adr/0005-single-writer-public-access-and-cloud-hosting.md`
- `docs/runbooks/public-access-and-free-cloud-deployment.md`
- `docs/runbooks/local-deployment.md`
- `docs/runbooks/account-role-permission-management.md`
- `infra/docker/compose.local.yml`、`infra/nginx/nginx.conf`、`.env.example`
- 现有 Web/API/Native auth、cookie、JWT、refresh session、rate limit、audit、CORS、proxy 和 i18n 实现及测试

## 已确认现状与风险

1. Web 当前把长生命周期 JWT 写入 JavaScript 可读 cookie，并由 `ApiClient` 加到 `Authorization` header；公网
   场景的 XSS 可直接读取该 token。
2. 默认 browser session 为 400 天。持久登录需求必须保留，但公网版本需要服务端可撤销、rotation/reuse detection
   和 secure HttpOnly cookie，不能继续依赖不可撤销的单一长 JWT。
3. 本地 `.env.example` 和 Compose 面向 LAN；公网模式不能接受默认 JWT secret、任意/HTTP origin、错误 public URL、
   非 HTTPS cookie 或直接暴露 PostgreSQL/Redis。
4. 代理后的 client IP、scheme 和 host 只有在请求来自明确 trusted proxy 时才能采信；不得信任公网客户端伪造的
   `X-Forwarded-*`、`CF-Connecting-IP` 或 Access headers。
5. 公网登录、refresh 和鉴权失败需要分布式 Redis 限流与稳定错误码；不能使用只在单进程内有效的计数器。

## 权威安全与业务规则

1. 增加显式 public deployment mode。建议使用清晰环境变量，例如：
   - `PUBLIC_DEPLOYMENT_ENABLED=true`
   - `PUBLIC_BASE_URL=https://warehouse.example.com`
   - `TRUSTED_PROXY_MODE=cloudflare-tunnel`
   最终命名可适配现有 config pattern，但 API、Web、nginx、文档和自动检查必须一致。
2. public mode 必须 fail closed：非 HTTPS public URL、default/placeholder JWT secret、空/通配 CORS、错误 cookie
   security、未配置 trusted proxy 或其他危险组合应阻止启动并输出不含 secret 的稳定诊断。
3. 浏览器使用同源、server-set 的 secure HttpOnly session：
   - 短生命周期 access cookie；
   - 最长产品期限仍可配置到 400 天的 opaque refresh/session cookie；
   - 服务端只保存 refresh secret 的安全 hash，并记录 session id、user、created/last-used/expires/revoked、
     设备摘要和审计 actor；
   - refresh rotation、并发幂等边界、旧 token reuse detection、logout、管理员 revoke、账号 inactive、密码/
     权限变化按既有策略立即或可预测失效；
   - cookie 至少为 `HttpOnly; Secure; SameSite=Lax`，使用最窄合理 Path，不得放入 localStorage/sessionStorage、
     Client Component props、DOM、日志或错误响应。
4. Native App 保持现有 bearer access + native refresh/secure-store contract，不得被 browser cookie 改造破坏。
   Browser 登录响应不得把 browser refresh secret 暴露给 JavaScript。
5. 所有使用 cookie 鉴权的非安全方法必须同时验证 exact allowed `Origin`/`Referer` 和不可预测 CSRF token/header；
   缺失、过期、跨 origin 或不匹配请求 fail closed。GET/HEAD 不得产生业务 mutation。
6. 登录、browser refresh、忘记/重置类端点和连续失败按 canonical client identity 使用 Redis-backed 限流；跨 API
   container/重启仍生效。返回统一稳定 code 和泛化用户文案，不泄露账号是否存在、密码、token、内部地址或 stack。
7. public mode 只允许显式 HTTPS origin。预检、credentials、Web SSR/server fetch 和 nginx `/api` 同源代理正常；
   不通过 `*` 或反射任意 Origin 解决 CORS。
8. 设置并测试适合当前 Next/API/下载行为的 CSP、HSTS（仅 public HTTPS）、`X-Content-Type-Options`、
   `Referrer-Policy`、frame protection/`frame-ancestors` 和最小 `Permissions-Policy`。不得以宽泛 `unsafe-eval`、
   `unsafe-inline` 或关闭浏览器保护作为修复。
9. `/health` 和公网错误页只能返回必要状态，不暴露数据库 URL、Redis、storage path、版本细节、secret 或 stack trace。
10. 保留一个明确的 local/LAN mode，现有 Docker-only 开发、LAN browser、Native scan 和测试无需公网凭据即可运行。

## 实现要求

### 1. 配置和启动校验

- 以 typed config/schema 集中解析 public URL、origins、cookie、proxy、session 和 rate-limit 配置；不要在多个模块
  复制字符串判断。
- 增加 provider-neutral public base Compose/config（不包含 Tunnel 或 OCI credential），作为后续 02/03 的共同基础；
  只允许 nginx ingress，PostgreSQL/Redis/API internal ports 不得对公网 binding，且不得改变 local/LAN profile。
- 更新 `.env.example` 只提供无 secret 的占位和说明；不得写真实域名凭据或 tunnel token。
- 增加程序化 public deployment contract check，验证 dangerous config 会失败、local mode 保持兼容、public profile
  不公开 PostgreSQL/Redis/API internal ports。

### 2. Browser session migration

- 优先复用并深化 NATIVE-AUTH 已有 refresh-session domain service，而不是创建第二套行为冲突的 token 规则；Browser
  与 Native 可以有不同 delivery contract，但 revocation/audit semantics 必须清晰。
- Prisma 变更必须有 migration、唯一/索引/expiry/revocation 约束和并发测试；不得存 plaintext refresh token。
- Web middleware、server components、API client、login/logout、401 refresh/retry 必须适配 HttpOnly cookie；并发 401
  最多触发一个有效 refresh flow，mutation 不得重复提交。
- 迁移发布时旧 browser bearer cookie 要安全清除或一次性升级，不能造成无限登录循环或把旧 token 留在 JS 可读位置。

### 3. Proxy、审计和限流

- 只有来自配置的内部 proxy/tunnel network 才解析 forwarded scheme/host/client IP；direct request 的伪造 headers 不得
  改变 secure 判断、rate-limit key 或 audit IP。
- 登录成功/失败、refresh、reuse、logout、revoke、CSRF rejection、rate limit 和 public startup refusal 使用 stable
  event/error code；日志脱敏，不记录 cookie/JWT/CSRF token/password。
- Redis 不可用时，公网 auth mutation 必须采用有文档的 fail-closed 或严格降级策略，不能静默取消限流。

### 4. 文档

- 更新账号、部署、备份/恢复和公网 runbook，说明 local/public mode、400 天上限、revocation、cookie、CSRF、
  trusted proxy、Access 外层身份与应用 RBAC 内层身份的职责。
- 明确外层 Access/MFA session 可以独立过期并要求重新认证；不得把应用 400 天上限宣传成 400 天无需再次验证的
  公网访问保证。
- 增加 key rotation/revocation 和 incident response 手工步骤；不得建议直接清数据库 session 表或删除审计。

## i18n 100% 硬门禁

1. 所有新增 login/session expired/revoked/rate limited/CSRF/public config/upload/proxy failure 的用户可见文案、toast、
   aria/live、页面标题和按钮进入 typed `en` / `zh-CN` catalogs。
2. API 只返回 stable code、enum、field 和 raw source data，不返回拼接英文 UI 句子；Web 按 locale 解析。
3. English 只显示 English，中文只显示中文；SSR first frame、hydration、refresh、401 automatic refresh、logout、
   Access return navigation 和 locale switch 不得英文闪现、raw code、missing key 或双语同屏。
4. 不新增 DOM translation walker、CSS 隐藏文本、宽泛 i18n 豁免或硬编码中英文 JSX。
5. 用户/邮箱/域名/IP/time 等业务原始值保持原值，不将 raw source data 当作漏翻译。

## 测试与证据

1. API unit/E2E：browser login cookie flags、refresh rotation/reuse/concurrency、logout/revoke/inactive、400 天配置边界、
   Native bearer regression、CSRF/Origin 正负向、CORS、trusted/untrusted proxy、Redis rate limit 跨实例语义、日志脱敏。
2. Migration：现有库 apply/status 和空库全量 deploy；验证 plaintext token 不落库。
3. Web unit/render：HttpOnly flow 下 login/middleware/API retry，无 token 进入 Client props/DOM/storage，mutation 不重复。
4. Chromium 经 nginx 覆盖 ADMIN/OFFICE/HR_MANAGER/WAREHOUSE_MANAGER、en/zh-CN、login-refresh-reload-logout、
   forbidden role、CSRF negative、rate-limit、320/390/1366、200% zoom、light/dark；console/pageerror/hydration/
   missing translation/failed unexpected request 为 0。
5. 使用自动检查证明响应 headers、CSP/HSTS public-only、health redaction、default secret/HTTP/wildcard CORS startup
   rejection 和 local mode compatibility。
6. 运行 Docker full-stack health、核心 import/report/download、inventory/scan、work-hours/unloading-wage smoke，确保安全
   改造未切断业务主链。

## Docker 验证基线

```bash
docker compose -f infra/docker/compose.local.yml up -d --build
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api lint
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api typecheck
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api test -- --runInBand
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api test:e2e -- --runInBand
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api prisma migrate status
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web lint
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web typecheck
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web test
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web build
docker compose -f infra/docker/compose.local.yml --profile e2e build e2e-web
scripts/healthcheck.sh
git diff --check
```

业务 Agent 必须按真实 package scripts 调整命令参数，不能因示例参数差异跳过测试。

## 验收标准

1. public mode 对不安全配置 fail closed，local/LAN mode 和 Native auth 保持正常。
2. browser refresh/session secret 只存在于 secure HttpOnly cookie 和服务端 hash；JS、DOM、storage、日志、API body
   和数据库 plaintext 均不存在。
3. 最长持久登录仍可配置到 400 天，同时支持 rotation、reuse detection、logout、管理员 revoke、inactive 和可审计失效。
4. cookie mutation 的 CSRF/Origin 防护、Redis 分布式限流、trusted proxy 和 stable audit code 有正负向证据。
5. HTTPS security headers、CORS、health/error redaction 和 public network contract 通过自动检查。
6. strict en/zh-CN、SSR/hydration、RBAC、核心业务 smoke、Docker lint/typecheck/unit/E2E/build/migration/health 全通过。
7. 无真实 secret、客户/员工数据或公网资源写入仓库；文档、Task Index、完成度报告和 `HANDOFF.md` 同步真实终态。

## 非目标

- 不创建 Cloudflare/OCI 账号、domain、DNS、Tunnel、VM 或云 volume。
- 不实现 local/cloud active-active、数据同步、离线双写或多数据库 failover。
- 不修改库存、托盘、解析、报告、标签、工时或拆柜工资业务规则。
- 不接入新的企业 SSO；Cloudflare Access 是后续公网外层 gate，应用本地账号/RBAC 继续保留。

## 完成输出

- 列出 schema/migration、auth/proxy/rate-limit/header/i18n、Web 和文档 changed files。
- 列出实际测试、精确 counts、public negative cases 和核心业务回归结果。
- 明确浏览器与 Native session contract、400 天持久性、revocation 和旧 cookie migration 行为。
- 无剩余实现时返回 `DONE`。只有真实域名/Cloudflare/OCI 外部操作不得放进本 Task，也不能据此提前返回 pending。
- 下一步只能由最新 Task Index 选择 `PUBLIC-DEPLOY-02` 或经产品明确决定选择 `PUBLIC-DEPLOY-03`，本 Session
  不得自行开始下一 Task。
