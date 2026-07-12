# 执行 NATIVE-UX-01：App Shell Navigation and Native I18n Foundation

## 前置任务

- `NATIVE-UX-00Native Warehouse Console Visual Direction.md`

## 必须读取与使用的 skills

- `AGENTS.md`、`CONTEXT.md`
- `docs/adr/0003-native-scan-app.md`
- `docs/product/01-cross-platform-mobile-scan-app.md`
- `.codex/skills/frontend-design/SKILL.md`
- `.codex/skills/mobile-native-scan-app/SKILL.md`
- `.codex/skills/auth-rbac/SKILL.md`
- `apps/mobile-scan-app/src/app/App.tsx`
- `apps/mobile-scan-app/src/ui/styles.ts`
- `apps/mobile-scan-app/src/auth/`
- `apps/mobile-scan-app/src/config/`

## 任务范围

1. 将单体 `App.tsx` 按 screen、feature component、hook/controller 与 token 拆分，保持业务行为不变。
2. 建立 Login、Load Jobs、Scan Workspace、Settings/Diagnostics 四个明确界面状态或导航层级。
3. 已保存有效会话时进入装车任务首屏；未登录时只显示紧凑登录界面。
4. 将服务器地址、设备 ID、连接测试、版本移入 Settings/Diagnostics。
5. 设置页通过熟悉的设置图标进入，图标必须有本地化 accessibilityLabel；不新增沉重图标依赖。
6. 建立轻量 native i18n catalog、locale 切换和持久化，覆盖现存所有可见硬编码英文。

## 明确非目标

- 本任务不重做装车任务行和扫描工作台细节。
- 不改 API contract、JWT、权限或扫描业务规则。
- 不删除诊断能力，只改变其信息层级。

## 业务与 UX 要求

- 日常界面不得显示 API URL、device ID、role/permission code、endpoint、token 或模块说明。
- 登录失败、服务器不可达和无扫码权限仍需用业务语言明确处理办法。
- 启动检查不得用全屏长文阻塞；使用稳定尺寸的启动/恢复状态，避免页面跳动。
- Windows、Android、iOS 均须支持键盘焦点、屏幕阅读器标签和至少 44x44 触控目标。

## i18n 硬门禁

- 所有可见 copy、状态、错误、placeholder、accessibilityLabel、hint 和原生权限文案进入
  `en` / `zh-CN` catalog。
- API 错误通过 stable code 映射，不直接显示后端英文 message；未知错误显示本地化通用提示，
  详细 code 仅在诊断页可复制查看。
- 切换语言和重启后只显示所选语言，不得双语混排或暴露 translation key。
- 增加 catalog key parity、unmanaged visible string 和 locale persistence 测试。

## 验收标准

1. 登录、任务、扫码、设置职责从 `App.tsx` 解耦，测试可独立定位。
2. 登录后常用首屏不再被配置、设备与权限详情挤占。
3. 原有登录、登出、session restore、权限拦截行为不回归。
4. English 与中文切换覆盖 touched states，重启保持语言。
5. 三端代码编译；无新增网络字体或不必要的大型 UI 依赖。

## 测试命令

- `pnpm --filter mobile-scan-app lint`
- `pnpm --filter mobile-scan-app typecheck`
- `pnpm --filter mobile-scan-app test`
- `pnpm --filter mobile-scan-app android:check`
- `pnpm --filter mobile-scan-app ios:check`
- `pnpm --filter mobile-scan-app windows:check`

