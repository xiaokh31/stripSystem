# 执行 NATIVE-AUTH-01：Revocable Persistent Native Session

## 2026-07-15 当前交付范围

- 活动平台范围为 Android 和 iOS；两端尚未完成的 Release 真机 session、退出、撤销、停用和双语视觉证据继续验收。
- Windows RNW/MSIX、Credential Locker 接入和 Windows 设备 session 矩阵已随 Windows 原生安装包路线归档，
  不再是本 Task 当前关闭条件，也不得作为 `external_verification` 或 release blocker。
- 既有 Windows source boundary 和历史记录保留为恢复参考。只有产品明确恢复 Windows 原生安装包，并同步移除
  P6-MOBILE-09 至 13 的 `Task-Status: ARCHIVED` 标记、任务索引和完成度报告后，才恢复 Windows 验收。

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

- Native access token 已持久化到 Android Keystore-backed storage 和 iOS Keychain，关闭 App 后不会自动丢失。
  Windows Credential Locker source boundary 属于已归档路线，不纳入当前完成度。
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

1. Secure token store 升级为原子保存 access token、refresh token、session metadata；活动范围内的 Android/iOS 均不得回退
   到普通 AsyncStorage/UserDefaults 明文保存 secrets。
2. App 启动时：access token 有效则恢复；即将到期或已到期则静默 refresh；refresh 成功后继续进入
   Bay Board，不闪回登录页。
3. API 请求遇到明确 token-expired 401 时只允许单飞 refresh 一次，并安全重试原请求一次；并发请求
   不得并发轮换同一 refresh token。
4. 网络不可达不等同 session invalid：保留本地 session 和离线能力，不得因暂时断网清除 refresh token。
5. refresh invalid/revoked/user inactive 才清除凭据并进入本地化重新登录状态。
6. 主动退出清除 Android/iOS secure store；卸载/系统清除凭据后的行为服从平台安全存储规则并写入 runbook。

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
5. Android/iOS secrets 仅保存在平台 secure store，API 数据库仅存 refresh hash。
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
- 已归档且当前不得执行：`pnpm --filter mobile-scan-app windows:check`

## 2026-07-15 执行结果

状态：Repository and current-environment automation complete; Android/iOS external native-device verification pending.

- 已完成 migration、hash-only refresh history、row-lock rotation/replay revoke、access/session binding、
  refresh rate limit、管理员撤销审计和 current user/permission revalidation。
- 已完成 Native 原子 secure session、启动静默恢复、single-flight refresh、一次请求重试、离线保留、
  invalid/revoked/inactive 清除和双语恢复状态。
- Docker API auth unit 5 suites / 18 tests、auth E2E 3 suites / 25 tests、Native 50 tests、lint、
  typecheck、build/static platform checks 与真实 PostgreSQL/HTTP 并发验证通过；23 migrations up to date。
- 详细证据见 `docs/reports/native-auth-01-revocable-session-verification.md`。
- 仅剩 Android/iOS Release 真机 session matrix；Windows 11 RNW/MSIX/Credential Locker 同矩阵已归档，
  不再属于当前关闭条件。当前仓库环境没有剩余自动化实现项。

## 2026-07-16 iOS 真机自动验收续跑

用户已连接并授权对当前 iOS 真机执行本 Task 中所有无需人工屏幕点击的验收步骤，并要求更新验证报告。

当前已知设备状态：

- CoreDevice 名称：`xfl super B`
- CoreDevice identifier：仅记录后缀 `…6565`
- UDID：仅记录后缀 `…40021401C`
- 型号/系统：iPhone 15 Pro / iOS 26.5
- 连接：wired、paired、Developer Mode enabled
- App：`com.bestar.nativescan` 已安装；Xcode 26.5 可识别 physical device destination

本次监督运行必须先完成所有可全自动执行的项目，再返回终态：

1. 只读确认设备、App、Docker API/数据库和当前 Native session 状态；不得读取或输出 Keychain secret、
   access/refresh token、密码或 secure-store JSON。
2. 自动终止并重新启动 App，记录进程、API/数据库 session 使用或其他非 secret 证据。
3. 自动重启设备，轮询重新连接；设备恢复后自动启动 App，并记录 session restore 的非 secret 证据。
4. 在不把测试变量持久写入 `.env` 的前提下，完成当前环境可安全执行的 access expiry / silent refresh
   验证；优先使用现有 session expiry/数据库 rotation 证据，不得伪造 UI 结果。
5. 若 App 指向本机 Docker API，可通过暂时停止/隔离 API 或 nginx 模拟网络不可达，自动重启 App，
   再恢复服务并验证 session 未被服务端错误撤销、恢复后的 refresh/校验继续；必须恢复全部服务。
6. 自动核对管理员 revoke、账号停用/恢复在 API/数据库侧可执行的部分。不得为了完成矩阵而停用未确认的
   真实业务账号，不得把测试凭据注入代码或日志；任何会让设备端 secure session 永久失效、且需要再次
   输入密码才能继续的步骤必须排在所有非破坏性自动项之后，并仅在能保持验收顺序与清理安全时执行。
7. 不安装未批准的 UI 自动化工具，不绕过 iOS 安全边界，不通过读取 Keychain 来代替用户登录。
8. 更新 `docs/reports/native-auth-01-revocable-session-verification.md`，逐项记录 PASS、PARTIAL 或 MANUAL，
   包括命令级证据、时间、设备型号/系统、服务恢复与临时数据清理；不得记录 secrets 或完整 device id。
9. 最终明确列出仍需人工完成的最小步骤，例如 UI 点击、凭据输入、重启后系统提示和本地化视觉确认。
10. 保留所有既有 WEB-OPS-09 和其他无关工作树修改；完成 `git diff --check`。

## 2026-07-16 iOS 自动验收结果

状态：Repository/current-environment automation and authenticated iOS non-destructive matrix complete;
external destructive/visual device verification pending.

- 已发现初始安装包仍调用旧 `/api/auth/login`，没有把旧包误报为 Native refresh 实现。
- 已从 Docker 冻结依赖生成当前 production bundle，在一次性副本中完成当前 Swift 的 Xcode Release
  iphoneos build、签名、安装和启动；当前包包含 `/auth/native/login` 与 `BestarSecureTokenStore`。
- 当前包完成 App 重启和设备 full reboot 后重新安装态/启动验证；nginx 离线期间 App 进程保持，服务已恢复。
- 当前源码包真实登录后，App重启、nginx离线/恢复和设备full reboot均保持session；自然进入提前60秒
  refresh窗口后设备refresh 201、history `1→2`，新access `/auth/me` 304。全程未读取Keychain/token/hash。
- iOS仅剩需要人工点击/视觉观察且会清除当前session的online/offline logout、管理员revoke、账号inactive
  和双语状态矩阵；Android Release 同矩阵仍待外部验收。Windows 11 RNW/MSIX/Credential Locker 矩阵已归档。
- 真实 PostgreSQL/HTTP disposable fixture 的 hash-only、rotation/replay、201/401并发、管理员撤销审计、
  账号停用/恢复和logout通过；清理后 users/sessions/refresh tokens均为0。
- Docker API auth 18 unit / 25 E2E、Native 50 tests、lint/typecheck/build、Android/iOS static checks、
  23 migrations 和 full-stack health通过。详细 PASS/PARTIAL/MANUAL 证据见
  `docs/reports/native-auth-01-revocable-session-verification.md`。
