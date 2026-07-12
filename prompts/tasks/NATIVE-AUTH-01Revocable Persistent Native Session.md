# 执行 NATIVE-AUTH-01：Revocable Persistent Native Session

## 必须读取与使用的 skills

- `AGENTS.md`、`CONTEXT.md`
- `docs/architecture/04-api-contracts.md`
- `docs/architecture/09-account-role-permission-management.md`
- `docs/product/01-cross-platform-mobile-scan-app.md`
- `.codex/skills/auth-rbac/SKILL.md`
- `.codex/skills/mobile-native-scan-app/SKILL.md`
- `.codex/skills/nestjs-prisma-api/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- `AUTH-SESSION-01Persistent Browser Login Session.md`
- API auth schema/service/guard/tests
- Native auth client/session/token store and Android/iOS/Windows secure-store modules

## 现状

- Native access token 已持久化到 Android Keystore-backed storage、iOS Keychain 和 Windows
  Credential Locker，关闭 App 后不会自动丢失。
- 但 Native 与 Web 当前共享 API JWT 有效期，默认约 400 天。JWT 到期后 Native restore 会清除
  token 并要求重新登录。
- 因此目前是“长周期持久化”，不是“不主动退出就持续登录”。

## 产品目标

在用户不主动退出、设备安全凭据未被清除、账号仍 active 且会话未被管理员撤销时，Native app
应长期保持登录并自动续期。正常使用不应因短期 access token 到期要求重新输入账号密码。

不采用真正永不过期 JWT。永不过期 bearer token 一旦设备丢失就无法安全撤销，也无法可靠落实
账号禁用。目标应通过“短期 access token + 长期、可轮换、可撤销的 Native refresh session”实现。

## API 与数据任务

1. 新增独立 Native session / refresh token 模型与 migration，至少保存：
   - session id、user id、device id、refresh token hash（禁止明文）、created/last-used/rotated/revoked/expires 时间。
   - device/platform/app version 或必要审计 metadata；不得保存密码、access token 或完整 refresh token。
2. Native login 明确提交 device identity，并返回短期 access token、一次性 refresh token、各自 expiry。
3. 新增 refresh endpoint，实施 refresh token rotation；旧 token 重放必须撤销该 session 或 token family，
   返回 stable error code。
4. 新增 Native logout/revoke endpoint；主动退出先尽力服务端撤销，再清除本地凭据。离线退出也必须
   立即清除本地凭据，服务端撤销在可行时补偿处理。
5. 每次 refresh 必须重新读取用户 active、角色和权限。账号禁用、删除或 session revoke 后不能续期。
6. 管理员至少具备按用户撤销全部 Native sessions 的后端能力；UI 若不在本期实现，需记录可操作的
   管理命令/API 与审计方式。
7. 建议长期 session idle expiry 至少 400 天并采用 rolling renewal；absolute expiry 可配置为数年。
   若业务坚持接近永不过期，可允许超长配置，但必须保留 server-side revoke、rotation 与账号校验。

## Native 任务

1. Secure token store 升级为原子保存 access token、refresh token、session metadata；三端均不得回退
   到普通 AsyncStorage/UserDefaults 明文保存 secrets。
2. App 启动时：access token 有效则恢复；即将到期或已到期则静默 refresh；refresh 成功后继续进入
   Bay Board，不闪回登录页。
3. API 请求遇到明确 token-expired 401 时只允许单飞 refresh 一次，并安全重试原请求一次；并发请求
   不得并发轮换同一 refresh token。
4. 网络不可达不等同 session invalid：保留本地 session 和离线能力，不得因暂时断网清除 refresh token。
5. refresh invalid/revoked/user inactive 才清除凭据并进入本地化重新登录状态。
6. 主动退出清除三端 secure store；卸载/系统清除凭据后的行为服从平台安全存储规则并写入 runbook。

## 安全与业务约束

- access/refresh token、密码不得进入日志、性能 trace、AsyncStorage、错误 UI 或审计明文。
- API guard 继续从数据库读取当前用户/权限，长会话不能冻结旧权限。
- refresh endpoint 必须限流并防止 token replay；数据库只存 refresh token hash。
- 不改变 scan transaction、offline queue、duplicate scan、inventory 或 audit business rules。
- 不把 Web cookie 会话隐式改成 Native refresh session；两类客户端策略需明确区分。

## i18n 硬门禁

- “正在恢复登录”“会话已撤销”“账号已停用”“需要重新登录”“离线，稍后继续验证”等 Native 文案
  全部进入 `en` / `zh-CN` catalog。
- API 只返回 stable codes，例如 `AUTH_REFRESH_EXPIRED`、`AUTH_SESSION_REVOKED`、
  `AUTH_REFRESH_REPLAYED`、`USER_INACTIVE`，不返回用户可见中英文句子。
- session restore 与 refresh 过程中只显示当前 locale，不得闪现英文或 raw code。

## 验收标准

1. App 关闭、设备重启、access token 到期后可以静默恢复，不要求重新输入密码。
2. 主动退出后旧 access/refresh token 均不能继续使用。
3. 禁用账号、撤销 session 或检测 refresh replay 后，设备下一次请求/refresh 被拒绝。
4. 暂时离线不会误删有效 session，离线扫描规则不回归。
5. 三端 secrets 仅保存在平台 secure store，API 数据库仅存 refresh hash。
6. migration、API unit/e2e、Native session/concurrency tests 和 runbook 齐全。

## 测试命令

- `pnpm --filter api prisma generate`
- `pnpm --filter api lint`
- `pnpm --filter api typecheck`
- `pnpm --filter api test -- auth`
- `pnpm --filter api test:e2e -- auth`
- `pnpm --filter mobile-scan-app lint`
- `pnpm --filter mobile-scan-app typecheck`
- `pnpm --filter mobile-scan-app test`
- `pnpm --filter mobile-scan-app android:check`
- `pnpm --filter mobile-scan-app ios:check`
- `pnpm --filter mobile-scan-app windows:check`

