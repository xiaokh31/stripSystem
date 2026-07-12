# 执行 WEB-I18N-04：Restore Explicit Localization Runtime Contract

## 问题与已确认根因

`WEB-I18N-03` 为消除中文刷新时的英文闪现，移除了 `I18nProvider` 中 mount 后执行的
`translateDocument` 和全局 `MutationObserver`。这个方向解决了二次 DOM 翻译造成的闪烁，但项目中
仍有大量 JSX 英文源码、属性文案和动态提示依赖旧的全局翻译器，没有同步改为显式翻译调用。

结果是：catalog 仍有翻译，页面却不再调用翻译，中文状态直接显示英文。现有 i18n source test 只验证
字符串是否存在于 catalog，没有验证渲染位置是否实际调用翻译函数，因此错误放行了回归。

## 前置任务

- `WEB-I18N-03Eliminate English Flash on Chinese Refresh.md` 已执行但不得视为完整完成。
- 本任务必须在 `WEB-I18N-05` 和 `WEB-I18N-06` 前执行。

## 必须读取与使用的 skills

- `AGENTS.md`、`CONTEXT.md`
- `.codex/skills/nextjs-pwa-ui/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- `WEB-I18N-01Full Localization Gap Audit + Runtime Coverage.md`（若仓库内存在）
- `WEB-I18N-03Eliminate English Flash on Chinese Refresh.md`
- `apps/web/src/app/layout.tsx`
- `apps/web/src/components/i18n/i18n-provider.tsx`
- `apps/web/src/components/i18n/language-switcher.tsx`
- `apps/web/src/lib/i18n/catalog.ts`
- `apps/web/src/lib/i18n/server.ts`
- `apps/web/src/lib/i18n/browser.ts`
- `apps/web/src/lib/i18n/translator.ts`
- `apps/web/tests/i18n.test.ts`
- `apps/web/e2e/locale-switch.spec.ts`

## 任务范围

### 1. 建立唯一的显式翻译契约

1. 为 Server Components 提供明确的 locale translator，例如 `createTranslator(locale)` / `t(key, params)`；
   Server page 从 `getServerLocale()` 获取 locale，并在 SSR 时直接生成目标语言。
2. 为 Client Components 通过 `useI18n()` 暴露同一语义的 `t` 接口；不得要求组件操作 DOM 才能翻译。
3. 允许在本轮继续兼容现有英文 source key catalog，避免同时重写全部 key；但所有用户可见位置必须
   显式调用 translator。后续改为 semantic key 时也必须保持单一 API。
4. 缺少中文翻译时在测试/开发环境明确失败，不允许中文 UI 静默显示英文 key；生产可显示本地化通用
   错误并记录诊断，但不得把 raw key 当正常文案。
5. 动态文案通过 key + typed params、稳定 formatter 或 stable API code 映射；不要继续扩大正则猜测任意
   英文句子的范围。

### 2. 修复共享与首屏边界

优先迁移并测试：

- root layout、metadata 和全局 error/not-found/loading 边界。
- `OfficeShell`、`OfficeNavigation`、LanguageSwitcher、ThemeControl。
- 登录表单、auth/session/permission error。
- Dashboard 页面和 dashboard shared components。
- 通用 ApiErrorPanel、状态 badge、分页、empty/loading/error 和 modal/confirm primitives。

这些共享边界修复后，中文首个 server HTML 必须直接是中文，Client hydration 不再依赖全局 DOM 改写。

### 3. 移除失效的半迁移代码

- 如果 `translateDocument`、`translateNode`、attribute walker 已无合法调用方，应在完成显式迁移后删除，
  不保留一个看似可用但实际未运行的第二套翻译系统。
- 不得恢复全页面 `MutationObserver` 或 mount 后遍历 `document.body`。
- locale cookie 继续作为 SSR source of truth；切换语言后 Server/Client 输出必须一致。

## 明确非目标

- 本任务不要求一次完成所有业务模块；业务模块由 `WEB-I18N-05` 迁移。
- 不改变 API、权限、库存、工资、导入或装车业务逻辑。
- 不通过隐藏页面、opacity、loading cover 或延迟 hydration 掩盖英文闪现。
- 不用中英双语拼接规避缺少翻译。

## i18n 硬门禁

- 所有 touched visible text、placeholder、title、tooltip、aria-label、aria-description、alt、toast、confirm、
  loading/empty/error 和动态状态必须显式走 locale catalog。
- API 只返回 stable code/enum/raw data；用户可见错误由 Web 根据 locale 映射。
- `en` 与 `zh-CN` key parity 必须通过；中文不得以英文 key 作为可见 fallback。
- locale 与 theme cookie 互不覆盖；`en-light`、`en-dark`、`zh-CN-light`、`zh-CN-dark` 均可渲染。

## 验收标准

1. 共享 Shell、登录、Dashboard、全局错误边界在中文首个 HTML 中没有对应英文 UI 文本。
2. 页面 hydration 后文字不发生英文 -> 中文二次替换，且无 hydration warning。
3. 显式 Server/Client translator 有 focused unit/render tests，缺 key 能被测试捕获。
4. `I18nProvider` 不恢复全局 DOM scanner 或 MutationObserver。
5. LanguageSwitcher 切换后 Server Components 与 Client Components 使用同一 locale。
6. 不修改无关业务文件。

## 测试命令

- `pnpm --filter web lint`
- `pnpm --filter web typecheck`
- `pnpm --filter web test -- i18n`
- `pnpm --filter web build`
- 运行 shared shell/login/dashboard focused render tests
- `git diff --check`

