# 执行 WEB-I18N-03：Eliminate English Flash on Chinese Refresh

## 前置关系

- 可与 `WEB-THEME-01Office Web Light Dark System Theme.md` 同一批实现，但本任务必须独立验收。

## 必须读取与使用的 skills

- `AGENTS.md`、`CONTEXT.md`
- `.codex/skills/nextjs-pwa-ui/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- Web layout、middleware、locale cookie/browser helpers、`I18nProvider`、catalog/translator
- 所有 server pages 的 `getServerLocale` 用法和 client components 的 `useI18n` 用法
- 现有 i18n unit 与 Playwright locale tests

## 已确认根因方向

当前默认 locale 为 English，`I18nProvider` 首次 render 后通过 `setTimeout` 读取 browser locale，随后
`translateDocument` / `MutationObserver` 把已显示的英文 DOM 改成中文。中文用户刷新时因此先看到英文，
再看到中文；英文状态因为默认值相同而不明显。

## 任务范围

1. 让 locale cookie 成为 SSR 与客户端 hydration 的共同首屏来源：选择中文后立即持久化 cookie，刷新请求
   的 root layout 和 server pages 在生成首个 HTML 时读取同一个 `zh-CN`。
2. `html lang` 必须在 server render 时正确输出，不等客户端 effect 修改。
3. 移除首屏 `setTimeout` locale 覆盖；禁止已可组件化的界面依赖全局 DOM 扫描和 MutationObserver 才完成
   首次翻译。
4. 逐步将仍依赖英文 source text + `translateDocument` 的 shared shell/关键首屏组件改为显式 catalog key、
   server locale prop 或 `useI18n`，确保 server/client 输出确定一致。
5. 若为了兼容遗留模块暂时保留 DOM translator，必须在 hydration 后只处理明确的遗留边界，不能改变已经
   SSR 的首屏语言，也不能形成翻译来回循环；记录剩余清单。
6. locale cookie 必须具备合理 Max-Age、path、SameSite；切换 locale 后采用可预测的 router refresh 或
   server re-render，使 Server Components 与 Client Components 同步，而不是只改客户端文字。
7. 与 `WEB-THEME-01` 协调：locale 与 theme 都由首个 HTML 正确决定，不能修好语言却引入主题闪烁。

## i18n 硬门禁

- 修复范围覆盖所有可见文本、动态状态、错误、empty/loading、placeholder、title、tooltip、aria-label。
- API 继续返回 stable code/enum/raw data；不得通过直接显示后端英文 message 回避 SSR locale。
- English 与中文均只能显示单一语言；未知 key 在测试中失败，不以英文可见 fallback 掩盖。
- 不允许通过隐藏整个页面直到 JS 执行来“修复”闪烁，这会造成空白首屏和性能退化。

## 自动化验收

1. 设置 `bestar_locale=zh-CN` 后，以禁用 JavaScript或在 hydration 前读取原始 HTML，首屏关键文本已是中文，
   `html lang="zh-CN"`，不包含对应英文 UI 文本。
2. Playwright 对刷新过程录制/逐帧检查：中文 refresh 从第一个可见 frame 起无英文；English 同理无中文。
3. 中文 -> refresh -> 路由跳转 -> English -> refresh 全程没有混语、hydration warning 或文字跳变。
4. locale 切换后 Server Component 与 Client Component 同步，不需二次手动刷新。
5. desktop/mobile、登录页/dashboard/柜子详情/导入/装车/工资/月结至少各覆盖一个关键页面或共享 shell。

## 验收标准

1. 中文状态刷新不再闪现英文；首个 server HTML 就是中文。
2. 英文状态行为不回归，`html lang` 与 cookie 一致。
3. 不以全屏隐藏、opacity 0、延迟渲染或 loading cover 掩盖问题。
4. i18n provider 不再在 mount 后用 browser locale 覆盖 server initial locale。
5. 测试覆盖无 JS HTML、hydration、切换、刷新和关键模块。

## 测试命令

- `pnpm --filter web lint`
- `pnpm --filter web typecheck`
- `pnpm --filter web test -- i18n`
- `pnpm --filter web build`
- 运行 focused Playwright locale no-flash smoke
- `git diff --check`

