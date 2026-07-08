执行 P1-QUEUE-01：BullMQ Async Import / Generation Jobs。

优先级：
- Deferred。当前同步 parse/report/label/wage generation 可用；当大文件、并发上传或超时成为问题时执行。

必须读取：
- AGENTS.md
- docs/product/00-business-context.md
- docs/runbooks/local-deployment.md
- infra/docker/compose.local.yml
- .codex/skills/nestjs-prisma-api/SKILL.md
- .codex/skills/docker-local-deploy/SKILL.md
- .codex/skills/bestar-domain/SKILL.md
- .codex/skills/unloading-excel-parser/SKILL.md
- .codex/skills/unloading-report-generator/SKILL.md
- apps/api/src/imports/
- apps/api/src/reports/
- apps/api/src/labels/
- apps/api/src/attendance-imports/
- apps/api/prisma/schema.prisma
- apps/worker-python/

背景：
- 项目技术栈包含 Redis + BullMQ，但当前 parse/report/label/wage generation 多为同步执行。
- 同步实现适合当前 pilot；超大 Excel 或多人并发时可能出现 HTTP timeout、重复生成、用户无法查看进度。

任务范围：
1. 引入 BullMQ job model，用 Redis 管理 parse/report/label/wage generation。
2. 增加 job status API：queued/running/succeeded/failed/cancelled。
3. 保持原始上传 Excel 文件保存和 SHA-256 去重规则。
4. Worker job 失败必须持久化 error，不得静默吞掉 parser errors。
5. Generated report/label/wage file 仍必须记录 generated file metadata。
6. Web UI 从同步按钮改为提交 job、轮询 job status、展示错误和下载结果。
7. 不改变 pallet loaded status 规则；scan transaction 仍由后端数据库状态决定。

建议分阶段：
1. Queue foundation：Redis/BullMQ module、job table/migration、healthcheck。
2. Unloading parse/report/label jobs。
3. Attendance parse/wage record jobs。
4. Web job status UI。
5. Docker full-stack concurrency regression。

数据库要求：
1. 如新增 job 表，必须有 Prisma migration。
2. job 必须关联 actor user、业务 target、input file/generated file。
3. 重试次数、lastError、startedAt、finishedAt 必须可审计。

验收标准：
1. 上传仍保存原始文件并做 SHA-256 duplicate detection。
2. Parser warnings/errors 持久化并显示给用户。
3. 同一个业务对象重复点击不会产生不可控重复 job。
4. Job failed 后 UI 能看到明确错误，用户可重试。
5. Report/label/wage generated files 仍可下载，SHA-256/size/mime/status 完整。
6. Docker Compose Redis health 和 API queue health 通过。
7. 并发上传/生成 regression 通过。

建议测试命令：
- pnpm --filter api lint
- pnpm --filter api typecheck
- pnpm --filter api test
- pnpm --filter api test:e2e
- pnpm --filter web lint
- pnpm --filter web typecheck
- pnpm --filter web test
- cd apps/worker-python && uv run pytest
- docker compose -f infra/docker/compose.local.yml up -d --build
- scripts/healthcheck.sh
- git diff --check

手工验收：
1. 上传真实 unloading Excel，提交 parse job。
2. 等待 job success，查看 parsed result。
3. 提交 report/label job，下载文件。
4. 上传真实 attendance `.xls`，提交 parse/generate wage job。
5. 故意提交 unsupported workbook，确认 job failed 且错误可见。
6. 并发提交多个 job，确认状态和结果不串。

完成输出：
1. 列出 queue schema/API/UI/worker 改动。
2. 列出迁移文件。
3. 列出 job status 和错误处理测试结果。
4. 明确结论：
   - `async import generation jobs complete`
   - 或列出未迁移的同步流程。
