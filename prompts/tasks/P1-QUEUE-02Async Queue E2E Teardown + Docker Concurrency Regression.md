执行 P1-QUEUE-02：Async Queue E2E Teardown + Docker Concurrency Regression。

优先级：
- 必做。P1-QUEUE-01 已实现异步任务垂直线，但当前 API E2E 不稳定，不能关闭。

必须读取：
- AGENTS.md
- prompts/tasks/P1-QUEUE-01BullMQ Async Import Generation Jobs.md
- docs/runbooks/local-deployment.md
- .codex/skills/nestjs-prisma-api/SKILL.md
- .codex/skills/docker-local-deploy/SKILL.md
- apps/api/src/async-jobs/
- apps/api/src/config/app.config.ts
- apps/api/test/jest-e2e.json
- apps/api/test/*.e2e-spec.ts
- infra/docker/compose.local.yml

当前复查结果：
- `CI=true pnpm --filter api test` 通过：20 suites / 129 tests。
- `CI=true pnpm --filter api exec jest --config ./test/jest-e2e.json --runInBand` 失败：72 tests 中 61 passed / 11 failed。
- 失败不是业务断言失败，主要是 BullMQ/ioredis worker teardown 在测试结束或 app close 后抛：
  - `Connection is closed`
  - `write EPIPE`
  - `Cannot log after tests are done`
- 沙箱内直接跑 E2E 还会遇到 `listen EPERM: operation not permitted 0.0.0.0`，需要在允许监听本地 HTTP server 的环境执行。

任务范围：
1. 修复 E2E 环境中 AsyncJobsProcessor / BullMQ Worker / Queue / IORedis 的初始化和关闭策略。
2. 确认 `NODE_ENV=test` 或 E2E 配置默认不误启真实 queue worker；需要测试 queue 时应由专门 E2E 显式开启。
3. 如果保留 E2E 中真实 Redis queue，必须保证 `app.close()` 后没有 BullMQ/ioredis unhandled error、open handle、post-test log。
4. 补充 async queue E2E 或 integration test，覆盖 submit job、poll job、failure result、queue health。
5. 补 Docker full-stack concurrency regression：并发提交 unloading parse/report/labels 与 attendance parse/wage generation，不串 job、不丢 generated file、不吞 parser error。
6. 不改变 P0 业务规则：原始文件保存、SHA-256 去重、parser warnings/errors、generated file audit、finalPallets、QR 唯一性都必须保留。

验收标准：
1. `CI=true pnpm --filter api test:e2e` 在允许监听本地 HTTP server 的环境通过。
2. `CI=true pnpm --filter api exec jest --config ./test/jest-e2e.json --runInBand` 通过。
3. E2E 输出中没有 `Connection is closed`、`write EPIPE`、`Cannot log after tests are done`、open handle force exit。
4. Queue disabled mode health 返回 disabled，不尝试连接 Redis。
5. Queue enabled mode health 返回 up/down 明确状态，不影响非 queue API tests。
6. Docker full-stack queue smoke 覆盖并发 job 和 failed job review。
7. 更新 `docs/reports/project-completion-status.html` 和本任务索引。

建议测试命令：
- CI=true pnpm --filter api lint
- CI=true pnpm --filter api typecheck
- CI=true pnpm --filter api test
- CI=true pnpm --filter api test:e2e
- CI=true pnpm --filter api exec jest --config ./test/jest-e2e.json --runInBand
- CI=true pnpm --filter web test
- docker compose -f infra/docker/compose.local.yml up -d --build
- scripts/healthcheck.sh
- git diff --check

手工验收：
1. 用 Docker full-stack 上传真实 unloading Excel，提交 parse job。
2. 并发提交 report/label job，确认状态和 generated files 正确。
3. 上传真实 attendance `.xls`，提交 parse/generate wage jobs。
4. 提交 unsupported workbook，确认 job failed 且错误可见。

完成输出：
1. 列出 root cause。
2. 列出修复文件。
3. 列出 E2E 串行/并行结果。
4. 列出 Docker concurrency smoke 结果。
5. 明确结论：
   - `async queue e2e teardown and concurrency regression complete`
   - 或列出剩余 blocker。
