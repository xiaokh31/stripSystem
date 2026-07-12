# 执行 DOCKER-DEV-01：Cleanup Host Jest Install and Enforce Docker-Only Workflow

## 必须读取与使用的 skills

- `AGENTS.md`
- `CONTEXT.md`
- `.codex/skills/docker-local-deploy/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- `docs/runbooks/local-deployment.md`
- `infra/docker/compose.local.yml`
- `infra/docker/api.Dockerfile`
- root/API/Web package files and `pnpm-lock.yaml`
- `apps/api/test/jest-e2e.json`
- `apps/api/test/setup-e2e-env.ts`
- `.codex/execpolicy.rules`
- `prompts/agents/business-logic-agent.md`

## 已确认事实

1. Jest 并不是刚为当前任务引入的业务运行依赖：API 的 `test: jest`、Jest config 和大部分
   Jest/ts-jest devDependencies 从项目初期就存在。
2. `setup-e2e-env.ts` 从 2026-07-09 起只在 E2E 测试进程中设置 `NODE_ENV=test` 和默认
   `QUEUE_ENABLED=false`，用于避免测试启动真实 BullMQ worker；它不是日常 Docker runtime 配置。
3. 当前 tracked `apps/api/package.json`、`pnpm-lock.yaml`、Jest config/setup 没有本次新增 diff，不能删除。
4. 宿主工作区在 2026-07-12 出现约 1.1GB root `node_modules`，另有 package-level
   `apps/api/node_modules` 和 `apps/web/node_modules`。Docker Compose 已使用 named volumes 提供容器依赖，
   这些 host dependency artifacts 重复且没有必要。
5. 项目 `.env` 当前没有 `NODE_ENV`、`QUEUE_ENABLED` 或 `JEST_WORKER_ID` 持久配置。
6. `bestar_api_local` 容器可解析 Jest `30.0.0`、ts-jest `29.4.11`，既有 API unit smoke 已通过。

## 任务目标

清理业务 Agent 刚才在宿主机产生的 Node/Jest 安装副作用和任何 test-only 持久环境覆盖，同时保留 Docker
容器内原有 Jest 测试能力。完成后，本项目的本地依赖、测试、构建、Prisma 和 worker 检查全部经 Docker。

## 清理范围

### 1. 建立清理清单

- 在删除前输出 dry-run，记录 path、realpath、类型、大小和 mtime。
- 仅允许以下经 realpath 验证仍位于当前仓库内的 host paths：
  - `<repo>/node_modules`
  - `<repo>/apps/api/node_modules`
  - `<repo>/apps/web/node_modules`
- 检查 package-level 路径是目录还是 pnpm symlink，并记录；不得跟随链接删除仓库外目标。
- 不清理用户全局 pnpm store、其他仓库、Docker named volumes、Web `.next` volume、worker `.venv` volume。

### 2. 安全删除宿主依赖产物

- 新增一个受路径 allowlist、realpath containment 和 dry-run/apply 模式保护的清理脚本；`--apply` 仅删除
  上述三个精确路径。用户已授权本任务执行 apply，不再请求人工确认。
- 清理脚本不得接受任意路径参数，不得触碰 `storage/`、`.git/`、samples、数据库备份或 Docker volume。
- 删除完成后验证 host paths 不存在，Docker Compose 容器依赖仍存在且服务健康。

### 3. 审计 test-only 环境变量

- 检查项目 `.env` / `.env.*`、business-agent launcher/profile、项目脚本，以及仅针对这些 key 的用户
  shell startup entries：`NODE_ENV`、`QUEUE_ENABLED`、`JEST_WORKER_ID`、`JEST_*`。
- 只移除能确认由本次业务 Agent 新增且会影响日常环境的持久配置；不得输出 shell profile 中其他秘密。
- 保留 `apps/api/test/setup-e2e-env.ts` 及 test command 内的 process-scoped env。
- 不修改 Docker API 日常 runtime 为 `NODE_ENV=test`；queue 的 runtime 配置继续服从 Compose/业务配置。

## Docker-only 执行约束

1. 更新 `docs/runbooks/local-deployment.md`：依赖由 Compose service command/named volume 管理，不运行 host
   `pnpm install`；提供 API/Web/Worker/Prisma 的 Docker 命令。
2. 更新 business-agent exec policy，禁止直接 host `pnpm`、`npm`、`npx`、`yarn`、`jest`、`next`、
   `prisma` 和 `uv` 开发命令；允许同一命令作为 `docker compose exec/run` 的容器参数。
3. 增加 policy tests：host `pnpm install`/`pnpm --filter api test` 为 forbidden，documented Docker command
   为 allowed；不得禁止 `docker compose` 本身。
4. API unit/E2E、Web lint/typecheck/test/build、worker pytest、Prisma generate/migrate 均给出 Docker-only 示例。
5. Android/iOS/Windows native packaging 是明确例外，只有对应 native task 可在平台 host toolchain 执行。

## 不得删除或修改

- `jest`、`ts-jest`、`@types/jest` package declarations。
- `apps/api/package.json` 中 test scripts/Jest config。
- `apps/api/test/jest-e2e.json` 和 `setup-e2e-env.ts`。
- `pnpm-lock.yaml` 中合法 Jest dependency graph。
- Docker named volumes、PostgreSQL、Redis、storage 或真实业务数据。

## i18n 硬门禁

本任务不新增业务 UI。若新增脚本状态页面或用户可见 Web 提示，文案必须进入 en/zh catalog；CLI/runbook
技术输出可以使用英文，但不得被当作业务 UI 文案。

## 验收标准

1. 三个确认的 host `node_modules` 路径清理完成，未删除任何仓库外路径。
2. root/API/Web package 与 lockfile 没有为了清理而删除 Jest 依赖或发生无关 churn。
3. `.env` 和 shell profile 无本次新增的持久 test-only变量；test setup 保留。
4. Docker full-stack 保持 healthy，nginx/API/Web healthcheck 通过。
5. API 容器内 Jest/ts-jest 可解析，target unit test 通过；Web/worker focused test 在各自容器通过。
6. business-agent policy 拒绝 host package/test 命令并允许 documented Docker Compose 命令。
7. runbook、AGENTS 和 business-agent 标准一致声明 Docker-only。

## 测试命令

- `docker compose -f infra/docker/compose.local.yml ps`
- `docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api exec jest --version`
- `docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api exec jest src/common/container-lifecycle.spec.ts --runInBand`
- `docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web test`
- `docker compose -f infra/docker/compose.local.yml exec -T worker-python uv run pytest`
- `scripts/healthcheck.sh`
- business-agent execpolicy allow/deny smoke
- `git diff --check`

