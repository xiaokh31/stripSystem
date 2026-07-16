Task-Status: ARCHIVED
Archived-On: 2026-07-15
Archive-Scope: Windows native package / React Native Windows / MSIX delivery
Archive-Reason: Product decision to pause the Windows native installation package.
Archive-Note: Repository-side handoff assets remain as historical/reactivation references; do not execute this Task while archived.
Reactivation: Requires explicit product approval, removal of this marker, and synchronized Task index/completion report updates.

执行 P6-MOBILE-13：Windows MSIX Release Completion。

优先级：
- 已归档，不在当前执行队列；Android/iOS pilot route 继续有效，以下 Windows 内容仅供以后恢复参考。

必须读取：
- AGENTS.md
- docs/product/01-cross-platform-mobile-scan-app.md
- docs/adr/0003-native-scan-app.md
- docs/runbooks/native-scan-app-release.md
- docs/runbooks/native-scan-app-testing.md
- prompts/tasks/P6-MOBILE-09Native Camera Module Wiring.md
- prompts/tasks/P6-MOBILE-10Secure Token Storage.md
- prompts/tasks/P6-MOBILE-11Windows iOS Native Project Hardening.md
- prompts/tasks/P6-MOBILE-12Cross Platform Device Smoke Exit Gate.md
- .codex/skills/mobile-native-scan-app/SKILL.md
- apps/mobile-scan-app/scripts/packaging-readiness.mjs
- apps/mobile-scan-app/windows/

当前复查结果：
- `CI=true pnpm --filter mobile-scan-app package:check` 通过 shared prerequisite check。
- Android: ready。
- iOS: ready。
- Windows: blocked。
- 缺少 Windows generated markers：
  - `windows/**/*.sln`
  - `windows/**/*.vcxproj`
  - `windows/**/Package.appxmanifest`
- 当前 Windows 只有 native module source boundary：
  - `windows/BestarQrScanner/BestarQrScannerModule.cs`
  - `windows/BestarQrScanner/BestarSecureTokenStoreModule.cs`

任务范围：
1. 在 Windows 11 + Visual Studio 2022 + Windows SDK 构建机上生成 React Native Windows project。
2. 把 `BestarQrScannerModule.cs` 和 `BestarSecureTokenStoreModule.cs` 接入 RNW project。
3. 选择并接入 Windows QR camera decoder dependency，或明确公司 Windows 设备仅走扫码枪/manual input 并由业务签字。
4. 使用 Windows Credential Locker 或等价安全存储完成 token storage。
5. 生成 debug/release build，并完成 MSIX 打包。
6. 在真实 Windows 设备完成安装、LAN API URL、login、scan smoke。
7. 更新 `package:check`，让 Windows generated markers ready。
8. 更新 release/testing runbook 和完成度报告。

验收标准：
1. `apps/mobile-scan-app/windows/` 包含 `.sln`、`.vcxproj`、`Package.appxmanifest`。
2. `pnpm --filter mobile-scan-app package:check` 显示 Windows ready。
3. Windows build 命令通过。
4. Signed 或 test-signed MSIX artifact path 记录清楚。
5. Windows 设备安装成功。
6. Windows app 可配置 LAN API URL 并用真实 WAREHOUSE 账号登录。
7. Windows scan workflow 至少完成 scanner-gun/manual input；如果 camera scan 是 PRD 必需，则必须完成 camera QR scan。
8. Token 不落明文日志或普通文件。
9. App 仍只包含 login 和 mobile scan，不包含 office/admin/import/report/label 页面。

建议测试命令：
- CI=true pnpm --filter mobile-scan-app lint
- CI=true pnpm --filter mobile-scan-app typecheck
- CI=true pnpm --filter mobile-scan-app test
- CI=true pnpm --filter mobile-scan-app package:check
- pnpm --filter mobile-scan-app windows
- pnpm --filter mobile-scan-app windows -- --release --arch x64
- git diff --check

手工验收：
1. 在 Windows 设备安装 MSIX。
2. 配置 `http://<server-lan-ip>/api` 或 HTTPS 内网域名。
3. 登录真实 WAREHOUSE 账号。
4. 打开真实 load job。
5. 扫码枪/manual scan 一个真实 pallet QR。
6. 如 camera 支持，camera scan 同一类真实 QR。
7. 重启 app 验证 secure token restore/logout。

完成输出：
1. 列出 Windows build machine 环境。
2. 列出 MSIX artifact path。
3. 列出 Windows device smoke 结果。
4. 明确结论：
   - `windows msix release complete`
   - 或列出 Windows release blocker。
