# 执行 WEB-THEME-01：Office Web Light Dark System Theme

## 必须读取与使用的 skills

- `AGENTS.md`、`CONTEXT.md`
- `WEB-DASHBOARD-00Back Office Visual Direction.md`
- `.codex/skills/frontend-design/SKILL.md`
- `.codex/skills/nextjs-pwa-ui/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- `apps/web/src/app/layout.tsx`
- `apps/web/src/app/globals.css`
- office shell/navigation/dashboard primitives and all shared status components
- Web i18n provider/catalog/locales/tests

## 产品目标

为办公室 Web 增加 `浅色`、`深色`、`跟随系统` 三态主题控制。默认 `跟随系统`；用户明确选择
浅色或深色后持久化，刷新和重新打开浏览器保持选择。

## 任务范围

1. 建立 Web semantic color tokens，覆盖 background、surface、raised surface、text、muted text、border、
   focus、primary action、disabled、success、warning、error、table、input、overlay 和 chart/data colors。
2. 为 Manifest Control Room 提供 light/dark token；不要用 Tailwind `dark:` 零散堆叠替代统一主题层。
3. 在 office shell 稳定位置增加紧凑主题控制，使用熟悉的太阳/月亮/系统图标和 tooltip；三态选项必须
   键盘可达、具有 `aria-label` / `aria-pressed` 或等价语义。
4. 主题选择写入持久 cookie，允许 server layout 在首个 HTML 确定主题；本地存储可作为辅助，不能成为
   首屏唯一来源。
5. `跟随系统` 使用 `prefers-color-scheme`，并在系统运行中切换时实时更新；用户显式 light/dark 时不跟随。
6. 在 hydration 前设置正确 `html` class/data attribute 和 `color-scheme`，避免白闪、黑闪或 hydration mismatch。
7. 覆盖 dashboard、导航、表格、筛选、表单、modal、toast、状态 badge、图表、登录页、错误/空状态、
   wage/unloading/inventory/import/load-job/account 全模块。

## 设计与可访问性约束

- 保持 Manifest Control Room 多色运营语义，不做整页深蓝/slate 单色主题。
- success/warning/error 在两种主题保持相同含义，不能只靠颜色表达。
- 普通文字对比度 >= 4.5:1，大号文字和控件边界/图形 >= 3:1。
- browser autofill、native select、date input、focus ring、disabled 和打印/导出页面必须检查。
- 主题只改变显示，不改变 API 请求、权限、筛选、表单内容和业务状态。

## i18n 硬门禁

- `Theme`、`Light`、`Dark`、`System`、tooltip、aria-label 和系统主题提示全部进入 en/zh catalog。
- locale 与 theme 分别持久化，切换一项不能重置另一项。
- 覆盖 `en-light`、`en-dark`、`zh-CN-light`、`zh-CN-dark` 以及 system-light/system-dark。
- 任一组合只显示当前语言，不允许主题控制出现双语或 raw key。

## 性能约束

- 不新增阻塞网络字体、远程主题服务或大型 UI framework。
- 首屏主题初始化不得引入可见闪烁；主题切换不得触发业务 API refetch 或整页 reload。
- 记录切换前后 Web build/bundle 变化；无合理原因不得引入大型依赖。

## 验收标准

1. 默认跟随系统，手动 light/dark 后刷新、关闭并重新打开浏览器仍保持。
2. 首个 HTML、状态栏支持信息和 hydration 后主题一致，无主题闪烁或 mismatch warning。
3. 所有办公室模块在两种主题中可读、可操作且业务状态语义一致。
4. 主题、locale、登录 cookie 互不覆盖。
5. 自动化覆盖 theme resolver、cookie、system change、manual override、locale x theme 和关键页面 smoke。

## 测试命令

- `pnpm --filter web lint`
- `pnpm --filter web typecheck`
- `pnpm --filter web test`
- `pnpm --filter web build`
- 运行 focused Playwright theme/i18n smoke
- `git diff --check`

