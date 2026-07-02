执行 P6-MOBILE-07：Native Supervisor Override + Complete Loading。

必须读取：
- AGENTS.md
- CONTEXT.md
- docs/adr/0003-native-scan-app.md
- docs/product/01-cross-platform-mobile-scan-app.md
- .codex/skills/mobile-native-scan-app/SKILL.md
- .codex/skills/warehouse-scan-flow/SKILL.md
- .codex/skills/auth-rbac/SKILL.md

任务范围：
1. 实现 native app supervisor override UI。
2. 实现 native app complete loading。
3. 支持 dockNo 必填校验。
4. 不新增 office 管理功能。
5. 不绕过现有 API 权限。

API：
- POST /api/load-jobs/:id/scan
- POST /api/load-jobs/:id/close
- PATCH /api/load-jobs/:id
- GET /api/auth/me

业务要求：
1. `scan.override` 权限用户才能看到 override 操作。
2. Override 必须填写 reason 并二次确认。
3. Override 调用现有 scan API payload：
   - supervisorOverride: true
   - overrideReason
4. WAREHOUSE 普通用户不能 override。
5. Complete loading 前如果 dockNo 缺失，必须提示填写。
6. 完成装车记录必须归属当前登录用户。
7. Override 和 complete loading UI 必须是 native app screen，不是 office web 或 PWA 页面。

验收标准：
1. 有权限用户可完成 override，后端有 pallet event 审计。
2. 无权限用户无法 override。
3. dockNo 缺失不能 complete。
4. complete 后 job 状态更新为 completed，历史能看到装车人。
5. TypeScript/lint/test 通过。

测试命令：
- pnpm --filter mobile-scan-app lint
- pnpm --filter mobile-scan-app typecheck
- pnpm --filter mobile-scan-app test
- pnpm --filter api test -- load-jobs.service.spec.ts
- pnpm --filter api test:e2e

手工验收：
1. 使用无 `scan.override` 的 WAREHOUSE 账号验证不能 override。
2. 使用 OFFICE/ADMIN 或授权 supervisor 账号验证 override。
3. 不填 dockNo 点击 complete，确认被阻止。
