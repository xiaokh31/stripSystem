Task-Status: ARCHIVED
Archived-On: 2026-07-15
Archive-Scope: Windows native package / React Native Windows / MSIX delivery
Archive-Reason: Product decision to pause the Windows native installation package.
Archive-Note: Completed Android/iOS implementation and evidence remain valid; do not rerun this historical Task.
Reactivation: Requires explicit product approval, removal of this marker, and synchronized Task index/completion report updates.

执行 P6-MOBILE-09：Native Camera Module Wiring。

优先级：
- 已归档，不在当前执行队列；以下内容仅供以后恢复参考。

必须读取：
- AGENTS.md
- CONTEXT.md
- docs/adr/0003-native-scan-app.md
- docs/product/01-cross-platform-mobile-scan-app.md
- docs/runbooks/native-scan-app-testing.md
- docs/runbooks/native-scan-app-release.md
- prompts/tasks/P6-MOBILE-05Native Scan Workflow.md
- prompts/tasks/P6-MOBILE-08Native Packaging + LAN Deployment Runbook.md
- .codex/skills/mobile-native-scan-app/SKILL.md
- .codex/skills/warehouse-scan-flow/SKILL.md
- .codex/skills/qa-regression/SKILL.md
- apps/mobile-scan-app/src/scan/native-camera-scanner.ts
- apps/mobile-scan-app/src/app/App.tsx
- apps/mobile-scan-app/android/
- apps/mobile-scan-app/ios/
- apps/mobile-scan-app/windows/

背景：
- 当前 TypeScript 侧已有 `NativeModules.BestarQrScanner.scanOnce()` adapter。
- P6 Exit Gate 仍阻塞，因为 Android/iOS/Windows 平台 native module 尚未完整接入并通过设备验收。
- 目标是让 camera scan 使用原生相机模块，不依赖浏览器 `getUserMedia` 或 HTTPS secure context。

任务范围：
1. 为 Android 接入 `BestarQrScanner` native module，能打开相机扫描 QR 并返回 payload。
2. 为 iOS 设计并尽可能接入 `BestarQrScanner` native module；如果当前环境无法构建 iOS，必须提交可审阅的 native module 文件和明确构建前置条件。
3. 为 Windows 设计并尽可能接入 React Native Windows native module；如果当前环境无法构建 Windows，必须提交可审阅的 native module 文件和明确构建前置条件。
4. 在 native app UI 中保留 scanner-gun/manual input fallback；camera 不可用时显示清晰错误。
5. 不改变 scan API 业务规则，不在前端扣库存，不引入 WebView/PWA camera。

业务要求：
1. camera scan 返回的 payload 必须继续走现有 `POST /api/load-jobs/:id/scan`。
2. camera permission 被拒绝、相机不可用、native module 缺失时，不能导致手动/扫码枪输入不可用。
3. App logs 不能打印完整 JWT、密码或敏感 secret。
4. Invalid QR、duplicate scan、not-in-plan 等状态必须由后端 scan response 决定。

验收标准：
1. Android build 包含 `BestarQrScanner` native module，`scanOnce()` 可从 React Native 调用。
2. iOS/Windows 至少完成平台实现或明确标记需要对应平台构建机验证的阻塞点。
3. native app tests 覆盖 camera success、empty payload、module unavailable、permission/error fallback。
4. 手动输入和 scanner-gun Enter 提交路径不被 camera 改动破坏。
5. 更新 `docs/runbooks/native-scan-app-testing.md` 的 P6-MOBILE-09 测试步骤。
6. 更新 `docs/reports/project-completion-status.html` 的 P6 Exit Gate 状态和剩余阻塞项。

建议测试命令：
- pnpm --filter mobile-scan-app lint
- pnpm --filter mobile-scan-app typecheck
- pnpm --filter mobile-scan-app test
- pnpm --filter mobile-scan-app package:check
- cd apps/mobile-scan-app/android && ./gradlew assembleDebug
- git diff --check

手工验收：
1. 安装 Android debug APK 到真实 Android 手机或 PDA。
2. 配置 `http://<server-lan-ip>/api`。
3. 使用真实 WAREHOUSE 账号登录。
4. 打开真实 `IN_PROGRESS` load job。
5. 使用 camera 扫真实 pallet label QR，确认后端接受 scan 并返回进度。
6. 拒绝相机权限后确认手动/扫码枪输入仍可用。

完成输出：
1. 列出新增/修改的平台 native module 文件。
2. 列出已验证平台和未验证平台。
3. 列出测试命令和结果。
4. 明确结论：
   - `native camera module wiring complete`
   - 或列出仍阻塞 P6 Exit Gate 的平台和原因。
