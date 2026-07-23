# 执行 PUBLIC-DEPLOY-02：Cloudflare Tunnel Local Canonical Pilot

## 优先级与前置条件

- 优先级：P1，推荐的首条公网 pilot 路线。
- 前置任务：`PUBLIC-DEPLOY-01Public Internet Security Baseline.md` 必须达到 `DONE`。
- 一个 fresh supervisor Session 只执行本 Task。不得同时启动 OCI migration，不得创建第二个可写系统。
- 本任务交付可审查的 Cloudflare named tunnel Docker profile、配置验证、运维文档和自动化；真实 Cloudflare
  account/domain/Access policy 的外部激活可以在全部仓库实现通过后保留为明确 external verification gate。
- 保留现有 local/LAN Docker 入口和唯一 PostgreSQL + `storage/`；Tunnel 故障时仓库 LAN 工作流必须继续可用。

## 对应产品需求

公司外授权人员需要通过稳定公网域名访问系统，公司公网 IP 或主机 LAN IP 变化不能要求修改访问地址。首个 pilot
保持公司 Docker 主机为唯一权威写入点，通过 outbound-only named tunnel 暴露 nginx，并以 Cloudflare Access + 应用
RBAC 两层控制访问。

## 必须读取

- `AGENTS.md`、`HANDOFF.md`、`CONTEXT.md`
- `prompts/agents/business-logic-agent.md`
- `.codex/skills/bestar-handoff/SKILL.md`
- `.codex/skills/docker-local-deploy/SKILL.md`
- `.codex/skills/auth-rbac/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- `docs/adr/0005-single-writer-public-access-and-cloud-hosting.md`
- `docs/runbooks/public-access-and-free-cloud-deployment.md`
- `docs/runbooks/production-deployment-beginner-guide.md`
- `docs/runbooks/backup-restore.md`、`docs/runbooks/monitoring-alerting-siem.md`
- `infra/docker/compose.local.yml`、全部相关 Dockerfiles、`infra/nginx/nginx.conf`、`.env.example`
- PUBLIC-DEPLOY-01 的实现、测试和 DONE 证据
- Cloudflare 官方 Tunnel、Access、Quick Tunnel limitations 和 upload-limit 文档

## 权威架构规则

1. 使用 **named remotely-managed Cloudflare Tunnel**。生产模式明确拒绝随机 `trycloudflare.com` Quick Tunnel。
2. `cloudflared` 只把一个 approved public hostname 转发到 Docker nginx；不得暴露 API container、PostgreSQL、Redis、
   Worker、Docker socket、metrics、admin debug port 或宿主 SSH。
3. Tunnel token/credentials 只通过 gitignored env/secret 注入；不得出现在 image layer、Compose rendered artifact、命令行
   history 示例、日志、测试 snapshot、报告或 `HANDOFF.md`。
4. 固定 `cloudflared` image version，优先 pin digest；不得使用不可追溯 `latest`。
5. public hostname 的整个 Web + `/api` surface 必须受 Cloudflare Access policy 保护，并继续要求应用自身 login/RBAC。
   外层身份不能替代 HR/仓管/办公室权限。
6. 本路线的 Native scan app 默认继续使用 LAN API URL，不要求 Native 穿过 browser Access interstitial，也不得把 Access
   service token 写入 App。未来 Native 公网访问必须另立安全设计 Task。
7. 当前 nginx 最大上传为 100 MB，Cloudflare Free/Pro 当前也是 100 MB。文档和 UI 不得承诺边界值必然成功；验证
   明显低于限制的成功文件，以及超限请求的稳定、单语、可操作失败。
8. 公司 Internet/Tunnel 停止时公网必须 fail closed；LAN nginx、数据库、库存、扫码和文档生成不受 Tunnel service
   状态影响。不得让 API/Web health 依赖 `cloudflared` 才健康。

## 实现要求

### 1. Dedicated Compose profile

- 增加清晰命名的 public-tunnel Compose override/profile，不复制或替代 canonical local stack。
- `cloudflared` 与 nginx 同一 private Docker network，仅访问 nginx service name/internal port；不使用 host network、
  privileged、Docker socket 或 broad filesystem mount。
- 设置 restart/health/logging/resource 边界；Tunnel restart、nginx recreate 和 host DHCP/LAN IP 变化后自动重连。
- public profile 下 PostgreSQL/Redis host bindings 必须限制为 loopback或完全移除，API internal port不得公开。保留
  warehouse 所需的 nginx LAN binding；文档明确 host firewall 范围。
- Compose config 在没有真实 token 时仍可静态验证，启动命令必须在缺 token 时 fail closed 且不打印 secret。

### 2. Config and contract checks

- 增加无云凭据即可运行的检查脚本，解析 Compose config 并断言 image pin、named-tunnel command、secret injection、
  network reachability、port exposure、no privileged/socket mount、public URL/CORS/cookie/proxy mode 一致。
- 禁止以 grep 单条字符串作为唯一证据；使用 Compose structured config 或其他结构化解析。
- 检查脚本必须明确拒绝 `--url ...trycloudflare.com`/Quick Tunnel、placeholder secret 和 HTTP public origin。

### 3. Access and origin trust

- 文档给出最小 Access application/policy：approved company identities、MFA、session duration、deny by default、紧急
  revoke 和 audit review。不要把具体员工邮箱或真实 identity secret 写进仓库。
- 应用不得直接信任任意客户端发来的 `CF-Access-*`/`CF-Connecting-IP`。只有经过 PUBLIC-DEPLOY-01 trusted proxy
  边界的请求才使用这些 metadata；应用本地账号仍是业务审计 actor。
- 禁止缓存 authenticated HTML、API、Excel/PDF/label/wage downloads 或 private error body；Cloudflare cache rules 的
  手工检查写入 checklist。

### 4. Operations, backup and failure drills

- 在公网 runbook 中补齐 named tunnel 创建/rotate/revoke、DNS/Access、start/stop/status/log、host boot auto-start、
  update/pin 流程和 Cloudflare status/incident 判断。
- 记录 Route A 激活前 PostgreSQL + `storage/` 同一恢复点 backup/restore drill；Tunnel deployment 不允许修改/迁移数据。
- 增加三类演练：只停 `cloudflared`、断开公司 Internet、重建 nginx/tunnel。前两项公网失败但 LAN 正常；恢复后
  hostname 自动恢复且没有重复业务 mutation。
- 监控至少覆盖 tunnel/container health、public synthetic check、Access/auth failures、rate limit、disk/backup freshness、
  queue/document failures；外部告警平台可作为现场配置，不得伪造已接入。

### 5. Public browser workflow

- 经 nginx/public-host equivalent 验证 login、refresh/reload/logout、locale/theme persistence、RBAC denied、Excel upload/
  parse、report/label/wage download、inventory read、audit attribution。
- 不得把公共域名硬编码进 Web bundle。使用 validated `PUBLIC_BASE_URL` 和同源 `/api`。
- 99 MB 或其他安全低于 provider boundary 的 test upload 可用于边界验证；超限用隔离测试数据，不得上传真实客户文件
  到第三方测试服务。

## i18n 100% 硬门禁

1. 新增 Tunnel unavailable/public upload too large/session/access return/configuration help 等任何应用内可见状态必须进入
   typed `en` / `zh-CN` catalog；provider-owned Access 页面单独记录，不伪称由应用 catalog 控制。
2. API 只返回 stable code/enum/field/raw source data；Web 中文只显示中文，English 只显示 English。
3. SSR、hydration、refresh、Access redirect return、upload failure、401 refresh 和 locale switch 不得英文闪现、raw code、
   missing key 或双语拼接。
4. 不在 UI 显示 Tunnel token、内部 hostname/IP、Compose service name、storage path、stack trace 或其他技术提示。
5. 不使用 CSS 隐藏、DOM walker、宽泛 i18n ignore 或硬编码双语 JSX。

## 测试与证据

1. Compose/contract tests：valid profile、missing token fail closed、Quick Tunnel reject、pinned image、no public DB/Redis/API、
   no privileged/socket mount、nginx-only route、secret redaction。
2. Local integration：使用不访问 Cloudflare 的 controlled fake/upstream contract 验证 nginx route 和 health isolation；不得
   为让 CI 通过要求真实 cloud credential。
3. Docker full-stack：API/Web/Worker lint/typecheck/unit、相关 E2E、build、migration status、healthcheck、backup/restore dry-run。
4. Chromium：经 public-host equivalent 覆盖 en/zh-CN、ADMIN/OFFICE/HR_MANAGER/WAREHOUSE_MANAGER、320/390/1366、
   200% zoom、light/dark、reload、downloads、oversize error、RBAC；console/pageerror/hydration/missing translation 为 0。
5. Failure drills：stop tunnel / network isolation 后 LAN health、核心 warehouse route 和数据库/storage identity 不变；恢复无
   duplicate write。
6. 若真实 Cloudflare account/domain 可用，再记录外部 hostname、Access MFA、non-company network 和 token rotation 的
   脱敏证据。无外部凭据时不得用 Quick Tunnel 代替。

## 验收标准

1. named tunnel profile 可复现、image pinned、secret 不落仓库/日志，并且只访问 nginx。
2. public profile 下 PostgreSQL、Redis 和 API internal ports 不可从公网访问；LAN nginx 继续可用。
3. public URL 不依赖公司 public/LAN IP，host IP 变化或 tunnel/nginx restart 后可自动恢复。
4. Cloudflare Access deny-by-default + MFA 的配置/验收 checklist 完整，应用 login/RBAC/audit 保留。
5. Tunnel/Internet 中断时公网 fail closed、LAN 工作流继续；恢复后无数据迁移、重复 mutation 或 session 泄漏。
6. 低于限制的上传/生成/下载成功，超限失败有 stable code 和 strict 单语 i18n；private responses 不被 edge cache。
7. 所有自动化、Docker full-stack、Chromium、backup/restore 和 secret/network contract checks 通过。
8. Task Index、完成度报告、公网/本地部署 runbook 和 `HANDOFF.md` 记录真实终态及外部待验项。

## 非目标

- 不迁移 PostgreSQL或 `storage/`，不建立 cloud replica，不创建 active-active。
- 不开放 Native App 公网 API，不在 App 嵌入 Cloudflare service token。
- 不使用 Quick Tunnel、router port forwarding、public DB/Redis 或 Cloudflare credentials in Git。
- 不修改库存、扫码、解析、托盘、报告、工时或拆柜工资规则。

## 完成输出

- 列出 Compose/nginx/config/script/runbook/i18n/test changed files 和 exact checks。
- 明确唯一 canonical writer、LAN outage behavior、public outage behavior、secret handling 和回退步骤。
- 仓库实现与所有自动化已完成但缺真实 domain/account/外网/MFA 时，只能返回
  `CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING`，并逐项列出最小外部证据；不得以“正在执行”结束。
- 真实外部 gate 也关闭时返回 `DONE`。不得在同一 Session 开始 PUBLIC-DEPLOY-03。
