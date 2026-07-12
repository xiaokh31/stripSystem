# 执行 CROSS-UX-QA-01：Persistent Session Theme Locale Regression

## 前置任务

- `NATIVE-AUTH-01Revocable Persistent Native Session.md`
- `NATIVE-UX-05System Adaptive Color Theme.md`
- `NATIVE-UX-06Android App Header Title Clipping Regression.md`
- `WEB-THEME-01Office Web Light Dark System Theme.md`
- `WEB-I18N-03Eliminate English Flash on Chinese Refresh.md`

## 必须读取与使用的 skills

- `AGENTS.md`、`CONTEXT.md`
- `.codex/skills/qa-regression/SKILL.md`
- `.codex/skills/auth-rbac/SKILL.md`
- `.codex/skills/mobile-native-scan-app/SKILL.md`
- `.codex/skills/nextjs-pwa-ui/SKILL.md`
- 上述五个任务及其 changed files/tests/runbooks

## 回归范围

1. Native persistent session：App/设备重启、access expiry 静默 refresh、offline restore、logout、revoke、
   inactive user、permission change、refresh replay 和并发 refresh。
2. Native header：Android/iOS 对照，320/360/390px、font scale 1.0/1.3/2.0、light/dark、en/zh-CN。
3. Native theme：Login/Bay Board/Scan/Offline/Settings 与 native chrome，不丢 session/loadJob/input/queue。
4. Web theme：light/dark/system、刷新/重开、系统实时切换、登录前后、所有主要模块和打印可读性。
5. Web locale：中文/英文首个 HTML、hydration、刷新、路由切换，无英文/中文闪现和 hydration warning。
6. 组合矩阵：Web 与 Native 的 `en-light`、`en-dark`、`zh-CN-light`、`zh-CN-dark`。

## 不可回归业务规则

- 禁用账号和权限变更下一次验证生效。
- scan status only changes through scan transaction。
- duplicate scan 不重复扣库存；offline pending 不伪装为 loaded。
- supervisor override、complete loading、dock requirement 和 audit 不变。
- 主题/locale 切换不触发重复业务 API、session restore 或 offline sync。

## i18n 硬门禁

- 所有 touched states 只显示当前 locale；无 raw code、英文 fallback 或双语状态。
- API 只提供 stable code/enum/raw data；UI catalog 完成映射。
- Native session/主题错误和 Web theme/locale controls 均覆盖 en/zh-CN 与 accessibility 文案。

## 执行与证据

- 跑 API、Web、Native lint/typecheck/unit/e2e/build focused suites。
- Docker full-stack 经 nginx 验证 Web login/theme/locale 与 API refresh/revoke。
- Android/iOS release 实机采集关键截图和 session/theme/header 证据。
- Windows 11/MSIX 项与 `P6-MOBILE-13` 合并执行；缺少设备时保留 blocker，不得标记三端完整通过。
- 更新任务索引、项目完成度报告和相关 runbook，逐项标注 passed/blocked/not run。

## 测试命令

- `pnpm --filter api lint`
- `pnpm --filter api typecheck`
- `pnpm --filter api test`
- `pnpm --filter api test:e2e`
- `pnpm --filter web lint`
- `pnpm --filter web typecheck`
- `pnpm --filter web test`
- `pnpm --filter web build`
- `pnpm --filter mobile-scan-app lint`
- `pnpm --filter mobile-scan-app typecheck`
- `pnpm --filter mobile-scan-app test`
- `pnpm --filter mobile-scan-app android:check`
- `pnpm --filter mobile-scan-app ios:check`
- `pnpm --filter mobile-scan-app windows:check`
- Docker full-stack focused auth/theme/locale smoke
- `git diff --check`

## 验收标准

1. 五个前置任务各自 acceptance criteria 有自动化或手工证据。
2. Native 长会话安全可撤销，Android 标题完整。
3. Web 主题持久化且中文刷新从首帧开始就是中文。
4. 组合矩阵无混语、闪烁、不可读状态或 hydration warning。
5. 未验证平台明确保留为 release blocker。
