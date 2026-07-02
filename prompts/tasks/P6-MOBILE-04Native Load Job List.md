执行 P6-MOBILE-04：Native Load Job List。

必须读取：
- AGENTS.md
- CONTEXT.md
- docs/adr/0003-native-scan-app.md
- docs/product/01-cross-platform-mobile-scan-app.md
- .codex/skills/mobile-native-scan-app/SKILL.md
- .codex/skills/warehouse-scan-flow/SKILL.md
- .codex/skills/auth-rbac/SKILL.md

任务范围：
1. 实现 standalone app load job list。
2. 支持查看 planned/in-progress jobs。
3. 支持进入指定 load job scan screen 的占位页面。
4. 不实现扫码提交。
5. 不实现 office planning/editing。

API：
- GET /api/load-jobs
- GET /api/load-jobs/:id

业务要求：
1. 列表来自真实 API。
2. 每条显示：
   - loadNo
   - destinationRegion
   - truckNo
   - dockNo
   - carrier
   - scheduledDepartureAt
   - status
   - planned/loaded/remaining progress
3. 适合手机/PDA 单手操作，字体和按钮足够大。
4. 无 open job 时提示办公室先发布装车计划。
5. 不根据前端本地状态计算库存。
6. 页面必须是 native app screen，不是复用 `/mobile/load-jobs` 浏览器页面。

验收标准：
1. WAREHOUSE 用户能看到可扫码的真实 load jobs。
2. 无权限用户被拒绝或无法进入列表。
3. Loading/empty/error 状态完整。
4. TypeScript/lint/test 通过。

测试命令：
- pnpm --filter mobile-scan-app lint
- pnpm --filter mobile-scan-app typecheck
- pnpm --filter mobile-scan-app test
- pnpm --filter api test:e2e

手工验收：
1. Office web 发布一个 load job。
2. Native app 登录 WAREHOUSE 账号。
3. 确认 load job 出现在列表且信息准确。
