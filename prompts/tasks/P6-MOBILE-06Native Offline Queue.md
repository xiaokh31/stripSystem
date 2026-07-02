执行 P6-MOBILE-06：Native Offline Queue。

必须读取：
- AGENTS.md
- CONTEXT.md
- docs/adr/0003-native-scan-app.md
- docs/product/01-cross-platform-mobile-scan-app.md
- .codex/skills/mobile-native-scan-app/SKILL.md
- .codex/skills/warehouse-scan-flow/SKILL.md

任务范围：
1. 实现 standalone app 离线扫码队列。
2. 网络发送失败时写本地 pending。
3. 支持手动 retry 和网络恢复后的同步。
4. 不改后端 duplicate scan 业务规则。
5. 不在离线状态计算或扣减库存。

API：
- POST /api/load-jobs/:id/scan
- GET /api/load-jobs/:id

业务要求：
1. 队列字段至少包含：
   - localId
   - loadJobId
   - qrPayload
   - scannedAt
   - deviceId
   - syncStatus
   - lastError
2. 队列必须保留扫码时选择的 loadJobId。
3. 同步成功后标记 synced。
4. 同步失败后保留 lastError。
5. 重试同一条记录必须通过真实 API。
6. 不能把 pending 当成 loaded inventory。
7. 本地队列必须使用 native app 可控持久化机制，不依赖浏览器 localStorage 作为最终实现。

验收标准：
1. 断网扫码进入 pending。
2. 恢复网络后可同步。
3. 重复 retry 不重复扣库存。
4. 同柜分批到多个 load job 时不会串 job。
5. TypeScript/lint/test 通过。

测试命令：
- pnpm --filter mobile-scan-app lint
- pnpm --filter mobile-scan-app typecheck
- pnpm --filter mobile-scan-app test
- pnpm --filter api test -- load-jobs.service.spec.ts

手工验收：
1. 断开网络或配置错误 API base URL。
2. 扫描真实 QR，确认 pending。
3. 恢复 API 后 retry，确认 backend 接受并刷新 progress。
