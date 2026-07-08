执行 P5-PILOT-01：Windows Target Deployment Verification。

优先级：
- Pilot 前必做；偏运维验收，不是业务功能开发。

必须读取：
- AGENTS.md
- docs/runbooks/local-deployment.md
- docs/runbooks/deploy-windows.md
- docs/runbooks/production-deployment-beginner-guide.md
- docs/runbooks/pilot-account-assignment.md
- docs/runbooks/pilot-data-cleanup-archive.md
- docs/runbooks/pilot-run-checklist.md
- docs/runbooks/backup-restore.md
- docs/runbooks/monitoring-alerting-siem.md
- .codex/skills/docker-local-deploy/SKILL.md
- .codex/skills/auth-rbac/SKILL.md
- .codex/skills/bestar-domain/SKILL.md
- infra/docker/compose.local.yml
- scripts/healthcheck.sh
- scripts/backup-postgres.sh
- scripts/backup-storage.sh
- scripts/check-backups.sh
- scripts/check-disk-usage.sh
- scripts/export-siem-audit.sh

背景：
- P5 本地生产部署准备完成度高，但报告仍标记 Windows 11 Docker full-stack、生产 secrets、业务 smoke test、备份恢复为 target verification。
- 该任务用于在目标 Windows 11 主机上完成真实部署验收。

任务范围：
1. 在目标 Windows 11 主机启动 Docker full-stack。
2. 替换生产 secrets，不使用示例密码/JWT secret。
3. 执行 migration、seed、ADMIN/OFFICE/WAREHOUSE/HR_MANAGER/WAREHOUSE_MANAGER 账号初始化。
4. 完成真实 Excel 上传、解析、修正、报告、label、扫码、重打、库存 smoke。
5. 完成 PostgreSQL/storage backup 和 restore dry-run。
6. 配置 backup/disk alert 和 SIEM audit export 定时执行方案。
7. 更新完成度报告和 runbook/error-fix-log。

禁止：
1. 不要在报告里记录真实密码、JWT secret、私钥。
2. 不要删除原始上传文件、generated files 或 audit records。
3. 不要用 host `pnpm --filter api dev` / `web dev` 作为生产演练路径。

验收标准：
1. `docker compose -f infra/docker/compose.local.yml up -d --build` 在目标机成功。
2. `scripts/healthcheck.sh` 成功。
3. `http://127.0.0.1/` 和 `http://127.0.0.1/api/health` 可访问。
4. 真实账号登录和权限拒绝验证通过。
5. 真实 Excel 上传到扫码闭环通过。
6. Label 150mm x 100mm 真实打印验证通过，QR 可扫。
7. Backup/restore dry-run 通过。
8. Alert/SIEM export smoke 通过。
9. `docs/reports/project-completion-status.html` 更新 target verification 状态。

建议测试命令：
- docker compose -f infra/docker/compose.local.yml up -d --build
- docker compose -f infra/docker/compose.local.yml ps
- scripts/healthcheck.sh
- scripts/backup-postgres.sh
- scripts/backup-storage.sh
- scripts/check-backups.sh
- scripts/check-disk-usage.sh
- scripts/export-siem-audit.sh
- git diff --check

手工验收：
1. 目标机浏览器访问 office web。
2. 创建或确认真实 pilot 账号。
3. 上传真实 Excel。
4. 生成 report 和 label。
5. 用真实打印机打印 label，测量尺寸并扫码。
6. 用真实 PDA/手机扫码装车。
7. 执行 backup restore dry-run。
8. 填写 pilot checklist 和 error-fix-log。

完成输出：
1. 列出目标机环境、Docker 版本、部署路径。
2. 列出 smoke test 结果。
3. 列出 backup/restore 结果。
4. 列出未通过项和责任人。
5. 明确结论：
   - `windows target deployment verified`
   - 或列出 pilot blocker。
