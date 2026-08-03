# PUBLIC-DEPLOY-04 双入口登录回归验证

## 结论

仓库实现与当前环境自动化已完成。同一个 public-mode、single-writer 栈现在可通过
批准的公网 HTTPS origin 和显式批准的 LAN HTTP origin 独立登录。公网 Cookie 始终
为 Secure；LAN 仅在精确私网 origin、受信 nginx ingress 和主机防火墙边界下使用
non-Secure host-only Cookie。真实公网域名与真实仓库 LAN IP 的现场隐私窗口矩阵仍是
外部门禁，因此任务终态为 `CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING`。

## 红灯与根因

修复前的配置解析聚焦测试证明 public profile 没有 LAN browser origin contract，测试
为 1 failed / 10 passed。根因由五个独立边界共同构成：只允许 HTTPS CORS、全局 Secure
Cookie、nginx 全局伪装 HTTPS、public overlay 没有 LAN listener，以及 API 无法可信地
区分 Tunnel 与 LAN ingress。没有通过关闭 Secure Cookie、wildcard CORS 或信任客户端
forwarded header 绕过问题。

## 实现证据

- 配置新增显式 `LAN_BROWSER_ENABLED` / `LAN_BROWSER_ORIGINS`，仅允许 exact HTTP
  loopback、RFC1918 或批准内部 hostname；public HTTP、LAN public IP、wildcard、重复、
  额外 CORS origin、malformed URL、同 host 冲突和缺少 trusted proxy 均 fail closed。
- nginx 使用独立 public `8080` 与 LAN `80` listener，覆盖 ingress marker、scheme、Host、
  XFF 和 Cloudflare client header。public listener 继续 no-store/HSTS；LAN 不发送 HSTS，
  API/PostgreSQL/Redis 均无 LAN/public 直接 host exposure。
- API 只信任来自配置 CIDR 的 direct peer，逐请求验证 ingress marker、scheme、Host 和
  exact Origin/Referer。public policy 写 Secure Cookie，LAN policy 写 non-Secure Cookie；
  login、refresh、logout、clear 与 legacy cleanup 属性对称。
- public/LAN 会话、refresh rotation 与 host-only cookie jar 独立；错误 Origin、Host、
  protocol、Cloudflare header 或不受信 peer 返回稳定 code，并以 hashed client address、
  ingress type 与拒绝原因写入既有 auth audit 类型，不记录 token/Cookie/credential。
- 新增无 Cloudflare credential 的双入口 TLS edge emulator、Chromium runner 和 outage
  workflow。runner 创建随机临时管理员，结束时精确清理用户、session、audit 与 synthetic
  import/artifact，并恢复本地栈。
- 未修改 Prisma schema，没有业务 migration；PostgreSQL 与 `storage/` 仍为唯一 writer。

## 当前环境验证

- Docker API/Web/Worker production image build：通过。
- API lint、typecheck：通过。
- API unit：52 suites / 429 tests 通过。
- API E2E：21 suites / 131 tests 通过。
- Web lint、typecheck：通过。
- Web unit：285 tests 通过。
- Web production build：通过。
- Worker：247 tests 通过。
- public deployment、Cloudflare named-tunnel 正负向 contract：通过。
- dual-ingress Chromium 正常阶段：public + LAN 独立登录、Cookie、refresh、protected
  dashboard、cross-origin/wrong-host 拒绝与独立 logout 通过。
- outage 阶段：停止 public edge 后公网失败关闭；LAN 重新登录、真实 `.xlsx` 导入、解析、
  报告生成、下载与 dashboard 通过；恢复 edge 后 public + LAN 矩阵再次通过，无重复写入。
- LAN-disabled 阶段：取消 LAN host port publication 后，LAN host health 确认不可达；public
  HTTPS Chromium 仍可登录、refresh、访问受保护 dashboard 并退出。
- UI 矩阵覆盖 en/zh-CN、light/dark、390/1366 viewport 与通过扩展实际设置的 Chromium
  200% browser zoom；关键 dashboard 无 overflow、console error、pageerror 或 hydration error。
- Prisma：39 migrations，当前数据库 schema up to date；full-stack healthcheck 和
  `git diff --check` 通过。
- runner 最终清理后，task import、synthetic user、browser session、auth audit 和任务命名
  storage artifact 残留均为 0；回归中曾发现软删除不能满足 fixture 精确清理，已改为在
  删除用户前按任务导入关系事务清理，并保持路径约束。
- runner 在清理前机器断言 public/LAN `BROWSER_LOGIN_SUCCEEDED` 以及两类拒绝请求的
  ingress audit metadata 均存在，随后才清理 synthetic audit rows。

本报告不得用于替代尚未完成的真实现场矩阵。

## 生产路由配置回归

- 2026-08-02 首次生产双入口配置后，LAN 登录正常，但公网登录返回
  `LAN_BROWSER_INGRESS_MISMATCH`。该稳定码证明公网请求进入了 nginx 的 LAN listener，
  不是关闭 Secure Cookie 或扩大 CORS 可以解决的问题。
- 仓库 Compose 与合同一直要求 Tunnel origin 为 `http://nginx:8080`，但中英文 runbook
  的 Published Route 表格仍错误写为 `http://nginx:80`。已把两处改为 `8080`，补充专项
  排障说明，并增加合同回归门禁，禁止文档再次把公网 route 指向 LAN listener。
- 生产 Cloudflare route 修正和公网复测仍属于下面的现场外部门禁；本报告不声称已经在
  真实 Cloudflare 环境完成修改或复测。

## 现场外部门禁

在目标部署先建立同一恢复点的 PostgreSQL + `storage/` 匹配备份，然后：

1. 用真实公网域名的全新隐私窗口验证 Access（若现场启用）、Bestar 登录、RBAC、refresh、
   reload、logout，并只记录公网 Cookie 属性为 Secure，不记录值。
2. 用真实仓库 LAN IP/批准 hostname 的另一隐私窗口重复登录、RBAC、refresh、reload、
   logout，确认 Cookie 为 host-only 且不带 Secure。
3. 停止 Tunnel connector/仓库 Internet，确认公网失败关闭，LAN 可重新登录并完成一次
   导入、生成和下载；恢复后公网返回且无重复 mutation。
4. 只阻断 LAN firewall/listener，确认 public 登录不受影响；验证错误 Host/Origin 两边均
   无法取得 session。
5. 核对 Windows 防火墙只允许批准 LAN CIDR，路由器没有 port forwarding，API、数据库、
   Redis 没有直接 host exposure。

外部证据必须脱敏，不得包含真实域名/IP、人员身份、Cookie、token、MFA secret 或客户数据。
