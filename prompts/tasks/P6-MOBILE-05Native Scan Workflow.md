执行 P6-MOBILE-05：Native Scan Workflow。

必须读取：
- AGENTS.md
- CONTEXT.md
- docs/adr/0003-native-scan-app.md
- docs/product/01-cross-platform-mobile-scan-app.md
- .codex/skills/mobile-native-scan-app/SKILL.md
- .codex/skills/warehouse-scan-flow/SKILL.md
- .codex/skills/auth-rbac/SKILL.md

任务范围：
1. 实现 native scan screen。
2. 支持 native camera QR scanning。
3. 支持扫码枪键盘输入和手动输入 Enter 提交。
4. 调用真实 scan API。
5. 不实现离线队列。
6. 不实现 supervisor override。
7. 不使用浏览器 `getUserMedia` 作为扫码实现。

API：
- POST /api/load-jobs/:id/scan
- GET /api/load-jobs/:id

业务要求：
1. 扫码必须绑定当前选择的 loadJobId。
2. 成功后显示：
   - containerNo
   - destinationCode
   - palletNo
   - backend progress remainingPallets
3. 错误状态必须清楚：
   - duplicate
   - invalid QR
   - pallet not in load plan
   - plan line full
   - already loaded
   - load job closed
   - unauthorized
4. 不允许前端假装扣库存。
5. Camera 权限失败时必须保留手动/扫码枪输入。
6. Camera 扫码必须走 native camera/scanner module，不能依赖 HTTPS browser secure context。

验收标准：
1. Native camera QR 能扫码提交。
2. 扫码枪输入 + Enter 能提交。
3. 重复扫码不重复扣库存。
4. 错误文案现场人员能理解。
5. TypeScript/lint/test 通过。

测试命令：
- pnpm --filter mobile-scan-app lint
- pnpm --filter mobile-scan-app typecheck
- pnpm --filter mobile-scan-app test
- pnpm --filter api test -- load-jobs.service.spec.ts
- pnpm --filter api test:e2e

手工验收：
1. 用真实面单 QR 扫描。
2. 同一托盘重复扫描，确认 duplicate。
3. 扫描不属于当前 load job 的托盘，确认错误。
