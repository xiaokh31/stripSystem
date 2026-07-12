# 执行 WEB-I18N-05：Migrate All Web Modules to Explicit Localization

## 前置任务

- `WEB-I18N-04Restore Explicit Localization Runtime Contract.md`

## 必须读取与使用的 skills

- `AGENTS.md`、`CONTEXT.md`
- `.codex/skills/nextjs-pwa-ui/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- `WEB-I18N-04Restore Explicit Localization Runtime Contract.md`
- Web i18n catalog/locales/status helpers/translator
- `apps/web/tests/i18n.test.ts`
- 当前所有 `apps/web/src/app/**/*.tsx` 与 `apps/web/src/components/**/*.tsx` 用户可见文本调用点

## 任务目标

把仍依赖旧 `translateDocument` 的所有 Web 用户可见文本迁移为显式 locale 翻译。完成后，无论 JavaScript
是否启用、页面是 Server Component 还是 Client Component、是否发生异步更新，中文状态都不能泄漏英文
UI 文本。

## 必须覆盖的模块

按以下顺序迁移，每完成一组立即加 focused tests，不得只在最后批量自测：

1. Import：导入列表、上传、详情、解析、生成、删除、状态与错误。
2. Container：列表、详情、目的仓修正、warning/rule、生成文件、库存人工调整、拆柜工资人员选择。
3. Inventory/Reports：报告入口、筛选、表头、轮询、空状态和错误。
4. Load Jobs：计划、列表、历史、分页、状态、月台、完成装车和错误。
5. Web mobile scan：任务、扫码、相机、离线队列、主管覆盖、所有 scan result/error。
6. Work Hours：考勤导入、解析、复核、表头、员工日记录、文件与生成状态。
7. Unloading Wage/Summary：月份、结算、paid unit、worker、review、export、空月和错误。
8. Admin/Settings：用户、角色、权限、运营设置、表单、确认、错误和 empty state。
9. 全局补漏：error/not-found/loading、分页、通用组件、可访问性属性和 browser confirm/toast。

已观察到的高风险文件包括但不限于：

- `apps/web/src/app/reports/inventory/page.tsx`
- `apps/web/src/app/unloading-wage/page.tsx`
- `apps/web/src/app/work-hours/page.tsx`
- `apps/web/src/app/load-jobs/**/*.tsx`
- `apps/web/src/app/mobile/load-jobs/**/*.tsx`
- `apps/web/src/components/containers/*.tsx`
- `apps/web/src/components/imports/*.tsx`
- `apps/web/src/components/mobile/mobile-scan-panel.tsx`
- `apps/web/src/components/admin/*.tsx`
- `apps/web/src/components/wage/*.tsx`

## 迁移规则

1. Server Components：读取/接收 locale，在 render 时调用 Server translator。
2. Client Components：使用 `useI18n().t` 或同一显式 helper；locale 变化应触发正常 React render。
3. 业务原始值不翻译：柜号、托盘号、装车单号、车辆/月台号、员工姓名、文件名、email、数值、时间、
   API code（仅诊断视图）等。
4. enum/status/reason/rule/warning 必须通过集中 helper 或 stable key 映射，不在组件内散落 switch 文案。
5. 动态句子使用参数插值，不使用字符串拼接后再尝试整句匹配。
6. API error message 不直接作为主 UI；使用 stable error code 映射，未知错误显示本地化通用提示。
7. 删除不再需要的 English source -> DOM reverse translation 路径；禁止双向修改已渲染文本。

## i18n 硬门禁

- 所有 visible copy、table heading、form label、option、button、placeholder、title、tooltip、aria、toast、
  confirm、validation、empty/loading/error 和动态状态进入 `en` / `zh-CN` catalog。
- `en` / `zh-CN` key parity 通过，中文值不得无理由等于英文值。
- 切换语言时只显示一种语言；不得显示 `中文 (English)`、raw enum + 翻译等双语形式。
- 与 Web theme 组合验证，不允许 dark mode 下因隐藏/遮挡而让 untranslated text 测试漏报。

## 明确非目标

- 不修改业务计算和数据库/API contract，除非 API 正在返回无法本地化的自由文本；这种情况只允许新增
  stable code/structured params，且需 focused contract test。
- 不恢复全局 DOM MutationObserver。
- 不通过把所有英文加入“允许名单”让扫描测试通过。
- 不把整个页面改成 Client Component 仅为了获得 locale。

## 验收标准

1. 上述九组模块在中文下不存在未批准英文 UI 文本，在英文下不存在中文 UI 文本。
2. 所有 hardcoded JSX text 与 translatable attributes 要么显式翻译，要么属于记录在案的业务 raw value。
3. 异步产生的 toast/error/queue/status 文案同样本地化，不依赖 DOM observer。
4. SSR、hydration、client interaction 和 router navigation 后语言保持一致。
5. 每组有 focused unit/render 测试，业务行为原测试不回归。

## 测试命令

- `pnpm --filter web lint`
- `pnpm --filter web typecheck`
- `pnpm --filter web test`
- `pnpm --filter web build`
- 运行每组模块的 focused tests
- `git diff --check`

