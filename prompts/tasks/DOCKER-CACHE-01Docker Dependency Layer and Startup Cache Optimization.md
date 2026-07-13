# 执行 DOCKER-CACHE-01：Docker Dependency Layer and Startup Cache Optimization

## 优先级与执行边界

- 优先级：P1 工程效率任务。
- 必须等当前正在执行的业务 Task 到达受监督终态后，再以一个新的 supervisor session 执行本任务。
- 本任务只优化 Docker 构建缓存、镜像内容和容器启动流程，不修改任何业务规则、数据库 schema、API contract
  或用户界面。
- 当前工作区可能存在其他 Task 的未提交修改。必须保留并适配这些修改，不得 reset、checkout、覆盖或清理。

## 必须读取与使用的资料

- `AGENTS.md`
- `CONTEXT.md`
- `.codex/skills/docker-local-deploy/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- `prompts/agents/business-logic-agent.md`
- `docs/runbooks/business-agent-execution.md`
- `docs/runbooks/local-deployment.md`
- `infra/docker/compose.local.yml`
- `infra/docker/api.Dockerfile`
- `infra/docker/web.Dockerfile`
- `infra/docker/worker-python.Dockerfile`
- `infra/docker/web-e2e.Dockerfile`
- `.dockerignore` 以及任何 Dockerfile-specific ignore 文件
- `package.json`、`pnpm-workspace.yaml`、`pnpm-lock.yaml`
- `apps/api/package.json`、`apps/web/package.json`
- `apps/worker-python/pyproject.toml`、`apps/worker-python/uv.lock`

## 已确认的性能问题

1. API、Web 和 worker Dockerfile 当前先执行 `COPY . .`，任意源码或无关文档变化都会使后续镜像层失去
   可复用边界。
2. API 容器每次创建或重建后都会执行 `pnpm install`、Prisma generate、Prisma migrate 和 API build。
3. Web 容器每次创建或重建后都会执行 `pnpm install` 和完整 Next.js production build。
4. worker 容器每次创建后都会执行 `uv sync`。
5. Node modules、pnpm store、Web `.next` 和 worker `.venv` named volumes 会覆盖镜像内同路径内容，导致
   依赖和构建产物不能简单地在镜像阶段固化；API 还依赖 Python worker CLI，不能只优化独立 worker 容器。
6. API/Web 当前使用 `--frozen-lockfile=false`，既降低可复现性，也无法把 lockfile 作为严格缓存契约。
7. `web-e2e.Dockerfile` 同样在完整源码 COPY 后安装依赖，普通源码变化会重复执行安装层。

## 任务目标

建立可复现、可测量的 Docker 依赖缓存和启动契约：

1. package manifest/lockfile 未变化时，API、Web、worker 和 Web E2E 的依赖安装层必须命中 BuildKit 缓存。
2. 只修改业务源码时，只重新执行必要的编译/打包层，不重新下载或安装 Node/Python 依赖。
3. 已构建镜像的容器 restart/recreate 不再执行 `pnpm install`、`uv sync`、API build 或 Web build。
4. package manifest/lockfile 变化时，对应依赖层必须正确失效并按 frozen lockfile 重新安装。
5. 保持 Docker-only 本地开发、完整测试能力、API 内 Python worker 调用、Prisma migration、nginx 路由以及
   PostgreSQL/storage 持久化行为不变。

## 实现要求

### 1. 建立基线与缓存测量

- 修改前记录 API、Web、worker-python 和 e2e-web 的冷构建、热构建、容器 recreate/start 用时与关键
  BuildKit step；修改后使用相同命令重新记录。
- 将硬件/网络相关时间作为观察值，不设置脆弱的固定秒数门槛。硬门禁是依赖 step 是否执行、是否显示
  `CACHED`，以及 runtime command 是否仍包含安装/构建。
- 在 `docs/reports/` 增加简洁的 Docker cache verification report，记录命令、前后结果、缓存命中证据和
  已知限制；不要提交完整超长构建日志。
- 禁止为了测量执行 `docker system prune`、`docker builder prune`、`docker volume prune`、
  `docker compose down -v` 或删除现有业务数据。需要模拟冷构建时使用非破坏性的 `--no-cache` 或独立
  image tag/build context。

### 2. 分离依赖层、源码层与构建层

- API、Web、worker-python 和 e2e-web 必须先 COPY 各自依赖解析所需的最小 manifest/lockfile，再执行
  frozen dependency install；应用源码必须在依赖层之后 COPY。
- Node 安装使用 committed `pnpm-lock.yaml` 和精确 Corepack/pnpm 版本，改为 frozen lockfile。不得删除
  lockfile 校验、自动重写 lockfile 或通过 host `node_modules` 提供依赖。
- Python 安装使用 committed `uv.lock` 和 `uv sync --frozen`；优先分离第三方依赖层与本项目源码安装层，
  避免 worker 源码变化重新下载第三方 wheel。
- 可使用 BuildKit cache mounts 缓存 pnpm store 与 uv cache；并行构建共用可写 cache 时必须采用安全的
  cache id/sharing 策略，不能产生损坏或偶发安装失败。
- 使用 target-specific COPY 或 Dockerfile-specific ignore 缩小各服务 build context 的失效范围。不得遗漏
  API/worker 测试需要的真实 fixtures、Excel 模板、字体或 runtime 文件，也不得把 `.env`、storage、备份、
  测试结果、host dependency artifacts 或 native build artifacts 放入镜像。

### 3. 固化可运行、可测试的镜像

- API TypeScript build、Prisma client generate 和 Web production build 移至镜像构建阶段。运行中的容器
  必须保留 lint、typecheck、unit/E2E test 所需依赖，确保现有 Docker-only 检查命令继续可用。
- API 镜像必须独立包含可执行的 Python worker 环境。`uv run unloading-worker ...` 的 parse/report/label/
  attendance 等既有调用不能依赖 worker-python 容器先启动并写入共享 `.venv` 才能工作。
- worker-python 镜像必须包含 frozen Python 环境和 `unloading-worker` console script；运行时不得联网或
  再次 sync 才能通过 healthcheck/test。
- Web 镜像必须直接包含与当前源码匹配的 `.next` 产物；不得被空或陈旧的 runtime named volume 覆盖。
- 保留当前 WeasyPrint/Cairo/Pango/CJK fonts、uv、Prisma/OpenSSL 等实际 runtime 依赖。不要在本任务中升级
  Node、pnpm、Python、Playwright 或业务 package 版本。

### 4. 精简 Compose 启动流程

- API runtime 允许继续执行 `prisma migrate deploy` 后启动已构建的 NestJS 产物，但不得重新安装依赖、
  generate client 或编译 API。
- Web runtime 只启动已构建的 Next.js 应用，不得重新安装依赖或执行 `next build`。
- worker-python runtime 不得执行 `uv sync`；保持当前服务职责，不借本任务改变 queue/worker 业务架构。
- 移除或调整会覆盖镜像依赖/构建产物的 pnpm store、Node modules、`.next`、`.venv` runtime mounts。
  PostgreSQL volume 和 host `storage/` bind mount 必须原样保留。
- 不得自动删除机器上遗留的旧 dependency named volumes。若它们不再被引用，只在 runbook 中给出带精确
  volume 名称的可选人工清理说明，并明确不得删除数据库 volume；任务验收不依赖执行该清理。
- 保持现有 service names、nginx URL、healthcheck、restart policy、端口、环境变量和启动依赖关系。

### 5. 建立程序化缓存契约检查

- 新增可重复运行的 Docker cache contract/benchmark 脚本，至少自动检查：
  - Compose config 可以解析。
  - runtime command 不包含 `pnpm install`、`uv sync`、API build 或 Web build。
  - dependency manifests/lockfiles 在 broad source COPY 之前进入 Dockerfile。
  - install 使用 frozen lockfile。
  - 不存在会遮蔽 baked `node_modules`、`.next` 或 `.venv` 的 runtime mount。
- 脚本应支持一次 source-only cache probe：以不破坏工作区的临时内容变化使源码层失效，并验证 Node/Python
  dependency layers 仍为 `CACHED`。必须使用 trap/临时目录清理 probe，不得修改或还原用户业务文件。
- 记录 package/lockfile 改动会使对应 dependency layer 失效的验证方法；可以使用隔离临时 context，不得为
  验证而修改当前工作区的 committed lockfile。
- 测试不得只匹配某一条易变化的日志字符串后就宣称通过；同时检查 Dockerfile/Compose 静态契约和实际
  BuildKit 行为。

### 6. 文档同步

- 更新 `docs/runbooks/local-deployment.md`，删除“依赖安装到 runtime named volumes”和“每次容器启动安装/
  build”的过时描述。
- 明确三种操作：源码变化后 rebuild affected service、只需 restart 的场景、manifest/lockfile 变化后的
  dependency rebuild。
- 说明首次冷构建需要下载依赖，之后源码构建应复用依赖层；列出如何查看 `--progress=plain` 缓存命中。
- 如 AGENTS/business-agent 文档中的 Docker-only 命令或运行模型受影响，进行最小一致性更新；不得放宽
  Docker-only 约束。

## 数据与安全约束

1. 不得运行 destructive Docker prune/down-volume 命令。
2. 不得删除或重建 PostgreSQL 数据、Redis、`storage/`、原始 Excel、生成报告、标签、审计或备份。
3. 不得把 `.env`、JWT secret、数据库密码、真实业务数据或 host cache 打进 image layer。
4. 不得引入依赖漂移；frozen install 失败时修复真实 manifest/lockfile 一致性，不得退回 non-frozen。
5. 不得用常驻 host package manager、host `node_modules` 或宿主 Python venv 绕过 Docker 问题。
6. 不得通过跳过 build、healthcheck、migration 或测试换取表面上的速度提升。

## i18n 硬门禁

- 本任务不应新增业务 UI。
- 如确需新增任何用户可见 Web 文案，必须使用显式 en/zh catalog key、保持 catalog parity，并验证两种语言
  单语显示；不得硬编码中英文、不得同屏双语、不得依赖 DOM 扫描/替换。
- CLI、BuildKit verification report 和 runbook 的工程诊断文本可以使用英文，但不能进入业务 UI。

## 验收标准

1. `docker compose config` 通过，API、Web、worker-python、nginx、PostgreSQL、Redis 和 e2e profile 定义有效。
2. 从无本任务 image cache 的冷构建可以使用 frozen lockfiles 完成，不依赖 host Node/Python 环境。
3. manifest/lockfile 未变化时，连续两次构建的 dependency install steps 均显示缓存命中；源码层变化不会
   重新执行 pnpm/uv dependency install。
4. package manifest 或 lockfile 在隔离 probe 中变化时，只有对应 dependency layer 及其后续层正确失效。
5. API/Web/worker 容器 restart 或 recreate 时，日志和 container command 中没有 dependency install、
   Prisma generate、API build 或 Web build。
6. API 容器无需 worker 容器写入共享 venv，即可执行 Prisma、NestJS、Jest 和 `unloading-worker`；worker 容器
   可执行完整 pytest。
7. Web 容器使用镜像内当前 `.next`，页面静态资源、nginx `/api` route 和健康检查正常。
8. Web E2E image 在只改测试/业务源码时复用 dependency layer，Playwright CLI 和既有测试入口可运行。
9. PostgreSQL named volume 与 `storage/` mount 未变化，重建服务后既有数据库和业务文件仍存在。
10. cache contract 脚本、前后测量报告和 local deployment runbook 一致，且没有通过绝对秒数制造不稳定测试。
11. API/Web/worker focused checks、Docker full-stack smoke、healthcheck 和 `git diff --check` 全部通过。
12. 未修改业务逻辑、schema、i18n catalog 或 UI；若不可避免新增可见文案，则 en/zh 门禁全部通过。

## 必须执行的测试与证据

```bash
docker compose -f infra/docker/compose.local.yml config
```

```bash
docker compose -f infra/docker/compose.local.yml build --progress=plain api web worker-python
docker compose -f infra/docker/compose.local.yml build --progress=plain api web worker-python
docker compose -f infra/docker/compose.local.yml --profile e2e build --progress=plain e2e-web
```

```bash
docker compose -f infra/docker/compose.local.yml up -d --build
docker compose -f infra/docker/compose.local.yml ps
scripts/healthcheck.sh
```

```bash
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api lint
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api typecheck
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api test -- --runInBand
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api prisma migrate status
docker compose -f infra/docker/compose.local.yml exec -T api uv run --directory apps/worker-python unloading-worker --help
```

```bash
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web lint
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web typecheck
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web test
docker compose -f infra/docker/compose.local.yml exec -T worker-python uv run pytest
```

- 执行新增的 Docker cache contract/source-only probe 脚本。
- 对比并记录 cold、warm、source-only 和 recreate 的 BuildKit/runtime 证据。
- 验证重建前后数据库记录和 `storage/` 中至少一个既有文件仍存在；只读核对，不修改真实业务数据。
- `git diff --check`

## 完成输出要求

业务开发 Agent 必须按受监督终态协议返回结果，并列出：

1. 修改的 Dockerfile、Compose、脚本和文档。
2. cold/warm/source-only/recreate 的测量摘要及 dependency layer cache 命中证据。
3. 实际运行的全部测试及结果。
4. PostgreSQL/storage 未受影响的验证证据。
5. 已知限制，例如首次冷构建仍受网络和基础镜像下载速度影响。
6. 任务终态只能是 `DONE`、有明确外部验证项的 `CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING`，或满足连续
   阻塞证明要求的 `BLOCKED`；不得以“仍在执行”或进度汇报结束。
