Task-Status: ARCHIVED
Archived-On: 2026-07-22
Archive-Scope: OCI Always Free A1 ARM64 cloud-canonical deployment route
Archive-Reason: Product reversed the OCI decision and reopened PUBLIC-DEPLOY-02 named-tunnel local-canonical deployment.
Archive-Note: The interrupted PUBLIC-DEPLOY-03 repository changes were reverted; do not execute this historical Task.
Reactivation: Requires explicit product approval, removal of this marker, and synchronized Task index/completion report updates.

# 执行 PUBLIC-DEPLOY-03：OCI Always Free ARM64 Cloud Canonical Profile

## 决策门槛与执行边界

- 优先级：已归档，不在当前执行队列；以下内容仅供以后恢复参考。
- 只有产品明确选择“远程可用性优先，接受仓库依赖 Internet”，并且
  `PUBLIC-DEPLOY-01Public Internet Security Baseline.md` 已 `DONE` 后才能启动。
- 若本地 canonical stack 已通过 PUBLIC-DEPLOY-02 对外服务，本 Task 是受控 migration/cutover，不是新增第二个 writer。
- 一个 fresh supervisor Session 只执行本 Task。不得在没有维护窗口、最终 backup/restore/hash 核对时切换真实数据。
- 仓库任务负责 ARM64 image、cloud Compose、网络/存储/备份契约、迁移工具和文档；OCI account、Canadian home region、
  A1 capacity、domain、MFA 和真实 cutover 属于外部审批/验证，自动化完成前不得以外部条件为由停工。

## 对应产品需求

当公司 Internet、供电或本地 Docker 主机不稳定时，授权人员仍需要从公网访问。该路线把完整 canonical stack 迁到
一个 OCI Canadian-region VM，使 off-site 请求不经过公司网络；迁移后仓库访问依赖公司 outbound Internet。

## 必须读取

- `AGENTS.md`、`HANDOFF.md`、`CONTEXT.md`
- `prompts/agents/business-logic-agent.md`
- `.codex/skills/bestar-handoff/SKILL.md`
- `.codex/skills/docker-local-deploy/SKILL.md`
- `.codex/skills/auth-rbac/SKILL.md`
- `.codex/skills/nestjs-prisma-api/SKILL.md`
- `.codex/skills/unloading-report-generator/SKILL.md`
- `.codex/skills/pallet-label-generator/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- `docs/adr/0005-single-writer-public-access-and-cloud-hosting.md`
- `docs/runbooks/public-access-and-free-cloud-deployment.md`
- `docs/runbooks/deploy-linux.md`、`backup-restore.md`、`database-migrations.md`、`monitoring-alerting-siem.md`
- 全部 Compose/Dockerfiles、`.dockerignore`、`.env.example`、storage/backup scripts 和 document-generator tests
- PUBLIC-DEPLOY-01 的 DONE 证据；如已执行 02，也读取其 profile/运行证据和退役要求
- OCI 官方 Always Free、home region、Canadian regions、block/object storage、backup、budget/quota 和 idle-reclaim 文档

## 权威资源与风险口径

1. 按 2026-07-22 官方保守额度设计：A1 总计 2 OCPU/12 GB、boot + block volume 合计 200 GB、最多 5 个 free
   volume backups。控制台显示更大额度时也不得把更大值写成硬依赖。
2. A1 是 `linux/arm64`。API 内嵌 Python Worker、Web、Worker、PostgreSQL、Redis、nginx、WeasyPrint/Cairo/Pango、CJK
   fonts、openpyxl/pandas/qrcode 及所有报告/标签工具必须在 ARM64 真实运行，不接受“镜像 build 成功”代替工件验证。
3. OCI Always Free 可能 out of host capacity，低使用率实例可能按官方规则被回收，free-only 无生产 SLA/support。
   不制造 fake load 规避回收；以监控、备份、容量退出和付费 VM fallback 管理风险。
4. Always Free 资源必须在 home region；home region 创建后不可更改。只在业务/隐私审批后选择 Toronto/Montreal 等
   当前可用 Canadian region，并在创建前复核实时容量和条款。
5. 云 VM 是唯一 writer。不得做 PostgreSQL logical dual-write、双向 rsync、共享文件夹 active-active、DNS round-robin
   到本地和云，或在 cutover 后保留可写 local system。

## 实现要求

### 1. ARM64 and multi-platform image contract

- 使 production images 明确支持 `linux/arm64`；如继续支持开发机 amd64，则用受测 multi-platform contract，不复制
  两套漂移 Dockerfiles。
- 所有 base image/version/digest 和 native OS package 必须存在 ARM64 variant。不得从 host 拷贝 amd64 binary、venv、
  `node_modules`、LibreOffice cache 或 build output。
- 增加结构化 architecture check 和 BuildKit/buildx smoke；运行容器内验证 `uname -m`/image platform，以及实际 parser、
  Excel report、wage workbook、150x100 mm label PDF、25 mm QR、HTML task report。
- 保留 frozen pnpm/uv locks 和 Docker-only workflow，不升级业务 dependency 来掩盖平台问题。

### 2. Dedicated cloud production Compose

- 新增 standalone cloud production profile，不复用会公开 host PG/Redis 的 local Compose 端口配置。
- 只允许 protected HTTPS ingress，推荐在 VM 内用 named Cloudflare Tunnel + Access；PostgreSQL、Redis、API、Worker、
  Docker socket、debug/metrics 均不可公开。SSH 优先 OCI Bastion/限定管理 CIDR，不在仓库写真实 key/IP。
- VM reboot 后按 dependency/health 顺序自动恢复；migration 必须串行且失败时 API 不接受 writes。
- 设 CPU/memory/pids/log rotation/health/restart 边界，并在 2 OCPU/12 GB 下测量 idle、parse/report/label/wage generation
  和并发 queue peak。不能通过删除 PostgreSQL/Redis/审计/工件生成功能“适配”免费额度。
- runtime `storage/` 和 PostgreSQL data 必须位于明确 durable block-volume mount；container writable layer 不得成为权威存储。

### 3. Backup, restore and provider exit

- 扩展现有 scripts，使 cloud host 能生成同一恢复点的 PostgreSQL dump、`storage/` archive、manifest/checksum 和加密
  off-host copy；secret/key 由外部 secret store/host 提供，不入 Git/log/handoff。
- OCI volume backup 是附加恢复层，不替代可移出 provider 的 PostgreSQL + storage backup。
- 增加 retention、capacity/freshness alert、restore rehearsal 和 provider-exit runbook。验证 storage path containment、
  原始上传/generated files/hash/audit relationship。
- 所有测试数据需 synthetic/approved fixture，不上传真实客户或员工文件到未审批云账号。

### 4. Single-writer migration and rollback tooling

- 提供可重复、默认 dry-run 的 preflight/export/import/verify/cutover checklist 或脚本，至少记录：maintenance/write freeze、
  source DB identity、schema migration status、row counts、storage manifest/hash、backup timestamp、target empty/expected state、
  restore result 和 public smoke。
- target 已有未知业务数据、source 未冻结、DB/storage recovery point 不匹配、hash/count 异常时 fail closed。
- cutover 不得由脚本悄悄改 DNS 或删除 local data；最后的启用/停用需要双人核对并记录时间和责任人，不记录个人敏感信息。
- 回退区分“云端尚无新 write”和“云端已有新 write”。后一种必须先将最新 cloud DB + storage 一致恢复点回迁并验证，
  不能直接打开旧 local snapshot。

### 5. Capacity, cost and operations

- 自动/文档检查预算和 quotas、home region、Always Free labels、boot/block total、backup count、public resources 和 egress；
  仓库不能声称这些外部设置已完成，需 checklist 签字。
- 监控 CPU/memory/network/disk、PostgreSQL/storage/backup growth、queue depth、failed parser/report/label/wage jobs、public health、
  auth/rate-limit/audit anomalies 和 backup freshness。
- 记录 A1 capacity unavailable、instance reclaimed/provider outage、disk near-full、backup failure 和 paid VM migration playbook。
  不使用 synthetic keepalive 规避 idle policy。

## i18n 100% 硬门禁

1. 新增 maintenance/read-only、migration unavailable、upload/storage capacity、generation delayed、session/public auth 等应用
   可见状态全部进入 typed `en` / `zh-CN` catalogs。
2. API/Worker 只产生 stable code/enum/labelKey/raw source data；不得把 CLI/provider English error 原样显示给用户。
3. English 页面只显示 English，中文页面只显示中文；SSR first frame、hydration、refresh、locale switch、queue polling、
   generation/download failure 和 maintenance transition 不得英文闪现、raw code 或双语同屏。
4. 用户界面不得出现 container architecture、OCI tenancy/region OCID、private IP、mount path、backup key、stack trace 或
   其他代码/基础设施提示。
5. CLI/runbook 可保留工程英文，但不得通过 DOM walker/CSS hiding/宽泛 ignore 绕过业务 UI i18n gate。

## 自动化与验证

1. Static/Compose：cloud config valid、ARM64-capable images、no public DB/Redis/API、durable mounts、secret redaction、resource/
   health/restart/log policy、public mode fail closed。
2. ARM64 runtime：在 native ARM64 或 buildx/QEMU 环境运行 API/Web/Worker/PostgreSQL/Redis/nginx，验证 health、migration、
   auth、queue 和实际 Excel/PDF/QR/HTML artifacts；记录性能和内存峰值，不能只 inspect manifest。
3. Migration rehearsal：隔离 fixture DB + storage 执行 freeze/export/checksum/restore/migrate/verify；负向覆盖 source changes、
   mismatched archive、corrupt file、target non-empty、insufficient disk 和 failed migration。
4. Backup/restore：加密 off-host handoff、retention/freshness/capacity check 和完整 restore drill；不得破坏当前业务数据。
5. Full stack：API/Web/Worker lint/typecheck/unit/E2E/build、全部 migrations、healthcheck，以及 import/parse/report/label/load/
   inventory/work-hours/unloading-wage focused smoke。
6. Chromium：en/zh-CN、ADMIN/OFFICE/HR_MANAGER/WAREHOUSE_MANAGER、320/390/1366、200% zoom、light/dark、reload、
   maintenance、RBAC、upload/generate/download；console/pageerror/hydration/missing translation 为 0。
7. 真实 OCI 外部 gate：Canadian home region/A1 allocation、cold boot/reboot、public Access/MFA、non-company network、warehouse
   network、backup target、budget alert、72-hour observation 和 approved cutover/rollback rehearsal。无账号时只能在自动化全部
   完成后列为 external pending。

## 验收标准

1. 完整 stack 在保守 2 OCPU/12 GB 的 `linux/arm64` 环境启动并通过真实 document artifact 和业务 smoke。
2. cloud profile 只公开 protected HTTPS ingress，data/queue/internal services private，PostgreSQL和 `storage/` 使用 durable mount。
3. backup/restore/provider-exit 可复现，DB 与文件 manifest/hash 同一恢复点，off-host encrypted copy 和 alerts 有明确 contract。
4. migration 在 write freeze、target/preflight、count/hash/migration/smoke 任何异常时 fail closed；无 active-active 或数据丢失回退。
5. resource/cost/idle reclaim/capacity/no-SLA 风险有监控和 paid fallback，不声称免费平台提供生产保证。
6. public auth、RBAC、audit、strict en/zh-CN、核心业务、Docker/migration/ARM64/Chromium 门禁全部通过。
7. cloud/local runbook、Task Index、完成度报告和 `HANDOFF.md` 记录真实 canonical host、外部证据、回退点和下一动作，
   不含 secret/客户/员工数据。

## 非目标

- 不建立 active-active、hot standby writable local、数据库双写或自动 conflict resolution。
- 不将 PostgreSQL 替换为 Oracle/MySQL/免费 serverless DB，不把 storage 随意拆到多个 free SaaS。
- 不制造流量规避 OCI idle reclaim，不自动升级付费资源，不在仓库保存 cloud credential。
- 不修改解析、托盘、库存、扫码、报告、工时或拆柜工资业务规则。

## 完成输出

- 列出 Docker/Compose/ARM64/storage/backup/migration/monitoring/i18n/test/runbook changed files。
- 给出真实 architecture、resource peak、artifact、migration negative、backup/restore 和 full-stack test counts。
- 明确当前唯一 canonical writer、local system 是否 stopped/read-only、云端是否接受过 writes，以及安全 rollback point。
- 仓库实现已完成但 OCI capacity/account/domain/外网/72-hour/cutover 未完成时返回
  `CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING` 并逐项列外部证据；不得以“正在执行”结束。
- 外部 cutover 和 observation 全部关闭后才返回 `DONE`。不得在同一 Session 再启动其他 Task。
