# Bestar Agent Handoff

> 新会话必须先读 `AGENTS.md` 和本文件，再核对当前 Task、任务索引、完成度报告与 `git status`。本文件用于交接，不替代验收证据。

## 交接元数据

- Generated at: `2026-07-25T04:58:38Z`
- Source: `manual-documentation-session`
- Work item: `Cloudflare Named Tunnel bilingual operator runbook`
- Task file: none; this was a direct documentation request
- Status: `COMPLETE`
- Git HEAD: `b82156d`
- Worktree: dirty with the documentation changes listed below; preserve them
- Previous supervised Task: `WEB-DASHBOARD-09` remains `DONE`

## 现在在做什么

Cloudflare Named Tunnel 独立中英双语操作手册已完成；没有剩余文档实现。真实
Cloudflare 账户、域名、Tunnel、Access/MFA、外网验收和 token 轮换仍属于外部
部署操作，不能因文档完成而视为已启用。

## 已完成

- 核对现有公网部署总览、PUBLIC-DEPLOY-02 产物、Compose overlay 和
  `scripts/cloudflare-tunnel-local.sh`。原指南内容完整但主体为英文，且埋在
  平台比较长文中。
- 新增独立中英双语 Named Tunnel 操作手册。两种语言均覆盖架构、安全边界、
  Cloudflare Dashboard、公开 route、secret 文件、`.env`、Access/MFA、
  cache bypass、启动/停止、外网验收、token 轮换/撤销、故障演练、回滚和
  完成门槛。
- 更新公网总览、新手生产部署指南和本地部署指南的醒目入口。
- 将本地旧 Caddy + 公网 IP HTML 指南标记为历史备选，并指向 Named Tunnel
  手册；通过 `.gitignore` 白名单让两份部署文档可被版本控制。
- 依据 2026-07-24 Cloudflare 官方文档核对当前 Tunnel、token、Access/MFA、
  cache 和 Quick Tunnel 边界。

### Changed files

- `.gitignore`
- `HANDOFF.md`
- `docs/runbooks/cloudflare-named-tunnel-deployment.md`（新增）
- `docs/runbooks/external-ip-domain-access.html`（纳入跟踪并标记历史备选）
- `docs/runbooks/local-deployment.md`
- `docs/runbooks/production-deployment-beginner-guide.md`
- `docs/runbooks/public-access-and-free-cloud-deployment.md`

### Tests and verification actually run

- `git diff --check`：通过。
- 对全部本次文档执行尾随空白扫描：无匹配。
- 核对文档引用的 Named Tunnel/healthcheck/backup 脚本、三个 Compose 文件和
  backup runbook：路径均存在。
- 核对新增 Markdown 相对链接和中英文 17 个对应章节：结构完整。
- `xmllint --html --noout docs/runbooks/external-ip-domain-access.html` 返回 0；
  旧解析器仅报告 HTML5 `<main>` 标签提示。
- 未运行 Docker、应用测试或真实 Cloudflare 连接；本次只有文档改动。

## 卡在哪里

### Remaining implementation

- None for this documentation request.

### External verification

- 需要部署负责人在真实 Cloudflare 账户中创建 Named Tunnel 和唯一公开
  hostname，配置 Access 默认拒绝、批准组、MFA 和 cache bypass。
- 需要在非公司网络完成允许/拒绝身份、Bestar 登录/RBAC、上传下载、i18n、
  审计、断网、停止 connector、token 轮换和回滚验收。
- 需要在目标 Linux/Windows Docker 主机验证 file-backed secret 的 UID/GID
  可读性和主机防火墙 LAN 范围。

### Blockers

- No documentation blocker. External activation requires the company domain,
  Cloudflare account, approved identities and a maintenance window.

## 下一步

- 部署负责人先阅读
  `docs/runbooks/cloudflare-named-tunnel-deployment.md` 的中文部分，准备域名、
  身份组、MFA、恢复点和维护窗口；不要先复制或运行带 token 的 Dashboard
  `docker run` 命令。

## 不要再踩的坑

- 不使用 Quick Tunnel，不在路由器开放入站 80/443，不暴露数据库、Redis、
  API、SSH 或 Docker。
- Tunnel token 只写入 `.secrets/cloudflare-tunnel-token`，不得进入 `.env`、
  命令参数、Git、截图、日志或交接。
- Cloudflare Access 不能替代 Bestar 登录、RBAC 和审计。
- Named Tunnel 不会迁移数据，也不能解决仓库停电、主机停机或断网。
- `TRUSTED_PROXY_CIDRS` 必须按目标 Docker 网络核实，不得照抄测试 fallback。
- 当前是单 connector pilot，token 轮换可能短暂中断，不承诺零停机。

## 新会话启动清单

1. Read `AGENTS.md` and `.codex/skills/bestar-handoff/SKILL.md`.
2. Run `git status --short`; preserve all documentation changes above.
3. For public activation, read the bilingual Named Tunnel runbook, then
   `prompts/tasks/PUBLIC-DEPLOY-02Cloudflare Tunnel Local Canonical Pilot.md`,
   the Task index and completion report.
4. Reconcile external Cloudflare state; do not infer activation from repository
   files.
5. Do not execute any Task marked `Task-Status: ARCHIVED`.

## 权威参考

- `docs/runbooks/cloudflare-named-tunnel-deployment.md`
- `docs/runbooks/public-access-and-free-cloud-deployment.md`
- `prompts/tasks/PUBLIC-DEPLOY-02Cloudflare Tunnel Local Canonical Pilot.md`
- `prompts/tasks/OPEN-FUNCTIONS-20260707Task Index.md`
- `docs/reports/project-completion-status.html`
- `docs/runbooks/business-agent-execution.md`
