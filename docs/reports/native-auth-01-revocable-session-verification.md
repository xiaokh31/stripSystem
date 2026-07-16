# NATIVE-AUTH-01 可撤销持久 Native 会话验证

验证窗口：2026-07-15 18:43–19:38 MDT（2026-07-16 00:43–01:38 UTC）

## 结论

仓库实现、Docker 自动化、真实 PostgreSQL/HTTP 会话生命周期验证，以及当前 iPhone 的 Release 构建、
安装、已认证 App 重启、设备重启、临时离线保留和 access 自然到期静默 refresh 均已完成。当前源码包
已安装到 iPhone 15 Pro / iOS 26.5；设备重启后从 Keychain 恢复 session，直接读取当前用户和 Bay Board，
没有再次输入密码。

登录约 14 分 24 秒后，App 在 access 到期前 60 秒窗口自动调用 Native refresh 201；数据库
`last_used_at`/`rotated_at` 更新，refresh history 从 1 增至 2，随后新 access 的 `/api/auth/me` 返回 304。
全程未读取或输出 Keychain、密码、access/refresh token、refresh hash 或 secure-store JSON。iOS 仅剩
在线/离线 logout、管理员撤销、账号停用和 en/zh-CN 视觉提示需要人工点击/观察；这些会清除当前真实
session 的破坏性步骤没有自动执行。Android Release 同矩阵及 Windows 11 RNW/MSIX/Credential Locker
矩阵仍是外部验收项。

## 仓库实现证据

- Prisma 新增 refresh-token history，并为 Native session 增加 absolute expiry、撤销 actor/reason、
  唯一 refresh hash 与级联关系。迁移会回填旧 current/previous hash，不保存明文 token。
- Native login 接收 device id/platform/app version；默认 access 15 分钟、rolling idle 400 天、
  absolute 5 年，均可配置。
- Refresh 使用数据库事务和 session row lock。并发同 token 只有一次成功；旧 token 重放撤销整个
  session family，并返回稳定错误码。
- Native access JWT 绑定 server session。登出、管理员撤销、账号停用或重放后，旧 access token
  无需等待 JWT 到期即被 guard 拒绝。
- Refresh 重新加载 active user、角色和权限；管理员按用户撤销记录 actor 和原因。
- Native secure store 原子保存 access/refresh/session metadata/cached user；Android 使用
  Keystore AES-GCM，iOS 使用 Keychain update，Windows 使用 Credential Locker replacement；
  production 无 AsyncStorage secret fallback。
- 启动恢复、请求层和离线队列共用 single-flight refresh。仅明确 `AUTH_TOKEN_EXPIRED` 触发一次
  refresh 和一次重试；临时网络错误保留凭据，invalid/revoked/inactive 才清除。
- 恢复阶段等待 locale 后再显示本地化文案，不显示 raw API message/code，不闪现默认英文。

## 2026-07-16 iOS 自动验收环境

- 设备：iPhone 15 Pro / iOS 26.5，wired、paired、Developer Mode enabled。
- 标识脱敏：CoreDevice identifier 仅记录后缀 `…6565`，UDID 仅记录后缀 `…40021401C`。
- Xcode：26.5，可识别 physical device destination。
- App：`com.bestar.nativescan`，Version 1.0 / Build 1。
- 服务：Docker nginx、Web、API、worker、PostgreSQL、Redis 最终全部 healthy；API health 为 `ok`。
- 数据库：23 migrations up to date；最终保留设备当前 1 个 active Native session，不读取 user/device/token字段。

## iOS 自动验收矩阵

| 项目 | 状态 | 非 secret 证据 |
| --- | --- | --- |
| 设备、App、服务只读基线 | PASS | CoreDevice paired；初始 App 1.0 可见；六项 Compose 服务 healthy；API health `ok`。 |
| 旧包 contract 检测 | PASS | 初始已安装包请求 `POST /api/auth/login` 并返回 401；当前源码应请求 `/api/auth/native/login`，因此未把旧包当作新实现验收。 |
| 当前源码 Release 构建 | PASS | Docker Metro production bundle 包含 `/auth/native/login`；一次性最小依赖副本中 Xcode Release iphoneos build 成功；二进制包含 `BestarSecureTokenStore`。 |
| 签名、安装和首次启动 | PASS | 保留 Xcode entitlements 后重新签名，`codesign --verify --deep --strict` 通过；CoreDevice 安装成功，首次启动 PID 860。 |
| App 终止并重新启动 | PASS | 真实登录后自动重启，设备直接请求 `GET /api/auth/me` 200；没有再次请求 login。 |
| 设备完整重启 | PASS | 已认证 full reboot 后第9次10秒轮询恢复paired；App仍安装，启动PID 479；`/api/auth/me`及两组load-jobs均304。 |
| 已认证 session restore | PASS | login 201 后 session active；App重启与设备重启均直接校验当前用户/读取Bay Board，没有再次输入密码。 |
| access 到期静默 refresh | PASS | 登录约14分24秒后设备 `POST /api/auth/native/refresh` 201；`rotated_at=last_used_at=01:34:01 UTC`、history `1→2`；再次启动 `/api/auth/me` 304。 |
| 并发 refresh/replay | PASS | Native 50 tests 中 single-flight 通过；真实 PostgreSQL/HTTP 两个并发 refresh 为 201/401，401 code 为 `AUTH_REFRESH_REPLAYED`。 |
| 暂时离线 | PASS | 已认证 session下停止nginx，App仍运行（PID 622），session前/离线/恢复均为1/1；恢复服务后App `/api/auth/me` 304。离线文案视觉另列MANUAL。 |
| 主动 logout | PARTIAL | 真实 HTTP 验证 logout 后旧 access/refresh 均为 401 `AUTH_SESSION_REVOKED`；设备 UI logout 需要人工点击。 |
| 管理员撤销 | PARTIAL | disposable账号的管理员API撤销、actor/reason审计和后续refresh拒绝通过；为保留真实设备session，设备端破坏性观察留待人工。 |
| 账号停用/恢复 | PARTIAL | 仅停用disposable用户；refresh返回403 `USER_INACTIVE`，恢复active后可重新登录；未修改真实业务账号。设备提示仍需人工观察。 |
| secure store | PASS | iOS Keychain、atomic update、`ThisDeviceOnly`三项静态门禁通过；不读取Keychain的情况下，已认证session跨App重启、离线和设备full reboot后仍可用。 |
| en/zh-CN 恢复视觉 | MANUAL | catalog parity/stable-code mapping自动测试通过；无屏幕自动化，仍需人工确认恢复/离线/撤销/停用不闪英文、raw code或登录页。 |

## 构建恢复与安全记录

1. 原工作树 Xcode build 稳定返回 exit 65，缺少 React Core、cxxreact 和 AsyncStorage 的
   `PrivacyInfo.xcprivacy`；仓库中预存的 mobile `node_modules` 软链接已断裂，未修复或重建宿主依赖。
2. 第一次临时副本误包含既有 18 GiB Android Gradle cache，触发宿主空间不足；只删除本次创建的
   `/private/tmp` 副本。Docker Desktop 因空间不足进入 stopping 状态后被完整重启，Compose 六项服务、
   PostgreSQL volume、API health 和 migration 均恢复且数据计数不变。
3. 最终方案仅从冻结 Docker checks image 导出 333 MiB pnpm 依赖，由 Docker 生成当前 iOS bundle，
   在一次性副本中以 `SKIP_BUNDLING=1` 编译当前 Swift，再放入 bundle并重新签名。未修改仓库
   `node_modules`，未写入 `.env`，未记录密码、token、refresh hash 或 secure-store JSON。
4. 一次性构建副本、DerivedData和临时Docker container均已精确清理；nginx离线演练后已恢复，最终
   六项Compose服务全部healthy。

## 自动化与真实数据库结果

- API Prisma generate、lint、typecheck：PASS。
- API auth unit：5 suites / 18 tests PASS。
- API auth E2E：3 suites / 25 tests PASS。
- Native lint、typecheck、build：PASS；50/50 tests PASS。
- Android secure-store static checks：3/3 PASS。
- iOS secure-store static checks：3/3 PASS。
- Windows check：Credential Locker source、secret guardrail、module/checklist 项 PASS；Windows 11、
  `.sln`、`.vcxproj`、`Package.appxmanifest` 仍按设计返回外部 blocker。
- 真实 PostgreSQL/HTTP disposable fixture：5 sessions / 7 refresh history rows；hash-only、rotation、
  旧 token replay、201/401 并发、family revoke、管理员撤销审计、账号停用/恢复和 logout 全部 PASS。
- 精确清理：disposable users = 0、sessions = 0、refresh tokens = 0。

## 最小人工步骤

1. 在 English / 中文各观察一次已认证 App 重启、设备重启、离线和联网恢复；确认直接进入 Bay Board，
   不闪登录页、默认英文或 raw code。
2. 依次验证在线 logout、离线 logout；确认本地立即退出，并在两次之间用获准的测试账号重新登录。
3. 管理员撤销和账号停用放在最后，且只针对 disposable 测试账号，确认下次请求显示本地化重新登录状态。
4. 检查 device console/crash/performance trace 不含密码、access/refresh token 或 secure-store JSON。

## 仍需外部验收

- iOS：上述最小人工视觉与破坏性logout/revoke/inactive矩阵。
- Android Release：关闭/重启 App、设备重启、access 到期、离线、在线/离线 logout、管理员撤销、
  账号停用及双语视觉矩阵。
- Windows 11：生成并接入 RNW project，构建/安装 MSIX，验证 Credential Locker 与相同 session 矩阵。

## QA 回归结论

- 阻断/重大仓库问题：无。
- 业务规则：scan transaction、duplicate scan、offline queue、inventory 和 pallet event 逻辑未改变。
- 已知限制：refresh rate limiter 是单 API 进程内存状态；当前 Docker/生产拓扑为单实例，扩为多副本前
  必须迁移到 Redis 等共享 limiter。
