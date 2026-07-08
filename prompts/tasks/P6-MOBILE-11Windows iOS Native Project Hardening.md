执行 P6-MOBILE-11：Windows / iOS Native Project Hardening。

优先级：
- 必做，P6 Exit Gate 阻塞项。

必须读取：
- AGENTS.md
- CONTEXT.md
- docs/adr/0003-native-scan-app.md
- docs/product/01-cross-platform-mobile-scan-app.md
- docs/runbooks/native-scan-app-release.md
- docs/runbooks/native-scan-app-testing.md
- prompts/tasks/P6-MOBILE-08Native Packaging + LAN Deployment Runbook.md
- .codex/skills/mobile-native-scan-app/SKILL.md
- .codex/skills/docker-local-deploy/SKILL.md
- apps/mobile-scan-app/package.json
- apps/mobile-scan-app/scripts/packaging-readiness.mjs
- apps/mobile-scan-app/windows/
- apps/mobile-scan-app/ios/

背景：
- Android platform project 已生成并可构建 debug APK。
- Windows 和 iOS 当前仍是 placeholder，不能证明 MSIX/IPA 路径可执行。

任务范围：
1. 在合适平台构建机上生成或恢复 React Native Windows project。
2. 在合适平台构建机上生成或恢复 React Native iOS project。
3. 提交可审阅的 platform project 文件，但不得提交 signing secret、private key、keystore、provisioning profile。
4. 更新 `package:check`，让它准确区分 Android/iOS/Windows platform readiness。
5. 更新 release runbook 中 Windows MSIX 和 iOS IPA 的实际命令、artifact path、常见失败处理。
6. 不改 office web，不新增 native app 非扫码功能。

验收标准：
1. `apps/mobile-scan-app/windows/` 不再只是 `.gitkeep`，包含 React Native Windows project 基础文件。
2. `apps/mobile-scan-app/ios/` 不再只是 `.gitkeep`，包含 React Native iOS project 基础文件。
3. Windows build/run command 在 Windows 11 build machine 上至少完成 debug 或 release smoke，并记录结果。
4. iOS build/run command 在 macOS + Xcode 环境至少完成 simulator 或 device build smoke，并记录签名前置条件。
5. `pnpm --filter mobile-scan-app package:check` 输出三端 readiness，不误报 placeholder 为 ready。
6. 更新 `docs/reports/project-completion-status.html` 的 P6 Exit Gate 状态。

建议测试命令：
- pnpm --filter mobile-scan-app lint
- pnpm --filter mobile-scan-app typecheck
- pnpm --filter mobile-scan-app test
- pnpm --filter mobile-scan-app package:check
- pnpm --filter mobile-scan-app windows
- pnpm --filter mobile-scan-app ios
- git diff --check

手工验收：
1. Windows 11 build machine 打开/构建 Windows native project。
2. macOS build machine 打开/构建 iOS native project。
3. 确认 artifact 生成路径与 runbook 一致。
4. 确认没有 signing secret 被提交。

完成输出：
1. 列出 Windows/iOS 生成或修复的 platform files。
2. 列出构建机、命令、artifact path 和结果。
3. 列出仍需现场签名/MDM/证书处理的事项。
4. 明确结论：
   - `windows ios native projects hardened`
   - 或列出平台阻塞原因。
