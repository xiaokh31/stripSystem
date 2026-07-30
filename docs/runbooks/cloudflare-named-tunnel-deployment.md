# Cloudflare Named Tunnel Deployment / Cloudflare 命名隧道部署

[中文操作指南](#中文操作指南) | [English operations guide](#english-operations-guide)

Last reviewed against the repository and official Cloudflare/AWS documentation:
**2026-07-30**.

This is the standalone operator guide for exposing the existing Bestar
warehouse Docker stack through a Cloudflare **named tunnel**. It does not move
the database or files to Cloudflare. Deployment-option analysis and the
single-writer decision remain in
[Public Access and Free Cloud Deployment](public-access-and-free-cloud-deployment.md).

> Repository status: the Compose overlay, security contract, secret-file
> preflight and lifecycle scripts are implemented. A real domain, Cloudflare
> account, tunnel, Access policy, MFA policy and off-site acceptance test are
> external operations and are not complete merely because this document
> exists.

---

# 中文操作指南

## 1. 方案和适用范围

推荐链路：

```text
外网浏览器
  -> Cloudflare Access + MFA
  -> Cloudflare Named Tunnel
  -> Docker cloudflared
  -> Docker nginx
  -> Bestar Web / API
  -> 本地 PostgreSQL、Redis 和 storage/
```

本方案适合以下情况：

- Bestar 继续运行在仓库内的同一台 Docker 主机；
- 公司公网 IP 或内网 IP 可能变化；
- 办公室人员需要在公司外通过浏览器访问；
- 数据库和 `storage/` 仍以仓库主机为唯一可写数据源。

本方案不能解决仓库停电、主机停机或公司断网。发生这些情况时，公网访问会
停止，但不应影响恢复网络后的本地数据。

Native 扫码 App 目前仍按局域网访问设计，不得在 App 中写入 Cloudflare
Access service token，也不得把本指南当作 Native 公网接入批准。

## 2. 不可违反的安全规则

1. 只使用 Named Tunnel，不使用 `trycloudflare.com` Quick Tunnel。
2. 不在路由器上做公网端口转发，不把 PostgreSQL、Redis、API 或 Docker
   Socket 暴露到公网。
3. 只发布一个经过批准的 HTTPS 主机名，例如
   `https://warehouse.example.com`。
4. Cloudflare Access + MFA 是外层身份门；Bestar 登录和 RBAC 仍然必须保留。
5. Tunnel token 不得写入 `.env`、Git、命令行参数、截图、工单或
   `HANDOFF.md`。
6. 原始上传文件、生成文件、数据库和审计记录仍保存在仓库主机；公网接入
   前必须完成备份和恢复验证。
7. 本方案只允许一个正式可写系统，不得同时运行另一个云端可写副本。

## 3. 准备清单

开始前必须具备：

- 已加入 Cloudflare 并由公司控制的域名；
- 已批准的公开子域名；
- 可创建 Tunnel、DNS route 和 Access application 的 Cloudflare 管理员；
- 已接入的公司身份提供商，或已批准的 Cloudflare One-time PIN；
- 已确定的允许访问人员/组和 MFA 规则；
- 健康运行的本地 Docker Compose 全栈；
- Docker Compose v2、Bash 和 `jq`；
- 已配置强且唯一的生产 `JWT_SECRET`、数据库密码和 Redis 设置；
- 已验证的 PostgreSQL + `storage/` 同一恢复点备份；
- 主机允许 `cloudflared` 主动访问互联网；
- 主机防火墙只允许获准的局域网访问 nginx，路由器不开放入站转发。

仓库提供的生命周期脚本是 Bash 脚本。在 Linux/macOS 终端中直接使用。
Windows 主机应使用可以访问 Docker Desktop 的 WSL 或 Git Bash，并确保
`bash`、`docker` 和 `jq` 可用。不要因为使用 PowerShell 而绕过仓库预检，
也不要手工执行带 token 的 `docker run` 命令。

### 3.1 域名注册和现有官网在 AWS Route 53 时

域名可以继续注册在 AWS，不需要转移注册商。Cloudflare Free/Pro 的正常
full setup 会把该 apex domain 的**权威 DNS** 从 Route 53 切换到 Cloudflare；
公司官网、邮件和其他服务仍可继续运行在原来的 AWS 或第三方平台。

可选路线：

| 路线                     | 权威 DNS   | 适用情况                                                                    |
| ------------------------ | ---------- | --------------------------------------------------------------------------- |
| Cloudflare full setup    | Cloudflare | 当前推荐的 Free/Pro pilot；完整迁移现有 DNS 后只新增一个 warehouse hostname |
| 独立仓库域名             | Cloudflare | 不愿触碰公司官网 DNS 时风险最低，但需要另一个公司控制域名                   |
| Cloudflare partial CNAME | Route 53   | 只在 Cloudflare Business/Enterprise 可用，不属于当前 Free pilot             |

如选择独立仓库域名，推荐直接通过 Cloudflare Registrar 注册，以完全隔离现有
AWS 域名：

1. 使用公司控制、已验证邮箱并启用 MFA 的 Cloudflare account。
2. 进入 **Domain Registration > Register Domains**，搜索并购买一个公司批准的
   ASCII 域名。购买人必须亲自确认价格、年限、自动续费、联系人和注册协议；不要把
   付款资料或 Cloudflare 凭据发给 Agent。
3. Cloudflare Registrar 注册的新域名会自动使用 Cloudflare nameserver。不要进入
   AWS Route 53，也不要修改现有公司域名的 hosted zone、registered-domain
   nameserver 或 DNSSEC。
4. 完成注册联系人邮箱验证；否则注册局可能暂停该新域名。确认 zone 显示
   **Active** 后，为新域名启用 DNSSEC。
5. 为本系统批准一个完整 hostname，例如
   `warehouse.<new-registrable-domain>`。不要使用新域名的 apex，以便日后保留
   状态页或重定向空间。
6. 用该完整 hostname 继续本指南的 Named Tunnel、Access/MFA、`.env`、secret
   和外网验收步骤。

如果新域名是在其他注册商购买，必须先把**新域名**作为 full zone 添加到
Cloudflare，再只修改这个新域名的 nameserver。不要把 Cloudflare 随机分配给其他
zone 的 nameserver 预先填入注册商，也不要修改原 AWS 公司域名。

重要：Cloudflare Free/Pro 不能把 `warehouse.example.com` 作为独立普通 zone
加入 Cloudflare，同时让 `example.com` 继续使用 Route 53 nameserver。保留 Route 53
为权威 DNS、只把一个 hostname 指向 Cloudflare 的 partial CNAME setup 需要
Business/Enterprise；把子域名单独通过 NS 委派给 Cloudflare 的 subdomain setup
属于 Enterprise 能力。当前 Free pilot 若不接受整个 apex DNS 迁移，必须使用一个
独立的可注册域名，而不是主域名下的子域名。

如果公司选择购买 Business/Enterprise 并使用 partial CNAME，按以下顺序操作；
不要执行后面的 full-setup nameserver 切换：

1. 在 Cloudflare 添加 apex domain（例如 `example.com`），选择
   Business/Enterprise。首次添加时忽略更换 nameserver 的提示。
2. 在 zone **Overview** 选择 **Convert to CNAME DNS Setup**，保存 Cloudflare
   显示的 Verification TXT Record。
3. 在 Route 53 的现有 public hosted zone 中添加该 TXT：

   - Name 使用 Cloudflare 给出的名称；如果 Route 53 控制台自动补全 zone
     suffix，避免重复写成 `cloudflare-verify.example.com.example.com`；
   - Value 必须逐字复制；
   - 只要 partial zone 仍启用，就保留该 TXT。
4. 等 Cloudflare 确认域名所有权。不要修改注册域名的 nameserver；用
   `nslookup -type=ns example.com` 验证权威 DNS 仍是 Route 53。
5. 创建本指南后面的 Named Tunnel 和 Published application route。确认
   Cloudflare DNS 中存在且仅存在该应用 hostname 的 proxied CNAME：
   `warehouse.example.com -> <UUID>.cfargotunnel.com`。Dashboard 如已自动创建，
   不要再添加重复记录。
6. 回到 Route 53，删除 `warehouse.example.com` 原有冲突的 A、AAAA 或 CNAME，
   然后只创建：

   ```text
   warehouse.example.com CNAME warehouse.example.com.cdn.cloudflare.net
   ```

   Route 53 **不要**直接指向 `<UUID>.cfargotunnel.com`。Partial setup 的外部
   权威 DNS 必须指向 `{完整主机名}.cdn.cloudflare.net`；Tunnel UUID 目标只存在于
   同一个 Cloudflare account 的 DNS 配置中。
7. 验证 Route 53 的 apex、`www`、邮件和其他记录完全未变，并从外网检查：

   ```powershell
   nslookup -type=ns example.com 1.1.1.1
   nslookup -type=cname warehouse.example.com 1.1.1.1
   curl.exe -I https://warehouse.example.com/
   ```

   NS 应继续返回 Route 53；CNAME 应返回
   `warehouse.example.com.cdn.cloudflare.net`。首次启用 Universal SSL 时证书
   可能要在该 CNAME 生效后才签发，必须等 HTTPS 和 Access/MFA 实测通过再宣布上线。

更换 nameserver 会影响整个域名。以下检查全部完成前，不得在 AWS 提交
nameserver 变更：

1. 从 Route 53 public hosted zone 保存完整记录清单和当前四个 nameserver，
   包括 apex、`www`、所有业务子域名、MX、SPF/DKIM/DMARC、CAA、SRV、验证
   TXT 和通配符。
2. 单独记录 Route 53 Alias、weighted、latency、failover、geolocation、
   multivalue、health check 和 DNSSEC。Cloudflare quick scan 不保证发现或
   等价转换这些配置。
3. 在 Cloudflare **Onboard a domain** 中添加 apex domain，例如
   `example.com`，不要只添加 `warehouse.example.com`。
4. 在切换 nameserver 前逐项重建并双人核对记录：

   - 普通 A/AAAA/CNAME 按原目标复制；
   - Route 53 Alias 必须转换为目标 AWS 服务的真实 hostname/IP 所对应的
     Cloudflare 记录，不能复制 `ALIAS` 字样；
   - MX、邮件相关 CNAME/TXT、CAA、SRV 和验证记录保持 **DNS only**；
   - 现有官网的 A/AAAA/CNAME 初始也保持 **DNS only（灰云）**，让流量继续
     直达当前 CloudFront/ALB/Amplify/S3/EC2 或其他 origin。未经单独评审，
     不要同时引入 Cloudflare 橙云和现有 AWS CDN/代理；
   - 如存在复杂 Route 53 routing policy 或 health check，停止切换并先设计
     Cloudflare 等价方案；不要降级为单一静态记录。
5. 如果注册层或 hosted zone 已启用 DNSSEC，按 AWS/Cloudflare 官方顺序先
   安全移除旧 DS/public key 并等待注册局确认。公开查询仍返回旧 DS 时不得
   更换 nameserver。Cloudflare zone Active 且 DNS 正常后，再启用 Cloudflare
   DNSSEC，并把新的 DS 信息登记到 AWS 注册域名。
6. Cloudflare 显示两台分配的 nameserver 后，在 AWS Route 53 进入
   **Registered domains > 域名 > Actions > Edit name servers**，用这两台
   Cloudflare nameserver 替换 Route 53 nameserver。不要只修改旧 hosted zone
   里的 apex NS 记录；那不会改变注册局的父区委派。
7. 等 Cloudflare zone 显示 **Active**，从不同递归 DNS 和外部网络验证：

   ```powershell
   nslookup -type=ns example.com 1.1.1.1
   nslookup -type=ns example.com 8.8.8.8
   nslookup -type=mx example.com 1.1.1.1
   ```

   同时验证 apex/`www` HTTPS、所有关键子域名、邮件收发、SPF/DKIM/DMARC、
   证书续期和第三方 domain verification。
8. 只有官网和邮件验证通过后，才继续本指南创建
   `warehouse.example.com` Tunnel route。不要覆盖 apex 或 `www`。
9. 保留旧 Route 53 hosted zone 和原 nameserver 清单，直到 DNS 缓存窗口、
   官网/邮件监控、Tunnel、Access/MFA 和外网验收全部通过。不要提前删除旧
   hosted zone。

如需回滚，在 AWS **Registered domains** 把父区 nameserver 恢复为记录下来的
Route 53 四台 nameserver。回滚也受 DNS 缓存影响；必须再次验证官网、邮件和
关键子域名，不能只看到 AWS 控制台保存成功就宣布恢复。

## 4. 验证本地基线

在项目根目录执行：

```bash
scripts/healthcheck.sh
scripts/backup-postgres.sh
```

记录备份位置，并按
[备份与恢复指南](backup-restore.md)确认该恢复点同时覆盖数据库和
`storage/`。如果本地登录、报告生成、文件下载或备份本身不正常，不要启用
公网入口。

## 5. 在 Cloudflare 创建 Named Tunnel

Cloudflare 控制台界面可能调整。2026-07-24 的入口为：

1. 登录 Cloudflare Dashboard。
2. 进入 **Networking > Tunnels**。
3. 创建一个 remotely-managed tunnel。
4. 使用明确名称，例如 `bestar-warehouse-production`。
5. 在 Tunnel 的 **Overview** 页面选择 **Add a replica**，让控制台生成
   connector 安装命令。
6. 只把该命令临时粘贴到本机私密文本编辑器，从中提取以 `eyJ` 开头的
   tunnel token。
7. **不要执行**控制台给出的 `docker run ... --token ...` 命令。
8. 关闭临时编辑器后，清除其最近文件记录或草稿。

Tunnel token 可以启动该隧道，必须按密码处理。它不是 Cloudflare API
token，也不能提交到项目。

## 6. 创建公开路由

在刚创建的 Tunnel 中打开 **Routes**，添加 Published application route：

| 字段         | 值                                                |
| ------------ | ------------------------------------------------- |
| Hostname     | 已批准的完整子域名，例如`warehouse.example.com` |
| Service type | `HTTP`                                          |
| Service URL  | `http://nginx:80`                               |

约束：

- 只创建这一个 Web 主机名；
- 不创建 wildcard route；
- 不单独发布 `/api`、PostgreSQL、Redis、SSH 或 Docker；
- 不把 Service URL 写成宿主机公网 IP；
- Cloudflare 中的公开主机名必须和后续 `.env` 完全一致。

## 7. 安全保存 Tunnel Token

在项目根目录的 Bash 终端执行以下命令。输入提示出现后粘贴 token；输入
不会显示，也不会把 token 本身写入 shell history。

```bash
umask 077
mkdir -p .secrets
printf 'Paste Cloudflare tunnel token, then press Enter: '
IFS= read -r -s CLOUDFLARE_TUNNEL_TOKEN
printf '\n'
printf '%s' "$CLOUDFLARE_TUNNEL_TOKEN" > .secrets/cloudflare-tunnel-token
unset CLOUDFLARE_TUNNEL_TOKEN
chmod 600 .secrets/cloudflare-tunnel-token
```

只检查文件元数据和长度，不要用 `cat` 显示内容：

```bash
ls -l .secrets/cloudflare-tunnel-token
wc -c < .secrets/cloudflare-tunnel-token
```

`.secrets/` 已被 Git 忽略。默认文件必须是普通文件、不可为符号链接。在
Linux/macOS 上权限必须为 `600` 或 `400`；在 Windows NTFS 上必须关闭继承，
只显式允许部署账号、`SYSTEM` 和本机 Administrators 等必要主体访问，不得允许
Everyone、Authenticated Users、内置 Users 或其他宽泛组。Windows preflight
会调用 `scripts/verify-windows-secret-file-acl.ps1` 检查该 ACL。不要把 token
直接写在 `echo` 命令里。

Linux 上的 Compose file-backed secret 可能保留宿主机文件所有者，而本项目
`cloudflared` 使用 UID `65532`。如果日志显示 secret 无法读取，由部署
管理员将文件安全安装给 UID/GID `65532` 并设为 `0400`，再以具备读取权限
的方式运行 preflight；不要放宽为全员可读。Docker Desktop 不保证应用
Compose 的 secret `uid`/`gid`/`mode` 属性，因此仍需限制宿主机文件，并在
实际启动时验证可读性。

## 8. 配置生产环境

编辑项目根目录 `.env`。以下主机名只是占位符，必须替换为同一个真实、已
批准的 HTTPS 主机名：

```dotenv
PUBLIC_DEPLOYMENT_ENABLED=true
PUBLIC_BASE_URL=https://warehouse.example.com
CORS_ORIGINS=https://warehouse.example.com
BROWSER_COOKIE_SECURE=true
TRUSTED_PROXY_MODE=cloudflare-tunnel
TRUSTED_PROXY_CIDRS=<目标主机上经过确认的私有 Docker 代理 CIDR>
AUTH_RATE_LIMIT_FAIL_CLOSED=true
CLOUDFLARE_TUNNEL_TOKEN_FILE=../../.secrets/cloudflare-tunnel-token
NEXT_PUBLIC_API_BASE_URL=/api
```

同时确认：

- `JWT_SECRET` 是至少 32 字符且未在其他环境使用的生产 secret；
- PostgreSQL 和 Redis 使用生产配置；
- `PUBLIC_BASE_URL` 与 `CORS_ORIGINS` 完全相同，不包含 wildcard；
- 不把公网主机名编译进 `NEXT_PUBLIC_API_BASE_URL`；
- `TRUSTED_PROXY_CIDRS` 使用目标 Docker 网络的明确私有 CIDR，不要盲目
  复制测试脚本中的宽泛 fallback；
- `.env` 和 `.secrets/` 都没有进入 Git。

## 9. 配置 Cloudflare Access 和 MFA

在 Cloudflare Zero Trust / Access 控制台中：

1. 进入 **Access controls > Applications**。
2. 添加 **Self-hosted** application。
3. 使用完整公开主机名，覆盖整个 Bestar 应用。
4. 创建 Allow policy，只允许批准的公司用户或组。
5. 为允许策略要求 MFA。
6. 不创建 Bypass policy；未命中 Allow policy 的身份默认拒绝。
7. 试运行期使用较短的 Access session，例如 24 小时，并在业务批准后再
   调整。
8. 保存后分别使用允许身份、未允许身份和隐私窗口验证。

通过 Access 后仍必须看到 Bestar 登录页。Access 不能替代 Bestar 账号、
角色权限和审计归属。

### 9.1 临时取消仓库 hostname 的 Access 及恢复

这是操作人明确接受风险后的临时降级，不满足 `PUBLIC-DEPLOY-02` 的 Access +
MFA 完成标准。只删除仓库 hostname 的 Self-hosted application；保留 Named
Tunnel、published route、DNS、cache bypass、connector token、可复用 Allow
policy、App Launcher 和 Authenticator 登记。这样公开流量不再出现 Access
登录，但恢复时不需要重新分发 Tunnel token 或重新登记验证器。

取消前记录的恢复配置（不得把真实邮箱写入仓库）：

- application name：`Bestar Warehouse Production`；
- type：Self-hosted and private；
- public hostname：`warehouse.***.cc`，path 留空以覆盖所有路径；
- application session：24 hours；
- policy：`Allow approved warehouse administrator`，Action 为 Allow，
  Include 为操作人批准的当前 Cloudflare 登录邮箱；
- 不使用 Everyone、Bypass 或公开 path；
- Identity 使用 Cloudflare IdP；
- Access 全局允许 Authenticator application，application 使用 Custom MFA，
  Authenticator application，duration 24 hours；
- App Launcher 复用同一个 Allow policy，session 24 hours；
- Cache Rule `Bypass Bestar warehouse application cache` 保持 Active。

临时取消：

1. 确认 Bestar 登录、限流、RBAC、审计和备份仍正常。
2. 在 **Zero Trust > Access controls > Applications** 删除
   `Bestar Warehouse Production`。不要删除 Tunnel route、DNS CNAME、cache
   rule、secret、App Launcher policy 或 MFA 登记。
3. 匿名执行 `curl.exe -I https://warehouse.***.cc/`：应直接返回 Bestar
   响应或应用重定向，不能再跳转到 `*.cloudflareaccess.com`。
4. 隐私窗口应直接看到 Bestar 登录页；确认数据库/API 仍未直接暴露 host port。

恢复：

1. 进入 **Zero Trust > Access controls > Applications > Create new
   application > Self-hosted and private**。
2. 名称填 `Bestar Warehouse Production`，public hostname 填
   `warehouse.***.cc`，path 留空，session 设为 24 hours。
3. 使用 **Add current policies** 重新附加
   `Allow approved warehouse administrator`。打开 policy 核对它仍只包含操作人
   批准的当前 Cloudflare 登录邮箱；不要把它改成 Everyone 或 Bypass。
4. 在 application 的 **Authentication > MFA** 选择 Custom MFA，
   只允许 Authenticator application，duration 24 hours。Identity 保持
   Cloudflare IdP。
5. 保存后先用匿名 HEAD/隐私窗口确认发生 Access 302，再验证允许身份 + MFA
   到达 Bestar 登录页，并验证未批准身份被拒绝。
6. 最后确认 hostname cache bypass 仍 Active、`cloudflared` healthy、LAN
   healthcheck 通过。恢复完成前不要宣布满足 `PUBLIC-DEPLOY-02`。

## 10. 禁止缓存业务页面和文件

在 Cloudflare **Cache Rules** 中创建规则：

- 条件：Hostname 等于公开 Bestar 主机名；
- 动作：Bypass cache；
- 确认后续规则不会重新启用缓存。

在已登录页面、API、报告和工资文件下载中检查响应头，不能出现由 Cloudflare
命中的业务缓存，例如 `CF-Cache-Status: HIT`。

## 11. 启动和检查

先执行静态契约和 secret 预检：

```bash
scripts/cloudflare-tunnel-local.sh preflight
```

预期结尾：

```text
Cloudflare named-tunnel startup preflight: PASS
```

需要检查最终 Compose 配置时可执行：

```bash
scripts/cloudflare-tunnel-local.sh config
```

该输出可能很长，但不应包含 token 内容。然后启动：

```bash
scripts/cloudflare-tunnel-local.sh start
scripts/cloudflare-tunnel-local.sh status
scripts/cloudflare-tunnel-local.sh logs
scripts/cloudflare-tunnel-local.sh probe
scripts/healthcheck.sh
```

`status` 中 `cloudflared` 应保持运行并最终健康；日志应显示连接成功，而非
循环认证失败。`probe` 必须验证 Tunnel 专用网络可以访问 nginx 的 Web 和
`/api/health`。

## 12. 外网验收

必须使用手机蜂窝网络或其他非公司网络执行，不要只在公司 Wi-Fi 中测试：

1. 未授权身份被 Cloudflare Access 拒绝。
2. 已授权身份必须完成 MFA。
3. 通过 Access 后仍需完成 Bestar 登录。
4. 中英文切换和刷新无错误语言闪现或双语拼接。
5. 不同角色只能看到获准菜单和操作。
6. 上传一份不含敏感真实数据的验证文件，完成解析和报告生成。
7. 验证报告、标签和工资文件下载。
8. 验证登出后 Bestar session 失效。
9. 检查业务页面和下载未被 Cloudflare 缓存。
10. 检查审计记录仍归属于实际 Bestar 用户。

不得把客户清单、员工信息、账号密码、Cookie 或 token 放进验收截图。

## 13. 日常运维命令

| 操作                    | 命令                                             |
| ----------------------- | ------------------------------------------------ |
| 配置与 token 预检       | `scripts/cloudflare-tunnel-local.sh preflight` |
| 启动                    | `scripts/cloudflare-tunnel-local.sh start`     |
| 停止公网 connector      | `scripts/cloudflare-tunnel-local.sh stop`      |
| 重建 nginx 和 connector | `scripts/cloudflare-tunnel-local.sh restart`   |
| 查看容器状态            | `scripts/cloudflare-tunnel-local.sh status`    |
| 查看最近 200 行日志     | `scripts/cloudflare-tunnel-local.sh logs`      |
| 验证 connector 到 nginx | `scripts/cloudflare-tunnel-local.sh probe`     |
| 验证本地全栈            | `scripts/healthcheck.sh`                       |

停止 `cloudflared` 只应关闭公网入口，不应停止 PostgreSQL、Redis、Web、
API、worker 或 LAN 入口。

## 14. Token 轮换

在维护窗口执行：

1. 在 Cloudflare **Networking > Tunnels** 中打开该 Tunnel。
2. 使用 **Refresh token** 生成新 token。
3. 按第 7 节的隐藏输入方式写入一个新的临时 secret 文件。
4. 验证新文件权限和长度，不显示内容。
5. 原子替换 `.secrets/cloudflare-tunnel-token`。
6. 执行：

   ```bash
   scripts/cloudflare-tunnel-local.sh preflight
   scripts/cloudflare-tunnel-local.sh restart
   scripts/cloudflare-tunnel-local.sh status
   scripts/cloudflare-tunnel-local.sh logs
   ```
7. 再做一次允许/拒绝身份和 Bestar 登录验证。

本项目当前是单 connector pilot，轮换时可能有短暂中断，不承诺零停机。

如果 token 疑似泄露，先禁用 Access application 或 Tunnel route，再刷新
token、替换本地文件并重启。确认新连接健康后，在 Cloudflare 中清理旧
connector。不要只删除本地文件而保留已泄露的有效 token。

## 15. 故障演练和回滚

启用前至少完成以下演练：

1. 执行 `scripts/cloudflare-tunnel-local.sh stop`：公网应失败关闭，LAN
   登录、报告和文件仍正常。
2. 恢复 connector：公网访问恢复，数据无需恢复。
3. 断开公司互联网：公网不可用，LAN 和本地数据仍可用。
4. 重启或重建 nginx：connector 在 nginx 健康后恢复。
5. 从匹配的数据库 + `storage/` 恢复点完成一次恢复验证。

完整回滚：

1. 在 Cloudflare 中禁用 Access application 和公开 route/Tunnel。
2. 执行 `scripts/cloudflare-tunnel-local.sh stop`。
3. 保留本地 Compose 栈和数据卷运行。
4. 从外网确认主机名不可访问，从 LAN 确认系统仍可用。

Named Tunnel 只增加入口，不迁移数据，因此正常回滚不需要数据库回滚。

## 16. 常见问题

| 现象                        | 检查                                                                         |
| --------------------------- | ---------------------------------------------------------------------------- |
| `TOKEN_FILE_MISSING`      | token 文件路径、普通文件属性和`.env` 中的相对路径                          |
| `TOKEN_FILE_PERMISSIONS`  | 执行`chmod 600 .secrets/cloudflare-tunnel-token`                           |
| `TOKEN_FILE_PLACEHOLDER`  | 文件为空、包含占位符、换行/空格或不是控制台生成的 connector token            |
| `PUBLIC_BASE_URL_MISSING` | `.env` 中缺少真实 HTTPS 公开源                                             |
| contract 检查失败           | `PUBLIC_BASE_URL`、`CORS_ORIGINS`、proxy mode/CIDR、`jq` 和 Compose v2 |
| Tunnel 反复认证失败         | token 已轮换/撤销、复制错误或连接的是错误 Tunnel                             |
| Access 返回 403             | Allow policy、用户组、身份提供商或 MFA 条件                                  |
| 登录循环或 Cookie 丢失      | HTTPS origin、CORS、`BROWSER_COOKIE_SECURE=true` 和代理信任配置            |
| 上传返回 413                | nginx 公网配置和 Cloudflare 当前上传限制；不要绕过 nginx                     |
| 公网正常但 LAN 不通         | 主机防火墙、`HTTP_PORT` 和 nginx LAN binding；不要开放路由器入站转发       |

## 17. 完成标准

- Named Tunnel 和唯一公开 route 已创建；
- token 只存在于权限正确的 secret 文件中；
- preflight、status、probe 和本地 healthcheck 通过；
- Access 默认拒绝、批准组可访问且要求 MFA；
- Bestar 登录、RBAC、审计和中英文功能通过；
- 业务页面和下载未被 Cloudflare 缓存；
- 外网、断网、停止 connector、轮换和回滚均已验证；
- PostgreSQL + `storage/` 恢复验证有记录；
- 没有入站端口转发，数据库、Redis 和内部 API 没有公网入口。

---

# English Operations Guide

## 1. Architecture and Scope

Approved path:

```text
Off-site browser
  -> Cloudflare Access + MFA
  -> Cloudflare Named Tunnel
  -> Docker cloudflared
  -> Docker nginx
  -> Bestar Web / API
  -> local PostgreSQL, Redis and storage/
```

Use this route when the Bestar stack remains on one warehouse Docker host,
public or LAN IP addresses may change, and office staff need off-site browser
access. The warehouse PostgreSQL database and matching `storage/` tree remain
the only canonical writable state.

This route does not provide availability during a warehouse power, host or
Internet outage. The Native scan app remains LAN-oriented and must not receive
a Cloudflare Access service token.

## 2. Non-Negotiable Rules

1. Use a named tunnel, never a `trycloudflare.com` Quick Tunnel.
2. Do not configure inbound router forwarding or expose PostgreSQL, Redis, the
   internal API or the Docker socket.
3. Publish exactly one approved HTTPS hostname.
4. Cloudflare Access with MFA is an outer gate; Bestar login and RBAC remain
   mandatory.
5. Never place the connector token in `.env`, Git, command arguments,
   screenshots, tickets or `HANDOFF.md`.
6. Back up and restore the database and `storage/` as one recovery point before
   public activation.
7. Do not operate a second cloud system as another writable production copy.

## 3. Prerequisites

- A company-controlled domain active in Cloudflare;
- an approved public subdomain;
- permission to manage Tunnels, routes and Access applications;
- an approved identity provider or Cloudflare One-time PIN;
- approved user/group and MFA rules;
- a healthy local Docker Compose stack;
- Docker Compose v2, Bash and `jq`;
- production-only JWT, database and Redis secrets/configuration;
- a verified PostgreSQL plus `storage/` recovery point;
- outbound Internet connectivity for `cloudflared`;
- a host firewall that allows nginx only from approved LAN ranges, with no
  inbound router forwarding.

The repository lifecycle wrapper is a Bash script. Use a Linux/macOS terminal,
or WSL/Git Bash that can reach Docker Desktop and has `bash`, `docker` and
`jq`. Do not bypass the wrapper from PowerShell and do not manually run a
Dashboard command containing the token.

### 3.1 When the Domain and Existing Website Use AWS Route 53

The domain can remain registered at AWS; transferring the registrar is not
required. On Cloudflare Free/Pro, the normal full setup moves authoritative DNS
for the apex domain from Route 53 to Cloudflare. The company website, email and
other services can continue running on their existing AWS or third-party
platforms.

Available routes:

| Route                     | Authoritative DNS | When to use                                                                                     |
| ------------------------- | ----------------- | ----------------------------------------------------------------------------------------------- |
| Cloudflare full setup     | Cloudflare        | Recommended Free/Pro pilot after copying every existing record; add only one warehouse hostname |
| Separate warehouse domain | Cloudflare        | Lowest website-DNS risk when the company does not want to move its main zone                    |
| Cloudflare partial CNAME  | Route 53          | Available only on Cloudflare Business/Enterprise; not this Free pilot                           |

For a separate warehouse domain, register it directly through Cloudflare
Registrar to isolate the existing AWS domain completely:

1. Use a company-controlled Cloudflare account with a verified email address
   and MFA enabled.
2. Open **Domain Registration > Register Domains**, then search for and
   purchase an approved ASCII domain. The purchaser must personally confirm
   price, term, auto-renewal, contacts and registration agreements; never send
   payment data or Cloudflare credentials to an Agent.
3. A domain registered through Cloudflare Registrar automatically uses
   Cloudflare nameservers. Do not open Route 53 or change the existing company
   domain's hosted zone, registered-domain nameservers or DNSSEC.
4. Complete registrant email verification, because the registry can place the
   new domain on hold if that address is not verified. After the zone is
   **Active**, enable DNSSEC for the new domain.
5. Approve one full hostname such as
   `warehouse.<new-registrable-domain>`. Avoid using the new domain apex so it
   remains available for a future status page or redirect.
6. Use that full hostname for the Named Tunnel, Access/MFA, `.env`, secret and
   off-site acceptance steps in this guide.

If the new domain is purchased from another registrar, first add that **new
domain** to Cloudflare as a full zone and then change nameservers only for the
new domain. Do not pre-set nameservers copied from another Cloudflare zone, and
do not change the original AWS company domain.

Important: Cloudflare Free/Pro cannot onboard `warehouse.example.com` as a
standalone normal zone while `example.com` keeps its Route 53 nameservers.
Keeping Route 53 authoritative and pointing only one hostname at Cloudflare
requires the Business/Enterprise partial CNAME setup. Delegating the child
domain to Cloudflare nameservers as a separate subdomain setup is an Enterprise
feature. For this Free pilot, refusing an apex DNS migration therefore requires
a separate registrable domain, not a child hostname under the existing domain.

If the company purchases Business/Enterprise and selects partial CNAME, use the
following sequence and do not perform the full-setup nameserver change below:

1. Add the apex domain, such as `example.com`, to Cloudflare on a
   Business/Enterprise plan. Ignore the nameserver-change instructions during
   initial onboarding.
2. On the zone **Overview**, select **Convert to CNAME DNS Setup** and save the
   Verification TXT Record shown by Cloudflare.
3. Add that TXT record to the existing Route 53 public hosted zone:

   - use the exact name supplied by Cloudflare; if Route 53 appends the zone
     suffix automatically, do not create
     `cloudflare-verify.example.com.example.com`;
   - copy the value exactly;
   - keep the TXT record for as long as the partial zone remains active.
4. Wait for Cloudflare to confirm ownership. Do not change the registered
   domain's nameservers; use `nslookup -type=ns example.com` to prove Route 53
   is still authoritative.
5. Create the Named Tunnel and Published application route described later in
   this guide. Confirm that Cloudflare DNS contains exactly one proxied CNAME
   for the application hostname:
   `warehouse.example.com -> <UUID>.cfargotunnel.com`. Do not add a duplicate
   if the Dashboard created it automatically.
6. In Route 53, remove any conflicting A, AAAA, or CNAME record for
   `warehouse.example.com`, then create only:

   ```text
   warehouse.example.com CNAME warehouse.example.com.cdn.cloudflare.net
   ```

   Do **not** point Route 53 directly to `<UUID>.cfargotunnel.com`. With a
   partial setup, external authoritative DNS must point to
   `{full-hostname}.cdn.cloudflare.net`; the Tunnel UUID target belongs in DNS
   configuration in the same Cloudflare account.
7. Confirm that Route 53 apex, `www`, mail and all other records are unchanged,
   then verify from an off-site network:

   ```powershell
   nslookup -type=ns example.com 1.1.1.1
   nslookup -type=cname warehouse.example.com 1.1.1.1
   curl.exe -I https://warehouse.example.com/
   ```

   NS must still return Route 53 and CNAME must return
   `warehouse.example.com.cdn.cloudflare.net`. Universal SSL may be issued only
   after that CNAME becomes proxied, so do not announce activation until HTTPS
   and Access/MFA pass real external tests.

A nameserver change affects the whole domain. Complete every item below before
submitting the change at AWS:

1. Save a full inventory of the Route 53 public hosted zone and its current four
   nameservers: apex, `www`, every business hostname, MX, SPF/DKIM/DMARC, CAA,
   SRV, verification TXT and wildcard records.
2. Separately identify Route 53 Alias, weighted, latency, failover, geolocation,
   multivalue, health-check and DNSSEC configuration. Cloudflare quick scan is
   not guaranteed to discover or equivalently convert them.
3. In Cloudflare **Onboard a domain**, add the apex domain such as
   `example.com`; do not try to onboard only `warehouse.example.com`.
4. Recreate and peer-review every record before changing nameservers:

   - copy ordinary A/AAAA/CNAME records to the same targets;
   - convert each Route 53 Alias to the Cloudflare record appropriate for the
     real AWS service hostname/IP; do not copy the word `ALIAS`;
   - keep MX, mail-related CNAME/TXT, CAA, SRV and verification records
     **DNS only**;
   - initially keep existing website A/AAAA/CNAME records **DNS only** so
     traffic continues directly to the current CloudFront, ALB, Amplify, S3,
     EC2 or other origin. Do not introduce an unreviewed Cloudflare orange-cloud
     proxy in front of an existing AWS CDN/proxy;
   - stop if Route 53 uses advanced routing or health checks until an equivalent
     Cloudflare design is approved. Never silently replace it with one static
     record.
5. If DNSSEC is enabled at the registrar or hosted zone, follow the official
   AWS/Cloudflare sequence to remove the old DS/public key and wait for registry
   confirmation. Do not change nameservers while public queries still return
   the old DS. After the Cloudflare zone is Active and DNS is verified, enable
   Cloudflare DNSSEC and publish its new DS through the AWS registration.
6. After Cloudflare assigns two nameservers, open AWS Route 53
   **Registered domains > domain > Actions > Edit name servers** and replace the
   Route 53 nameservers with the two exact Cloudflare nameservers. Editing only
   the apex NS record inside the old hosted zone does not change parent-zone
   delegation.
7. Wait until the Cloudflare zone is **Active**, then verify from multiple
   recursive resolvers and an off-site network:

   ```powershell
   nslookup -type=ns example.com 1.1.1.1
   nslookup -type=ns example.com 8.8.8.8
   nslookup -type=mx example.com 1.1.1.1
   ```

   Also verify apex/`www` HTTPS, every critical hostname, email delivery,
   SPF/DKIM/DMARC, certificate renewal and third-party domain verification.
8. Only after website and email verification, continue with the
   `warehouse.example.com` Tunnel route below. Do not replace apex or `www`.
9. Keep the old Route 53 hosted zone and original nameserver list through the
   DNS cache window and until website/email monitoring, Tunnel, Access/MFA and
   off-site acceptance all pass.

To roll back, restore the recorded four Route 53 nameservers under AWS
**Registered domains**. Rollback is also subject to DNS caching; re-test the
website, email and critical hostnames rather than treating a successful console
save as proof of recovery.

## 4. Verify the Local Baseline

From the repository root:

```bash
scripts/healthcheck.sh
scripts/backup-postgres.sh
```

Use the [backup and restore runbook](backup-restore.md) to confirm that the
recovery point covers both PostgreSQL and `storage/`. Do not activate public
ingress while local login, generation, downloads or backups are unhealthy.

## 5. Create the Named Tunnel

Cloudflare navigation as reviewed on 2026-07-24:

1. Sign in to the Cloudflare Dashboard.
2. Open **Networking > Tunnels**.
3. Create a remotely-managed tunnel.
4. Give it an explicit name such as `bestar-warehouse-production`.
5. From its **Overview**, choose **Add a replica** to display the connector
   installation command.
6. Copy that command only into a private local editor and extract the connector
   token that begins with `eyJ`.
7. **Do not run** the generated `docker run ... --token ...` command.
8. Close and clear the temporary editor document.

Treat the connector token as a password. It grants the ability to run the
tunnel and is not a Cloudflare API token.

## 6. Add the Published Route

Open the Tunnel's **Routes** tab and add a Published application route:

| Field        | Value                                               |
| ------------ | --------------------------------------------------- |
| Hostname     | Approved FQDN, for example`warehouse.example.com` |
| Service type | `HTTP`                                            |
| Service URL  | `http://nginx:80`                                 |

Create only this Web hostname. Do not create a wildcard or separate routes for
the API, database, Redis, SSH or Docker. The hostname must exactly match the
application environment configured below.

## 7. Store the Connector Token Safely

Run these commands in Bash from the repository root. Paste the token only at
the hidden prompt so it is not added to shell history:

```bash
umask 077
mkdir -p .secrets
printf 'Paste Cloudflare tunnel token, then press Enter: '
IFS= read -r -s CLOUDFLARE_TUNNEL_TOKEN
printf '\n'
printf '%s' "$CLOUDFLARE_TUNNEL_TOKEN" > .secrets/cloudflare-tunnel-token
unset CLOUDFLARE_TUNNEL_TOKEN
chmod 600 .secrets/cloudflare-tunnel-token
```

Inspect metadata and byte count only; never display the content:

```bash
ls -l .secrets/cloudflare-tunnel-token
wc -c < .secrets/cloudflare-tunnel-token
```

`.secrets/` is Git-ignored. The file must be a regular non-symlink file. On
Linux/macOS its mode must be `600` or `400`. On Windows NTFS, disable
inheritance and grant access only to required principals such as the deployment
account, `SYSTEM`, and local Administrators; do not grant Everyone,
Authenticated Users, built-in Users, or another broad group. Windows preflight
calls `scripts/verify-windows-secret-file-acl.ps1` to enforce this contract.
Never put the literal token in an `echo` command.

On Linux, a Compose file-backed secret can retain host ownership while this
repository runs `cloudflared` as UID `65532`. If logs report that the secret is
unreadable, have the deployment administrator install it for UID/GID `65532`
with mode `0400`, then run preflight with sufficient read permission; never
make it world-readable. Docker Desktop does not guarantee enforcement of
Compose secret `uid`/`gid`/`mode` attributes, so restrict the host file and
verify readability during the real startup.

## 8. Configure the Production Environment

Set these values in the root `.env`, replacing the sample hostname with one
real approved HTTPS origin:

```dotenv
PUBLIC_DEPLOYMENT_ENABLED=true
PUBLIC_BASE_URL=https://warehouse.example.com
CORS_ORIGINS=https://warehouse.example.com
BROWSER_COOKIE_SECURE=true
TRUSTED_PROXY_MODE=cloudflare-tunnel
TRUSTED_PROXY_CIDRS=<verified-private-Docker-proxy-CIDR-on-this-host>
AUTH_RATE_LIMIT_FAIL_CLOSED=true
CLOUDFLARE_TUNNEL_TOKEN_FILE=../../.secrets/cloudflare-tunnel-token
NEXT_PUBLIC_API_BASE_URL=/api
```

Also verify that:

- `JWT_SECRET` is unique to production and at least 32 characters;
- PostgreSQL and Redis use production configuration;
- `PUBLIC_BASE_URL` and `CORS_ORIGINS` are identical and contain no wildcard;
- the public hostname is not compiled into `NEXT_PUBLIC_API_BASE_URL`;
- `TRUSTED_PROXY_CIDRS` contains the explicitly verified private Docker proxy
  range, not a broad test fallback;
- neither `.env` nor `.secrets/` is tracked by Git.

## 9. Configure Access and MFA

In Cloudflare Zero Trust / Access:

1. Open **Access controls > Applications**.
2. Add a **Self-hosted** application for the entire public hostname.
3. Add one Allow policy for approved company users or groups.
4. Require MFA for the allowed identities.
5. Do not create a Bypass policy; identities outside the Allow policy must be
   denied by default.
6. Use a short pilot Access session, such as 24 hours, and review it after
   business approval.
7. Test an allowed identity, a denied identity and an incognito window.

After Access succeeds, the Bestar login page must still appear. Access does not
replace Bestar user attribution, roles or audit history.

### 9.1 Temporarily Remove and Restore Access for the Warehouse Hostname

This is a temporary downgrade made only after the operator explicitly accepts
the risk. It does not satisfy the `PUBLIC-DEPLOY-02` Access and MFA completion
gate. Delete only the warehouse hostname's Self-hosted application. Keep the
named Tunnel, published route, DNS, cache bypass, connector token, reusable
Allow policy, App Launcher, and Authenticator enrollment. Public traffic then
skips Access, while recovery does not require a new Tunnel token or MFA
enrollment.

Recorded recovery configuration (never store the literal approved email):

- application name: `Bestar Warehouse Production`;
- type: Self-hosted and private;
- public hostname: `warehouse.***.cc`, with a blank path for all routes;
- application session: 24 hours;
- policy: `Allow approved warehouse administrator`, Action Allow, Include the
  operator-approved current Cloudflare login email;
- no Everyone, Bypass, or public-path rule;
- Identity uses the Cloudflare IdP;
- Access globally allows Authenticator application; the application uses
  Custom MFA, Authenticator application, duration 24 hours;
- App Launcher reuses the same Allow policy with a 24-hour session;
- Cache Rule `Bypass Bestar warehouse application cache` stays Active.

Temporary removal:

1. Confirm Bestar login, rate limits, RBAC, audit, and backups remain healthy.
2. Under **Zero Trust > Access controls > Applications**, delete
   `Bestar Warehouse Production`. Do not delete the Tunnel route, DNS CNAME,
   cache rule, secret, App Launcher policy, or MFA enrollment.
3. Run `curl.exe -I https://warehouse.***.cc/` anonymously. It must return
   the Bestar response or application redirect directly and must not redirect
   to `*.cloudflareaccess.com`.
4. An incognito window must show the Bestar login page directly. Reconfirm that
   PostgreSQL, Redis, and the API still have no public host ports.

Recovery:

1. Open **Zero Trust > Access controls > Applications > Create new
   application > Self-hosted and private**.
2. Use name `Bestar Warehouse Production`, public hostname
   `warehouse.***.cc`, blank path, and a 24-hour application session.
3. Select **Add current policies** and reattach
   `Allow approved warehouse administrator`. Open the policy and prove it still
   contains only the operator-approved current Cloudflare login email; never
   change it to Everyone or Bypass.
4. Under **Authentication > MFA**, select Custom MFA, allow only Authenticator
   application, and use a 24-hour duration. Keep the Cloudflare IdP.
5. Save, then use anonymous HEAD/incognito to prove Access returns a redirect.
   Verify the allowed identity plus MFA reaches Bestar login and an unapproved
   identity is denied.
6. Finally confirm the hostname cache bypass is Active, `cloudflared` is
   healthy, and the LAN healthcheck passes. Do not claim the
   `PUBLIC-DEPLOY-02` gate until this recovery is complete.

## 10. Bypass Cloudflare Cache

Create a Cloudflare Cache Rule:

- match the exact Bestar public hostname;
- set cache eligibility to bypass;
- ensure no later rule re-enables caching.

Authenticated pages, APIs and generated-file downloads must not return a
Cloudflare cache hit such as `CF-Cache-Status: HIT`.

## 11. Start and Inspect

Run the contract and secret preflight first:

```bash
scripts/cloudflare-tunnel-local.sh preflight
```

Expected final line:

```text
Cloudflare named-tunnel startup preflight: PASS
```

Render the final Compose configuration when needed:

```bash
scripts/cloudflare-tunnel-local.sh config
```

The output may be long but must not contain the connector token. Start and
verify the route:

```bash
scripts/cloudflare-tunnel-local.sh start
scripts/cloudflare-tunnel-local.sh status
scripts/cloudflare-tunnel-local.sh logs
scripts/cloudflare-tunnel-local.sh probe
scripts/healthcheck.sh
```

`cloudflared` should remain running and become healthy. Logs should show
established connections rather than an authentication loop. `probe` verifies
that the connector-only network can reach nginx Web and `/api/health`.

## 12. Off-Site Acceptance

Use cellular data or another network outside the warehouse:

1. A denied identity cannot pass Cloudflare Access.
2. An approved identity must complete MFA.
3. Bestar login remains required after Access.
4. English and Chinese switching and refresh work without mixed-language text.
5. Each role sees only authorized navigation and actions.
6. Upload a non-sensitive acceptance fixture and generate its report.
7. Download reports, labels and wage files.
8. Bestar logout invalidates the application session.
9. Business pages and downloads are not cached by Cloudflare.
10. Audit history attributes actions to the actual Bestar user.

Do not include customer data, employee data, credentials, cookies or tokens in
acceptance screenshots.

## 13. Operations

| Operation                             | Command                                          |
| ------------------------------------- | ------------------------------------------------ |
| Validate configuration and token file | `scripts/cloudflare-tunnel-local.sh preflight` |
| Start                                 | `scripts/cloudflare-tunnel-local.sh start`     |
| Stop public connector only            | `scripts/cloudflare-tunnel-local.sh stop`      |
| Recreate nginx and connector          | `scripts/cloudflare-tunnel-local.sh restart`   |
| Inspect status                        | `scripts/cloudflare-tunnel-local.sh status`    |
| Inspect the latest 200 log lines      | `scripts/cloudflare-tunnel-local.sh logs`      |
| Probe connector-to-nginx access       | `scripts/cloudflare-tunnel-local.sh probe`     |
| Verify the local stack                | `scripts/healthcheck.sh`                       |

Stopping `cloudflared` must not stop PostgreSQL, Redis, Web, API, workers or LAN
access.

## 14. Rotate or Revoke the Token

For planned rotation:

1. Open the Tunnel under **Networking > Tunnels**.
2. Select **Refresh token**.
3. Use the hidden-input method from section 7 to write a new temporary secret
   file.
4. Verify only its permissions and byte count.
5. Atomically replace `.secrets/cloudflare-tunnel-token`.
6. Run:

   ```bash
   scripts/cloudflare-tunnel-local.sh preflight
   scripts/cloudflare-tunnel-local.sh restart
   scripts/cloudflare-tunnel-local.sh status
   scripts/cloudflare-tunnel-local.sh logs
   ```
7. Repeat allowed/denied Access and Bestar login checks.

This is currently a single-connector pilot, so a short interruption is
possible during rotation; zero downtime is not promised.

For suspected disclosure, first disable the Access application or Tunnel
route. Refresh the token, replace the local secret and restart, then remove the
old connector in Cloudflare. Deleting only the local file does not revoke a
leaked token.

## 15. Failure Drills and Rollback

Before approval:

1. Stop only `cloudflared`; public access fails closed while LAN login,
   generation and downloads remain healthy.
2. Restore the connector; public access returns without data recovery.
3. Disconnect warehouse Internet; public access fails while LAN data remains
   usable.
4. Restart/recreate nginx; the connector recovers after nginx is healthy.
5. Complete a restore test from a matching database plus `storage/` recovery
   point.

Full rollback:

1. Disable the Access application and public route/Tunnel in Cloudflare.
2. Run `scripts/cloudflare-tunnel-local.sh stop`.
3. Keep the local Compose stack and data volumes running.
4. Confirm the hostname fails off-site and the application remains healthy on
   the LAN.

The tunnel adds ingress only and does not migrate data, so normal rollback does
not require a database rollback.

## 16. Troubleshooting

| Symptom                               | Check                                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------------------------ |
| `TOKEN_FILE_MISSING`                | Token path, regular-file requirement and relative path in`.env`                          |
| `TOKEN_FILE_PERMISSIONS`            | Run`chmod 600 .secrets/cloudflare-tunnel-token`                                          |
| `TOKEN_FILE_PLACEHOLDER`            | Empty/placeholder content, whitespace or a value that is not the generated connector token |
| `PUBLIC_BASE_URL_MISSING`           | Missing real HTTPS public origin in`.env`                                                |
| Contract failure                      | Origins, proxy mode/CIDR,`jq` and Docker Compose v2                                      |
| Repeated tunnel authentication errors | Rotated/revoked/miscopied token or the wrong Tunnel                                        |
| Access 403                            | Allow policy, group membership, identity provider and MFA condition                        |
| Login loop or missing cookie          | HTTPS origin, CORS, secure cookie and trusted proxy settings                               |
| Upload 413                            | Public nginx configuration and current Cloudflare upload limit; do not bypass nginx        |
| Public works but LAN fails            | Host firewall,`HTTP_PORT` and nginx LAN binding; do not add router forwarding            |

## 17. Completion Gate

- One named tunnel and one approved public route exist;
- the token exists only in the protected secret file;
- preflight, status, probe and local healthcheck pass;
- Access denies by default and approved identities require MFA;
- Bestar login, RBAC, audit and both locales pass;
- business pages and downloads are not cached;
- off-site, outage, connector stop, token rotation and rollback are verified;
- a PostgreSQL plus `storage/` restore has evidence;
- no inbound port forwarding or public database, Redis or internal API exists.

---

## Official Cloudflare References / Cloudflare 官方资料

- [Register a new domain with Cloudflare Registrar](https://developers.cloudflare.com/registrar/get-started/register-domain/)
- [Cloudflare primary/full DNS setup](https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/)
- [Cloudflare partial CNAME plan availability](https://developers.cloudflare.com/dns/zone-setups/partial-setup/)
- [Cloudflare partial CNAME setup procedure](https://developers.cloudflare.com/dns/zone-setups/partial-setup/setup/)
- [Create a remotely-managed tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/create-remote-tunnel/)
- [Publish applications through a Tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/routing-to-tunnel/)
- [Remote tunnel permissions and token rotation](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/remote-tunnel-permissions/)
- [Cloudflare Access policies](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/)
- [Require MFA](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/mfa-requirements/)
- [Access application paths](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/)
- [Cache Rules settings](https://developers.cloudflare.com/cache/how-to/cache-rules/settings/)
- [Quick Tunnel limitations](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/)

## Official AWS References / AWS 官方资料

- [Route 53: change registered-domain nameservers](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/domain-name-servers-glue-records.html)
- [Route 53: configure or remove domain DNSSEC keys](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/domain-configure-dnssec.html)

Cloudflare navigation, plan limits and AWS registrar procedures can change.
Re-check the official pages before activation, nameserver changes or rotation.
