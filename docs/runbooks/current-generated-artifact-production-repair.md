# Current Generated Artifact Production Repair

## 中文操作指南

### 适用场景

同一个柜号在旧版本系统中多次生成拆柜报告或托盘面单，重新生成没有替换原文件，
导致数据库中同一 `(container, fileType)` 存在多条 `GENERATED` 记录。

本流程随 `UNLOAD-REPORT-04` 提供，目标是：

- 保留一份经过文件存在性和 SHA-256 校验的当前版本；
- 将其他成功版本标记为 `SUPERSEDED`；
- 让办公室文件区域只显示一份当前拆柜报告和一份当前托盘面单；
- 保留旧版本的 bytes、生成者、时间、SHA 和替换审计。

这里的“清理”是清理**当前文件状态和办公室显示**，不是物理删除历史文件。不要
手工执行 `rm`，也不要直接删除 `generated_files` 数据库行。

### 工具行为

命令：

```bash
pnpm --filter api repair:current-generated-files
```

生产环境必须通过 Docker Compose 运行，不能在宿主运行 pnpm。

- 默认模式为只读 dry-run。
- 只有增加 `--apply` 才会修改数据库。
- 只处理 `EXCEL_REPORT` 和 `PALLET_LABEL_PDF` 的重复 `GENERATED` 组。
- 每组按 `createdAt DESC, id DESC` 选择最新且满足以下条件的版本：
  - 路径位于 `STORAGE_ROOT` 内；
  - 实际文件存在且可读；
  - 实际 SHA-256 与数据库一致；
  - 不与另一个候选记录共享同一 storage path。
- 工具不会删除任何历史文件 bytes。
- 当前工具的 `--apply` 会处理 dry-run 中列出的**全部重复组**，不能只处理其中
  一个柜号。

### 必须停止的情况

出现任一情况都不得运行 `--apply`：

- dry-run 包含 `NO_VERIFIABLE_CURRENT_ARTIFACT`；
- `invalidIds` 或 `sharedPathIds` 未完成原因核对；
- 提议的 `winnerId` 不是业务希望保留的版本；
- dry-run 出现多个重复组，但没有逐组确认；
- PostgreSQL 和 `storage/` 尚未完成同一维护窗口备份；
- API/队列仍可能生成报告或面单。

如果需要保留较旧版本，而不是工具建议的最新有效版本，当前工具不支持人工覆盖
winner。此时停止操作，另立开发任务增加按柜号和 generated-file ID 指定 winner
的受控能力；不得用手工 SQL 模拟。

## 生产清理流程

以下命令在项目根目录执行。Windows Docker 主机使用 WSL 2 或 Git Bash 执行 Bash
备份脚本。将备份目录改为仓库和 Docker volume 之外的独立磁盘。

### 1. 确认代码版本并构建新镜像

必须使用已包含以下文件的批准版本：

- `apps/api/src/generated-files/repair-current-generated-files.ts`
- migration `20260730010000_current_generated_artifact`
- migration `20260730011000_current_generated_artifact_repair_audit`

只构建镜像不会修改数据库：

```bash
docker compose -f infra/docker/compose.local.yml build api web worker-python
```

### 2. 进入维护窗口并停止写入

保持 PostgreSQL 和 Redis 运行，停止可能接受请求或处理生成任务的服务：

```bash
docker compose -f infra/docker/compose.local.yml stop nginx web api worker-python
```

确认 API 已停止后再继续。维护期间不要从其他主机访问办公室系统。

### 3. 备份 PostgreSQL 和 storage

```bash
export COMPOSE_FILE=infra/docker/compose.local.yml
export BACKUP_DIR=/path/outside/repository/bestar-repair-backup
scripts/backup-postgres.sh
scripts/backup-storage.sh
```

确认两个备份文件都存在且非空。保留本次维护使用的确切文件名。

### 4. 运行只读 dry-run

```bash
docker compose -f infra/docker/compose.local.yml run --rm --no-deps api \
  pnpm --filter api repair:current-generated-files \
  | tee "$BACKUP_DIR/current-generated-files-dry-run.json"
```

检查：

- `apply` 必须为 `false`；
- `duplicateGroupCount` 是预期数量；
- 每组 `findingCode` 必须为 `CURRENT_WINNER_VERIFIED`；
- `winnerId` 和 `winnerSha256` 必须存在；
- `invalidIds` 和 `sharedPathIds` 必须为空。

工具默认选择最新且校验通过的文件。对于“已有报告后又重新生成”的正常情况，新的
有效报告应成为 winner，旧报告进入 `SUPERSEDED` 历史。

### 5. 只读核对候选时间和 ID

此查询只显示重复组的柜号、文件类型、记录 ID、生成时间和 SHA，不修改数据库：

```bash
docker compose -f infra/docker/compose.local.yml exec -T postgres sh -lc '
psql -X -v ON_ERROR_STOP=1 -P pager=off \
  -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
WITH duplicate_groups AS (
  SELECT container_id, file_type
  FROM generated_files
  WHERE container_id IS NOT NULL
    AND status = '\''GENERATED'\''
    AND file_type IN ('\''EXCEL_REPORT'\'', '\''PALLET_LABEL_PDF'\'')
  GROUP BY container_id, file_type
  HAVING COUNT(*) > 1
)
SELECT
  c.container_no,
  gf.file_type,
  gf.id,
  gf.created_at,
  gf.file_sha256
FROM generated_files gf
JOIN duplicate_groups dg
  ON dg.container_id = gf.container_id
 AND dg.file_type = gf.file_type
JOIN containers c ON c.id = gf.container_id
WHERE gf.status = '\''GENERATED'\''
ORDER BY c.container_no, gf.file_type, gf.created_at DESC, gf.id DESC;
"'
```

将 dry-run 的 `winnerId` 与该查询及业务人员确认的重新生成时间逐组对照。不要把
生产柜号、文件 ID 或 SHA 粘贴到公共聊天、提交记录或 `HANDOFF.md`。

### 6. 应用修复

只有前述检查全部通过后执行：

```bash
docker compose -f infra/docker/compose.local.yml run --rm --no-deps api \
  pnpm --filter api repair:current-generated-files -- --apply \
  | tee "$BACKUP_DIR/current-generated-files-apply.json"
```

该步骤会：

- 保留 winner 为 `GENERATED`；
- 将其他候选改为 `SUPERSEDED`；
- 在 migration 尚未创建 audit table 时写入受限的临时替换 marker；
- 不删除 storage 中的历史文件。

并发数据变化会返回 `CURRENT_REPAIR_CONCURRENT_CHANGE` 并停止，不得忽略错误继续。

### 7. 执行 migration

```bash
docker compose -f infra/docker/compose.local.yml run --rm --no-deps api \
  pnpm --filter api prisma migrate deploy
```

Migration 会建立 replacement audit 和“每柜每类型最多一个 current”的数据库唯一
约束，并把 pre-migration repair marker 转换为正式
`VERIFIED_STORAGE_REPAIR` 审计。

如果 migration 返回 `CURRENT_GENERATED_FILE_REPAIR_REQUIRED`，表示仍存在重复组。
回到 dry-run 查明原因，不要删除 migration 记录或绕过唯一索引。

### 8. 验证重复组已经清零

再次运行 dry-run：

```bash
docker compose -f infra/docker/compose.local.yml run --rm --no-deps api \
  pnpm --filter api repair:current-generated-files \
  | tee "$BACKUP_DIR/current-generated-files-after.json"
```

必须得到：

```json
{
  "apply": false,
  "duplicateGroupCount": 0,
  "findings": []
}
```

### 9. 启动系统并验证

```bash
docker compose -f infra/docker/compose.local.yml up -d
scripts/healthcheck.sh
```

在办公室系统中验证目标柜号：

1. 文件区域最多显示一份当前拆柜报告和一份当前托盘面单。
2. 当前拆柜报告可以下载，SHA/内容对应业务确认的重新生成版本。
3. 旧记录不再显示为当前文件。
4. 已知旧 file ID 的普通下载请求返回 `GENERATED_FILE_SUPERSEDED`。
5. 再次重新生成时仍只保留一个当前报告槽位。

## 回滚

- dry-run 不修改任何数据，无需回滚。
- `--apply` 后如 winner 错误、migration 失败或验证不通过，保持应用服务停止，不要
  继续执行手工 SQL。
- 使用本次维护前的 PostgreSQL 与 storage 配对备份，按照
  `docs/runbooks/backup-restore.md` 的确认式恢复流程回滚。
- 恢复后重新核对数据库、storage 和下载文件，不要只恢复其中一项后直接开放流量。

## 历史文件物理删除

本流程不会物理删除旧报告，这是有意设计：

- 每次生成必须可审计；
- async job、correction 和 replacement audit 仍可能引用旧 generated-file；
- 直接删除 bytes 会造成历史记录指向不存在文件。

如果未来需要回收存储空间，应另行制定带保留周期、法律/业务批准、引用检查、
dry-run、审计和恢复能力的 generated-artifact retention policy。不要把该需求混入
本次重复 current 修复。

## English Summary

1. Stop all writers but keep PostgreSQL running.
2. Back up PostgreSQL and `storage/` as one recovery point.
3. Run `repair:current-generated-files` without `--apply`.
4. Approve every proposed `winnerId`. Stop on invalid/shared paths or
   `NO_VERIFIABLE_CURRENT_ARTIFACT`.
5. Run the tool with `--apply`, then run Prisma migrations.
6. Re-run dry-run and require `duplicateGroupCount: 0`.
7. Start the stack and verify one current report plus one current label.
8. Historical bytes remain audit evidence; never delete them manually.
