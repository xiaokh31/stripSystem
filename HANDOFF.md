# Bestar Agent Handoff

> 新会话必须先读 `AGENTS.md` 和本文件，再核对当前 Task、任务索引、完成度报告与 `git status`。本文件用于交接，不替代验收证据。

## 交接元数据

- Generated at: `2026-08-02T08:31:46Z`
- Source: `business-task-supervisor`
- Task: `PUBLIC-DEPLOY-04`
- Task file: `prompts/tasks/PUBLIC-DEPLOY-04Public Domain and LAN IP Login Coexistence Regression.md`
- Status: `CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING`
- Execution mode: `full`
- Session: `019fc141-92d2-7583-badd-3023fb517863`
- Git HEAD: `76013e8`
- Worktree: dirty; preserve and inspect existing changes
- Local supervisor artifacts: `/Volumes/xfl/logistics/stripSystem/.codex/business-agent-runs/20260802T065526Z-PUBLIC-DEPLOY-04-85071`

## 现在在做什么

PUBLIC-DEPLOY-04 repository work is complete; only the named external verification remains.

## 已完成

- 已完成公网 HTTPS 与 LAN HTTP 双入口并存修复、可信 ingress 分类、request-aware Cookie、精确 Origin/CSRF、nginx/Compose 隔离、审计归属、双语 runbook 和完整自动化。当前环境 Definition of Done 全部通过；仅剩真实公网域名与真实仓库 LAN IP 现场验证。

### Changed files

- .env.example
- .gitignore
- HANDOFF.md
- apps/api/src/app.setup.ts
- apps/api/src/auth/auth.controller.ts
- apps/api/src/auth/browser-cookie.spec.ts
- apps/api/src/auth/browser-cookie.ts
- apps/api/src/auth/browser-csrf.guard.ts
- apps/api/src/auth/browser-ingress.spec.ts
- apps/api/src/auth/browser-ingress.ts
- apps/api/src/auth/browser-session.service.ts
- apps/api/src/auth/distributed-auth-rate-limiter.service.spec.ts
- apps/api/src/common/trusted-proxy.spec.ts
- apps/api/src/common/trusted-proxy.ts
- apps/api/src/config/app.config.ts
- apps/api/src/config/public-deployment.config.spec.ts
- apps/api/src/config/public-deployment.config.ts
- apps/web/e2e/public-deploy-04-dual-ingress.spec.ts
- apps/web/src/middleware.ts
- docs/reports/project-completion-status.html
- docs/reports/public-deploy-04-dual-origin-login-verification.md
- docs/runbooks/cloudflare-named-tunnel-deployment.md
- infra/docker/compose.cloudflare-tunnel.yml
- infra/docker/compose.local.yml
- infra/docker/compose.public-dual-ingress-test.yml
- infra/docker/compose.public-lan-disabled-test.yml
- infra/docker/compose.public.yml
- infra/nginx/nginx.public.conf
- infra/nginx/public-edge-emulator.conf
- prompts/tasks/OPEN-FUNCTIONS-20260707Task Index.md
- prompts/tasks/PUBLIC-DEPLOY-02Cloudflare Tunnel Local Canonical Pilot.md
- prompts/tasks/PUBLIC-DEPLOY-04Public Domain and LAN IP Login Coexistence Regression.md
- scripts/cloudflare-tunnel-local.sh
- scripts/run-public-deploy-04-dual-ingress.sh
- scripts/test-cloudflare-tunnel-contract.sh
- scripts/verify-cloudflare-tunnel-contract.sh
- scripts/verify-cloudflare-tunnel-local-integration.sh
- scripts/verify-public-deployment-contract.sh

### Tests and verification actually run

- 修复前聚焦红灯：1 failed / 10 passed；修复后 ingress/config/cookie/trusted proxy：4 suites / 35 tests PASS
- API：lint、typecheck、production build PASS；52 suites / 429 unit tests、21 suites / 131 E2E tests PASS
- Web：lint、typecheck、production build PASS；285 unit tests PASS
- Worker：247 tests PASS
- PUBLIC-DEPLOY-04 四阶段 Chromium runner PASS：双入口正常、public outage/LAN 业务继续、public 恢复、LAN host publication 停用时 public 仍可登录
- Chromium 覆盖 en/zh-CN、light/dark、390/1366、实际 200% browser zoom、Cookie、refresh、logout、错误 Origin/Host、导入/解析/生成/下载
- 清理前 public/LAN 成功登录与拒绝请求 ingress audit attribution SQL 断言 PASS
- public deployment、Cloudflare Tunnel 正负向合同及本地故障演练 PASS
- Prisma：39 migrations，database schema up to date
- Full-stack healthcheck、bash syntax、git diff --check PASS
- 最终残留检查：task imports、users、auth audits、browser sessions、任务 storage artifacts 均为 0

## 卡在哪里

### Remaining implementation

- No remaining implementation was reported.

### External verification

- 在真实公网域名的全新隐私窗口验证 Access（如启用）、登录、RBAC、refresh、reload、logout，并确认公网 Cookie 为 Secure。
- 在真实仓库 LAN IP或批准 hostname 的另一隐私窗口重复验证，并确认 Cookie 为 host-only、non-Secure。
- 停止真实 Tunnel connector或仓库 Internet，验证 public fail closed、LAN 可重新登录并完成导入/生成/下载；恢复后无重复业务写入。
- 只阻断真实 LAN firewall/listener，验证公网登录不受影响，并确认 API、PostgreSQL、Redis 无直接暴露。
- 现场 apply 前建立 PostgreSQL 与 storage 同一恢复点的匹配备份，并保留脱敏证据。

### Blockers

- No blocker was reported.

## 下一步

- 仅在目标部署执行真实公网域名与真实 LAN IP 外部矩阵；全部通过后同步 Task、Task Index、完成度报告、专项报告和 HANDOFF 为 DONE，不启动另一开发 Task。

## 不要再踩的坑

- 不得通过全局关闭 Secure Cookie、使用 wildcard CORS 或信任客户端 forwarded headers 修复 LAN 登录。
- 公网与 LAN 必须使用不同、精确批准的 host/origin；LAN HTTP 只能绑定可信私网并由防火墙限制，禁止 Internet 端口转发。
- 测试导入的 API 删除是软删除；精确 fixture 清理必须在删除测试用户前完成，否则 imported_by_id 会置空。
- macOS Bash 3 不支持 mapfile/readarray，专项 runner 必须保持 Bash 3 兼容。
- Docker Desktop 的 edge DNS/hairpin 不稳定；runner 使用临时 edge IP extra_hosts，不能误作生产配置。
- 当前 synthetic runner 不是现场 Cloudflare/LAN 证据；真实域名、IP、Cookie、token、账号和客户数据不得写入报告。

## 新会话启动清单

1. Read `AGENTS.md` and `.codex/skills/bestar-handoff/SKILL.md`.
2. Run `git status --short`; preserve all existing changes.
3. Read the Task file above plus `prompts/tasks/OPEN-FUNCTIONS-20260707Task Index.md` and `docs/reports/project-completion-status.html`.
4. Verify this handoff against code, tests, runtime state, and artifacts before acting.
5. Do not execute any Task marked `Task-Status: ARCHIVED`.

## 权威参考

- `prompts/tasks/PUBLIC-DEPLOY-04Public Domain and LAN IP Login Coexistence Regression.md`
- `prompts/tasks/OPEN-FUNCTIONS-20260707Task Index.md`
- `docs/reports/project-completion-status.html`
- `docs/runbooks/business-agent-execution.md`
