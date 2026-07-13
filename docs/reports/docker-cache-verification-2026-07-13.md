# DOCKER-CACHE-01 Docker 缓存验证报告

日期：2026-07-13

## 结论

API、Web、Worker 和 Web E2E 镜像已采用“依赖清单与锁文件 → frozen
dependency install → application source”的稳定分层。Compose 运行时不再用
named volumes 遮蔽镜像内的 `node_modules`、`.next` 或 `.venv`，也不再执行依赖
安装、Prisma Client 生成或应用 build。PostgreSQL named volume 和真实 `storage/`
bind mount 保持不变。

## 实测时间

以下为同一 macOS Docker Desktop 环境的观察值，不是跨机器性能承诺。

| 场景 | 优化前 | 优化后 | 结果 |
| --- | ---: | ---: | --- |
| API/Web/Worker/E2E cold `--no-cache` build | 164.04s | 227.57s | 两次均成功；cold 值受网络、基础镜像和首次依赖下载影响 |
| 无源码变化的 warm build | 147.56s | 5.88s | 优化后 dependency、source 和 build layers 全部命中 cache |
| API/Web/Worker 强制 recreate/start | 38.96s | 15.07s | 优化后启动不安装依赖、不生成 Client、不 build |
| 纯 API/Web/Worker/nginx restart | 未单独记录 | 8.43s | 健康检查通过 |
| 临时源码变更 cache probe | 不适用 | 114.51s | 五个 dependency install layers 均为 `CACHED` |
| 临时 manifest/lock 变更 probe | 不适用 | 173.18s | 对应的五个 dependency install layers 均被正确重建 |

优化前 warm build 因 broad build context 中业务 Agent 运行产物变化而重新执行依赖
安装和较大镜像 export；优化后的 `.dockerignore` 和按服务复制范围消除了该失效源。

## 自动化与运行时验证

- `docker compose -f infra/docker/compose.local.yml config --quiet`：通过。
- `scripts/verify-docker-cache-contract.sh --static`：通过。
- `scripts/verify-docker-cache-contract.sh --source-probe`：通过。
- `scripts/verify-docker-cache-contract.sh --manifest-probe`：通过。
- Web E2E image build、直接 Playwright `--help` entry 和 `--list` 收集 8 个文件中的
  42 项测试：通过，无 pnpm runtime wrapper。
- API lint、typecheck：通过；API unit 26 suites / 220 tests：通过。
- Web lint、typecheck、188 unit tests：通过。
- Worker 124 pytest：通过。
- Prisma migrate status：22 migrations，schema up to date。
- API 镜像内 `unloading-worker --help`：通过，证明 API 镜像自带独立 Worker
  Python 环境，不依赖 Worker container 的 `.venv`。
- `scripts/healthcheck.sh`：API、Web、Next static assets、PostgreSQL 和 storage
  均通过。
- API/Web/Worker/nginx 运行日志未出现 `pnpm install`、`uv sync`、Prisma
  generate 或 application build。

## 持久化证据

- recreate/restart 前后 `_prisma_migrations` 均为 22。
- 现有 storage 样本
  `storage/unloading_wage_settlements/2026-06/cmrhbhjuc03rj7lpvj4rfe4uu/settlement-report.html`
  的 SHA-256 前后均为
  `bfc8a29ecfc45a94cd2980fd9dcbed4129704c0a7d4f724462256be80554173a`。
- API 与 Worker 只挂载真实 `storage/`；Web 不挂载 runtime volume；PostgreSQL
  继续挂载 `docker_bestar_postgres_data`。

## 已处理的验证反馈

初次 cold build 暴露 Worker project build backend 尚未进入 cache，已保留 frozen
sync 并让第二阶段只安装本地 project。缩窄 build context 后，Web locale contract
测试缺少 API dashboard source、Worker fixture regression 缺少 `docs/fixtures.md`；
两者均以单文件 COPY 补入测试镜像，没有扩大 dependency layer 的失效范围。API/Web
recreate 还暴露 nginx 缓存旧 upstream 地址，现由 Compose dependency restart
传播解决。

旧 runbook 的 API 命令 `pnpm --filter api test -- --runInBand` 在当前 pnpm/Jest
组合中会把 `--runInBand` 当成测试路径 pattern，因而报告 0 tests；命令已更正为
`pnpm --filter api test --runInBand`，并通过 26 suites / 220 tests。

## 限制与人工操作

- BuildKit cache 是 Docker builder 本机缓存；新主机首次 build 仍需下载基础镜像和
  依赖。
- cold build 时间会随网络、registry 和平台架构变化。
- 旧 dependency volumes 未自动删除，避免破坏其他 checkout。可按
  `docs/runbooks/local-deployment.md` 的精确 allowlist 手工删除；不得删除
  `docker_bestar_postgres_data`。
