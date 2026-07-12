# 执行 WEB-I18N-06：Full Localization No-Flash Regression Gate

## 前置任务

- `WEB-I18N-04Restore Explicit Localization Runtime Contract.md`
- `WEB-I18N-05Migrate All Web Modules to Explicit Localization.md`

## 必须读取与使用的 skills

- `AGENTS.md`、`CONTEXT.md`
- `.codex/skills/qa-regression/SKILL.md`
- `.codex/skills/nextjs-pwa-ui/SKILL.md`
- `apps/web/tests/i18n.test.ts`
- `apps/web/e2e/locale-switch.spec.ts`
- Web locale/theme provider、catalog、Server translator 和 all changed files
- Docker full-stack runbook

## 任务目标

建立能够同时阻止两类回归的发布硬门禁：

1. 不能再出现“catalog 有翻译，但组件没有调用 translator”的未翻译文本。
2. 不能为了恢复翻译而重新引入中文刷新先英文后中文的首帧闪烁。

## 必须新增或加强的自动测试

### 1. AST / source hard gate

- 扩展现有 TypeScript AST 扫描，不只检查字符串是否存在于 catalog，还要检查用户可见 JSX text、
  translatable props、toast/confirm/setError 等调用点是否位于明确 translator 调用或本地化组件边界内。
- 对业务 raw values 使用小而明确的 allowlist/type boundary；禁止按整文件跳过或把常见英文词批量加入 allowlist。
- 测试 fixture 必须证明以下情况会失败：
  - `<th>File</th>` 即使 catalog 有 `File` 也失败。
  - `placeholder="Select reason"` 即使 catalog 有词条也失败。
  - `setError("Save failed")` 即使 catalog 有词条也失败。
  - `t("File")` 或合法 localized component 通过。

### 2. SSR no-JavaScript gate

- 使用 `bestar_locale=zh-CN` 请求各主要 route 的原始 HTML或禁用 JavaScript 浏览，断言 `html lang` 为
  `zh-CN`、关键中文存在、对应英文 UI 文本不存在。
- English 执行反向断言。
- 不允许只检查一个标题；必须覆盖 Shell、表头、按钮、empty/error 和至少一个动态业务状态。

### 3. Hydration / first-frame gate

- Playwright 记录首次 response 到 hydration 后的可见文案，中文从第一个可见 frame 起不得出现英文 UI。
- 捕获 console hydration warning、React mismatch 和 MutationObserver 翻译循环。
- 不允许以隐藏 body、opacity 0、全屏 loading cover 让检查假通过。

### 4. 全模块 locale matrix

至少覆盖：Dashboard、Imports、Import Detail、Containers、Container Detail、Inventory、Reports、Load Jobs、
Load History、Web Mobile Scan、Work Hours、Unloading Wage、Monthly Summary、Users、Roles、Settings、Login、
permission/error/empty states。

每个 route 执行：

- English -> 中文 -> refresh -> route navigation -> English -> refresh。
- light/dark 与 desktop/mobile 关键组合。
- 检查 text、placeholder、title、tooltip、aria-label、status、toast 和 modal。

## i18n 硬门禁

- API stable code/enum/raw data 与 UI translation mapping 分层清楚。
- en/zh key parity、unknown key failure、dynamic params、status/reason/rule/warning mappings 全部测试。
- UI 只能显示当前 locale，不允许英文 fallback、raw key 或双语状态。
- 删除/证明无调用的旧 `translateDocument` / DOM walker / MutationObserver 路径。

## Docker full-stack 验收

1. 通过 nginx `http://127.0.0.1/` 使用真实登录和权限角色运行 locale smoke。
2. 至少验证 ADMIN、OFFICE、WAREHOUSE、HR_MANAGER、WAREHOUSE_MANAGER 可见模块。
3. 使用真实 API/数据库状态，不引入 mock 业务数据作为验收依据。
4. 记录失败 route、可见原文、locale、theme、role 和截图，修复后再关闭。

## 验收标准

1. AST gate 能对“catalog 有词条但 JSX 未调用翻译”稳定报错。
2. 所有主要 route 的中文 SSR 和 hydration 都无英文 UI 泄漏；English 反向成立。
3. 不存在全局 DOM 二次翻译或页面隐藏方案。
4. locale/theme/role matrix 通过，console 无 hydration warning。
5. Web lint、typecheck、unit、build、Playwright 和 Docker full-stack smoke 全部通过。
6. 更新任务索引和项目完成度报告；只有所有模块证据齐全才能把 WEB-I18N-03 至 06 标为完成。

## 测试命令

- `pnpm --filter web lint`
- `pnpm --filter web typecheck`
- `pnpm --filter web test`
- `pnpm --filter web build`
- `pnpm --filter web test:e2e -- locale-switch.spec.ts`
- Docker full-stack locale/theme/role smoke
- `git diff --check`

