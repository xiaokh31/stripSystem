# 执行 WEB-DASHBOARD-05：Bilingual Typography and Layout Regression

## 前置任务

- `WEB-I18N-06Full Localization No Flash Regression Gate.md`
- `WEB-THEME-01Office Web Light Dark System Theme.md` 当前实现作为 light/dark 基线。

## 必须读取与使用的 skills

- `AGENTS.md`、`CONTEXT.md`
- `WEB-DASHBOARD-00Back Office Visual Direction.md`
- `.codex/skills/frontend-design/SKILL.md`
- `.codex/skills/nextjs-pwa-ui/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- `apps/web/src/app/globals.css`
- `apps/web/src/app/page.tsx`
- `apps/web/src/components/dashboard/`
- `apps/web/src/components/layout/`
- dashboard/theme/i18n Playwright tests

## 已观察风险

- Dashboard `.font-control` 优先使用 `Arial Narrow`、`Roboto Condensed`、`Helvetica Neue Condensed`，不同 OS
  和中英文字体 fallback 可能产生异常拉伸/压缩、baseline 和字宽差异。
- 多处对完整英文 label 使用 `uppercase`，English 文案比中文更长，容易挤压 fixed grid、status pill、
  filter 和 header action。
- 当前测试主要检查页面级 horizontal overflow，未验证组件内部重叠、文字裁剪、computed font 或 baseline。

## 任务范围

### 1. 修复字体系统

- Dashboard 和 Shell 普通标题/指标统一使用离线可用的 system UI sans stack；删除对 condensed font 存在性的
  隐式依赖。数据、柜号、时间和数量继续使用 `.font-data` monospace/tabular numbers。
- 不使用 `font-stretch`、`scaleX/scaleY`、transform 或负 letter-spacing 修正文案；letter spacing 设为 0。
- 检查 Chinese glyph fallback，确保中英文 line-height、font-weight 和 vertical alignment 稳定。
- `.font-control` 若保留，只能有明确小范围用途和跨平台 fallback test；默认从 Dashboard 移除。

### 2. 修复 bilingual layout

- English 长 label 使用 sentence case，只有真实短 code/eyebrow 才 uppercase。
- Header、filter、metric、status、lane、shortcut、activity row 使用 `minmax(0,1fr)`、`min-w-0`、稳定 gap 和
  合理 wrap；不能以减小字体到不可读来塞入。
- status/button 必须完整可读；确需截断的业务 raw ID 使用 ellipsis + title，普通 UI label 不静默截断。
- 校正 fixed height/min-height，200% zoom 和长翻译时内容可增高但不覆盖相邻区域。

### 3. 覆盖范围

- Ops Header、range/month filters、health/status、Work Queue、Lifecycle strip、Inventory Pressure、Active Load Jobs、
  Exceptions、Monthly/Wage queues、shortcuts、Recent Activity。
- Office Shell topbar/nav/user/theme/language controls。
- light/dark/system、en/zh-CN、角色裁剪后的不同 section 组合。

## i18n 硬门禁

- 不通过缩短翻译或改成 raw English code 规避布局；文案变更同步 en/zh catalog。
- English/中文单语显示，不恢复 DOM translator，不允许 bilingual label。
- 动态文案与 aria/title/tooltip 同样参与布局和翻译测试。

## 视觉回归要求

- Playwright 截图视口：390x844、768x1024、1366x768、1920x1080；zoom/font scale 至少 100%、125%、
  200% 的关键组合。
- 对 en-light、en-dark、zh-light、zh-dark 保存基线截图。
- 自动检查关键元素 bounding boxes：无交叠、无 clipped text、无组件级横向溢出。
- 检查 computed styles：普通 Dashboard 文本 `font-stretch=100%`、无 transform、letter-spacing=0，使用预期
  system stack；数据文本保持 tabular/mono。
- Chrome 必测；可用时补 Edge/Windows，验证 Arial/字体 fallback 差异。

## 验收标准

1. 中英文 Dashboard 字体视觉比例正常，不再出现整体拉长或压缩。
2. English 下所有 filters、status、panel header、buttons 和 nav 无错位、重叠或静默裁剪。
3. 中文布局不回归；light/dark 颜色和对比度保持。
4. 390/768/1366/1920 与 200% zoom 下无页面或组件级非预期 overflow。
5. Dashboard/locale/theme Playwright、截图和 Docker full-stack smoke 通过。

## 测试命令

- `pnpm --filter web lint`
- `pnpm --filter web typecheck`
- `pnpm --filter web test`
- `pnpm --filter web build`
- `pnpm --filter web test:e2e -- dashboard.spec.ts`
- focused visual/bounding-box regression
- `git diff --check`

