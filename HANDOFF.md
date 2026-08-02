# Bestar Agent Handoff

> 新会话必须先读 `AGENTS.md` 和本文件，再核对当前 Task、任务索引、完成度报告与 `git status`。本文件用于交接，不替代验收证据。

## 交接元数据

- Generated at: `2026-08-01T21:16:00-06:00`
- Source: `production-update-automation`
- Task: `WAGE-HOURS-08`
- Task file: `prompts/tasks/WAGE-HOURS-08Parsed Attendance Wage Workbook Generation Regression.md`
- Status: `CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING`
- Execution mode: `production deployment automation`
- Session: current Codex desktop session
- Git HEAD: `30d7b1b`
- Worktree: dirty with production incident docs, update scripts/tests, and this handoff;
  preserve all changes
- Local supervisor artifacts: `/Volumes/xfl/logistics/stripSystem/.codex/business-agent-runs/20260801T143326Z-WAGE-HOURS-08-67856`

## 现在在做什么

WAGE-HOURS-08 repository work remains complete and its status remains
`CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING`. The post-update production API startup
incident is repaired; only the named Microsoft Excel external verification remains.
The cause, repeatable recovery procedure, actual evidence, and prevention rules are now
recorded in section 13.1 of `docs/runbooks/cloudflare-named-tunnel-deployment.md`.
The post-`git pull` Windows production update entry is implemented and documented in
section 13.2; no live production update was run while business-pause status was unknown.

## 已完成

- 仓库实现、自动化验证及当前环境 Definition-of-Done 已全部完成。工资表生成采用 schema fail-closed、唯一 staging、BIFF/期间/Sheet/计数/manifest/SHA 验证和原子发布；API、异步任务与双语 UI 仅传播安全稳定代码。真实 7 月样本已通过完整 UI 异步生成、列表刷新和 Web 代理下载闭环。本次复核确认全部服务健康、无残留运行文件、现场源文件与模板 SHA 未变化、git diff 检查通过。当前环境未复现历史故障，因此未虚构唯一根因。现在仅剩指定的 Microsoft Excel 外部格式验收。
- 生产更新故障已修复。用户看到的 `dependency api failed to start` 不是 API
  TypeScript build 失败；`bestar_api_local` 实际在启动命令的 Prisma migration 阶段稳定
  返回 `P1000` 并循环重启。更新命令没有显式加载仓库根目录 `.env`，也没有叠加
  `compose.public.yml` 和 `compose.cloudflare-tunnel.yml`：新 API/PostgreSQL 容器使用了
  同一组非生产 Compose 值，但持久化 PostgreSQL 角色仍使用已轮换的生产凭据，因此认证
  失败；同一错误还把 PostgreSQL/Redis 主机端口重新暴露出来。没有记录或显示任何凭据。
- 修复前确认 BullMQ active/wait/paused/delayed/prioritized/waiting-children 均为 0，
  并创建、验证当前 PostgreSQL SQL 恢复点
  `C:\bestar-backups\postgres-pre-api-env-repair-20260801-204245.sql`。随后使用显式
  `--env-file .env` 以及 local/public/tunnel 三个 Compose 文件重新构建 API 并全量重建
  运行容器；持久化 PostgreSQL volume 和 host-mounted `storage/` 均保留。
- Redis 在当前 Compose 中没有持久化 volume；本次重建会重置其临时 BullMQ key。重建前
  已证明没有 active/wait/paused/delayed/prioritized/waiting-children job，因此本次修复没有
  丢失进行中或待处理任务。失败更新本身此前已经重建过 Redis；数据库中的业务记录和
  审计记录未被删除。
- 恢复后 API 与 PostgreSQL 容器配置均与根目录 `.env` 一致；API、PostgreSQL、Redis、
  Web、worker、nginx 和 cloudflared 全部 healthy，API restart count 为 0，PostgreSQL/
  Redis 仅保留容器内部端口。Tunnel 注册 4 条连接且近期错误为 0，公网域名返回 HTTP
  200 并落到 Bestar `/login`。
- 已在 Cloudflare named-tunnel runbook 的中英文 section 13.1 记录本事件：明确区分
  image build、Prisma startup 和 dependency summary；解释 root `.env`/overlay 遗漏、
  persistent PostgreSQL role password 和错误 host-port binding 的因果链；提供 BullMQ
  live-state 硬门禁、数据库备份、受控 Compose 参数、重建、迁移/健康/端口/Tunnel/公网
  验证和 `jq` 防复发要求。文档不包含任何凭据或业务 payload。
- 已新增 `scripts/update-production.ps1` 及 Windows CMD 入口。正常模式要求显式
  `-BusinessPaused`、clean/synchronized `main`、完整生产 `.env`、安全 token ACL、
  public/tunnel Compose port contract 和 BullMQ live state 全为 0；随后在停机前创建
  PostgreSQL + storage 匹配备份并构建 API/Web/worker 镜像，构建通过后才停止入口、
  `up --wait`，最后验证容器、restart count、host ports、API logs、Prisma、healthcheck、
  Tunnel origin 和公网 HTTPS。脚本不运行 `git pull`，不输出完整 Compose/env，不使用
  `down -v`，也不自动删除 volume。
- `-ValidateOnly` 为只读模式；真实 CMD 入口已对当前生产 Git/upstream、`.env`、Compose
  JSON、token ACL、BullMQ 六类状态、七容器健康、PostgreSQL/Redis 端口和 Git Bash
  备份路径完成验证。开发期唯一允许的 dirty-worktree 例外
  `-AllowDirtyWorktreeForValidation` 在文档中明确禁止用于正式生产。

### Changed files

- `docs/runbooks/cloudflare-named-tunnel-deployment.md`
- `scripts/update-production.ps1`
- `scripts/update-production.cmd`
- `scripts/test-update-production-contract.ps1`
- `HANDOFF.md`
- The production repair also changed Docker runtime state and created the external SQL
  recovery point; no application, migration, Compose, or business files were changed.

### Tests and verification actually run

- Original red loop: repeated `docker logs bestar_api_local` showed Prisma `P1000`;
  post-fix two samples were `running|healthy|0` and recent P1000/P3009/P3018/error
  matches were 0.
- Secret-safe comparisons proved the broken containers disagreed with root `.env`,
  then proved both API and PostgreSQL matched it after recreation.
- `docker compose ... build api`: PASS; frozen dependency, Prisma generate, and Nest
  production build layers completed and the image exported successfully.
- PostgreSQL backup SQL header/non-zero-size validation: PASS (20,353,235 bytes).
- `pnpm --filter api prisma migrate status`: 39 migrations, schema up to date.
- `scripts/healthcheck.sh`: PostgreSQL, API, Web, Next static assets, and storage
  writability PASS.
- Tunnel origin probe: exit 0; cloudflared healthy with 4 registered connections and
  0 recent errors.
- Public HTTPS check: HTTP 200, final URL is the Bestar login page.
- Final Docker port check: API/Web/PostgreSQL/Redis expose container ports only;
  nginx is the sole LAN host binding and all seven services are healthy.
- Documentation verification: the copied PowerShell `$bestarCompose` command parsed the
  real production configuration and returned the expected seven services without
  rendering secrets; Chinese/English section counts were 1/1, code fences were balanced,
  referenced backup runbook existed, added secret-like matches were 0, and
  `git diff --check` passed.
- `powershell.exe ... scripts/test-update-production-contract.ps1`: PASS. It parsed the
  script with Windows PowerShell, checked all required safety stages/order, rejected
  destructive/secret-output patterns, verified CMD forwarding, and exercised the
  missing-business-pause failure gate.
- `scripts\update-production.cmd -ValidateOnly -AllowDirtyWorktreeForValidation`: PASS
  against the real host. The first run correctly exposed that `docker port` exits 1 for
  the desired no-binding state; runtime checking was changed to Docker inspect JSON.
  A later run correctly exposed a broken login-shell profile; all Git Bash helper calls
  now use profile-independent `bash -c`. The final CMD validation passed and did not
  create backups, build images, or restart containers.
- Final documentation/static checks: Chinese/English 13.2 count 1/1, code fences
  balanced, added secret-like matches 0, and `git diff --check` passed.

## 卡在哪里

### Remaining implementation

- No remaining implementation was reported.

### External verification

- 在办公室 Windows 上通过真实 /work-hours 受保护流程重新上传获批的同一 7 月样本，执行 Parse、Generate 并下载；使用 Microsoft Excel 逐个员工 Sheet 检查日期、工时、颜色、行高列宽、Print Preview 和下载文件名。

### Blockers

- No blocker was reported.

## 下一步

- Review and commit/push the production-update scripts, contract test, runbook, and
  handoff so the next `git pull` receives the automation. During the next approved
  maintenance pause, run `scripts\update-production.cmd -ValidateOnly` followed by
  `-BusinessPaused`. WAGE-HOURS-08 still separately requires the listed Microsoft Excel
  external verification.

## 不要再踩的坑

- 最新 HANDOFF.md 是监督器启动时生成的恢复快照，内容落后于权威 Task、报告、当前工作树及持久化证据；不得将其单独作为完成证明。
- 当前 checkout 未复现准确历史异常，不得把未经观察的假设写成唯一根因，也不得移除新增的 fail-closed 防线。
- 真实现场样本不得生成 screenshot、trace 或 video；员工姓名、Sheet 名和打卡时间不得进入日志、报告或 HANDOFF。
- scripts/run-wage-hours-08-e2e.sh 是 Bash 脚本；使用 sh 检查 process substitution 会产生假语法错误。
- 不要在同一容器并发运行 pnpm 命令，依赖状态检查可能竞争 node_modules 符号链接。
- 公网生产更新不得只运行 `docker compose -f infra/docker/compose.local.yml ...`；这会
  漏掉生产 `.env` 和 public/tunnel overlays，可能再次触发数据库 `P1000` 并暴露
  PostgreSQL/Redis 主机端口。必须使用 `scripts/cloudflare-tunnel-local.sh`，或使用包含
  `--env-file .env` 和全部三个 Compose 文件的等价受控命令。
- 当前 PowerShell 的 `bash.exe` 指向未安装发行版的 WSL；Git Bash 位于
  `C:\Program Files\Git\bin\bash.exe`。该 Git Bash 当前缺少 `jq`，因此生命周期脚本
  `preflight` 会正确失败为 `JQ_REQUIRED`；在下一次公网生命周期维护前安装可用的 `jq`，
  不要通过省略 overlay 或 `.env` 来绕过预检。
- 代码更新使用 `scripts\update-production.cmd -BusinessPaused`，且必须先完成
  `git pull --ff-only`；脚本本身不会拉取代码。正式更新拒绝 dirty worktree，禁止使用
  `-AllowDirtyWorktreeForValidation`。只读预检可用 `-ValidateOnly`。
- 更新脚本不依赖 `jq`，但手工 Tunnel lifecycle/Bash contract 仍需要 `jq`。Git Bash
  helper 必须使用非 login `bash -c`，不得重新改成会加载部署账号 `.profile` 的 `-lc`。
- 在运行中的 Web 容器执行 next build 后，必须重启 Web/nginx 再运行静态资源 healthcheck。
- 脱敏视觉 fixture 的隐藏容量填充用于保持 legacy BIFF workbook stream 容量；不得删除、缩减或取消隐藏对应填充行。
- CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING 的 remaining_work 必须为空；唯一外部检查只能记录在 external_verification。
- 不得在本 Session 启动 PUBLIC-DEPLOY-04。

## 新会话启动清单

1. Read `AGENTS.md` and `.codex/skills/bestar-handoff/SKILL.md`.
2. Run `git status --short`; preserve all existing changes.
3. Read the Task file above plus `prompts/tasks/OPEN-FUNCTIONS-20260707Task Index.md` and `docs/reports/project-completion-status.html`.
4. Verify this handoff against code, tests, runtime state, and artifacts before acting.
5. Do not execute any Task marked `Task-Status: ARCHIVED`.

## 权威参考

- `prompts/tasks/WAGE-HOURS-08Parsed Attendance Wage Workbook Generation Regression.md`
- `prompts/tasks/OPEN-FUNCTIONS-20260707Task Index.md`
- `docs/reports/project-completion-status.html`
- `docs/runbooks/business-agent-execution.md`
- `docs/runbooks/cloudflare-named-tunnel-deployment.md` section 13.1
