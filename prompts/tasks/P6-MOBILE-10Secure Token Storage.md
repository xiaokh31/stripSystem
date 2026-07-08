执行 P6-MOBILE-10：Secure Token Storage。

优先级：
- 必做，P6 Exit Gate 阻塞项。

必须读取：
- AGENTS.md
- CONTEXT.md
- docs/product/01-cross-platform-mobile-scan-app.md
- docs/runbooks/native-scan-app-testing.md
- prompts/tasks/P6-MOBILE-03Native Login + Auth Session.md
- prompts/tasks/P6-MOBILE-08Native Packaging + LAN Deployment Runbook.md
- .codex/skills/mobile-native-scan-app/SKILL.md
- .codex/skills/auth-rbac/SKILL.md
- .codex/skills/qa-regression/SKILL.md
- apps/mobile-scan-app/src/auth/token-store.ts
- apps/mobile-scan-app/src/auth/auth-session.ts
- apps/mobile-scan-app/src/storage/
- apps/mobile-scan-app/package.json

背景：
- 当前 native app 有 `SecureTokenStore` interface，但实现仍是 `AsyncStorageTokenStore` fallback。
- PRD 要求 token 使用平台安全存储：Android Keystore-backed storage、iOS Keychain、Windows Credential Locker 或等价方案。

任务范围：
1. 选择并接入适合 React Native Android/iOS/Windows 的 secure token storage 方案。
2. 保留 `SecureTokenStore` 接口，避免 auth session 代码直接依赖具体平台实现。
3. Android 使用 Keystore-backed secure storage。
4. iOS 使用 Keychain。
5. Windows 使用 Credential Locker 或明确选择的 React Native Windows secure storage 实现。
6. 在 native module 不可用或测试环境中提供明确的 memory/test fallback；生产构建不能静默退回普通 AsyncStorage 存 JWT。
7. 更新 README/runbook，说明 token 存储、清除和平台限制。

禁止：
1. 不得把 JWT、密码、refresh token 写入普通日志。
2. 不得把 token 存入明文配置文件、localStorage 风格 store 或 committed fixture。
3. 不得破坏 logout 清除 token、expired session、permission denied 现有逻辑。

验收标准：
1. 登录成功后 token 写入平台 secure store。
2. App 重启后能从 secure store 恢复 session 并调用 `GET /api/auth/me`。
3. Logout 会清除 token；重启后不能恢复已退出 session。
4. 错误日志不包含 JWT/password。
5. Unit tests 覆盖 secure store success、store failure、restore expired token、logout clear。
6. Docs 明确各平台 secure storage 和本地开发 fallback。
7. 更新 `docs/reports/project-completion-status.html` 的 P6 Exit Gate 状态。

建议测试命令：
- pnpm --filter mobile-scan-app lint
- pnpm --filter mobile-scan-app typecheck
- pnpm --filter mobile-scan-app test
- pnpm --filter mobile-scan-app package:check
- pnpm --filter api test:e2e
- git diff --check

手工验收：
1. 安装 native app。
2. 配置 LAN API URL。
3. 登录真实 WAREHOUSE 账号。
4. 杀掉并重启 app，确认 session 可安全恢复。
5. 点击 logout，杀掉并重启 app，确认不再登录。
6. 检查设备/控制台日志，确认无 token/password 明文。

完成输出：
1. 列出 secure storage 依赖和平台实现。
2. 列出 fallback 只在何种环境可用。
3. 列出测试命令和结果。
4. 明确结论：
   - `secure token storage complete`
   - 或列出仍阻塞的具体平台。
