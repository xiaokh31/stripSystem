# 执行 WEB-BRAND-02：Office Shell and Login Brand Integration

## 优先级与前置任务

- 优先级：P1 Web 品牌可见接入。
- 前置任务：`WEB-BRAND-01Corporate Logo Asset Foundation and Browser Identity.md` 必须达到受监督终态。
- 后续任务：`WEB-BRAND-03I18n Theme Accessibility Performance Visual Exit Gate.md`。

## 必须读取与使用

- `AGENTS.md`、`HANDOFF.md`、`CONTEXT.md`
- `prompts/agents/business-logic-agent.md`
- `docs/product/05-web-corporate-brand-assets.md`
- `WEB-BRAND-01` 的实现、测试和 handoff
- `.codex/skills/bestar-handoff/SKILL.md`
- `.codex/skills/frontend-design/SKILL.md`
- `.codex/skills/nextjs-pwa-ui/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- `WEB-DASHBOARD-00`、`WEB-DASHBOARD-02`、`WEB-DASHBOARD-05/06`
- `WEB-OPS-01`、`WEB-OPS-04/05`
- `WEB-THEME-01`、`WEB-I18N-04/05/06`
- `apps/web/src/components/layout/office-shell.tsx`
- `apps/web/src/components/layout/office-navigation.tsx`
- `apps/web/src/components/auth/`、`apps/web/src/app/login/page.tsx`
- `apps/web/src/app/globals.css`、theme/i18n provider/bootstrap
- existing auth, dashboard, theme, navigation and locale tests/E2E
- Docker full-stack runbook and Compose

## 任务目标

把 WEB-BRAND-01 的共享品牌 contract 接入现有 Manifest Control Room Shell 和登录体验。品牌必须清晰，但不能
挤占运营状态、用户/角色、主题、语言、退出和导航空间，也不能改动任何业务行为。

## 实现范围

### 1. Authenticated desktop Shell

1. 在 `lg` 及以上左侧 256px rail 的 identity 区展示一个 `onDark` full wordmark。
2. 保留 localized `Manifest Control Room` 作为紧凑 descriptor，但删除重复的 plain-text corporate name。
3. desktop top operational header 不再重复第二个 wordmark；header 的 health、time、user、roles、theme、locale、logout
   保持现有顺序和行为。
4. logo 的 bounding box 稳定，不因 route、role、locale、health polling 或 clock tick 改变尺寸。

### 2. Authenticated tablet/mobile Shell

1. `lg` 以下在 top Shell 显示 `onDark` wordmark，导航仍位于可用的横向区域。
2. 390px 常用移动宽度必须显示完整 wordmark；在 320px 或系统放大导致空间不足时，切到 64px `icon`，并提供
   唯一可访问的公司名称，不能压缩、裁剪字标或覆盖操作按钮。
3. theme/language/logout 等工具允许按现有 responsive 规则换行，但不得出现 page-level overflow 或不可点击区域。

### 3. Unauthenticated and login experience

1. 没有 current user 时，top Shell 仍显示完整 corporate identity，而不是纯文字站名。
2. `/login` 保持紧凑实际登录工具，不做营销 hero、插画或大面积装饰。
3. 当 top Shell 已展示 full wordmark 时，login form 不再重复第二份 full wordmark；表单仍显示 localized
   Authentication、Sign in、Email、Password、errors 和 API health link。
4. 现有持久 session、safe redirect、sign-in button、locale、theme 和 error mapping 不得改变。

### 4. Shared surface rules

1. fixed dock-steel Shell 始终显式请求 `onDark`，不随页面 light/dark theme 错换成低对比度资源。
2. 如确需在 page surface 使用 mark，必须按当前 surface 显式传 `onLight`/`onDark`；不得新增 theme-detection effect。
3. 品牌资源只出现在 Shell identity touchpoint，不添加到 Dashboard panel、metric、table、empty state 或每个 page heading。
4. 不引入新字体、外部资源、营销文案或 mock business data。

## I18n 100% 硬门禁

1. 所有被移动、保留或新增的 visible descriptor、alt、aria-label、title、tooltip 必须走 typed translator 和 en/zh-CN catalog。
2. `Bestar Service CCA` 作为专名可在两语言中同值；`Manifest Control Room`、`Warehouse Office`、登录及全部 shell
   UI 仍按当前 locale 单语显示。
3. 不得以图像文字为理由删除中文 descriptor，也不得出现 `BESTAR / Bestar Service CCA / 中文标题` 三重重复。
4. 中文 SSR、first frame、hydration、refresh、client navigation 不闪英文；English 反向成立。
5. 不恢复 DOM walker、MutationObserver、body hidden、opacity 延迟翻译或 client-only logo/theme selection。
6. roles/status/error 继续使用现有 locale-aware mapping；不得显示 raw enum、raw labelKey 或 API English message。

## 无障碍与布局要求

1. meaningful wordmark 有一个准确 accessible name；邻接文本已提供名称时 image 为 decorative。
2. 如果 logo 可点击回首页，必须使用真实 `Link`、localized aria-label、清楚 focus ring，并保留当前 route/navigation semantics；
   如果没有明确行为则不得伪装成按钮。
3. 320/390/768/1366/1920/2560、125%/200% zoom 下无 clipping、stretch、overlap 和 document overflow。
4. 长 email、ADMIN 多角色、英文角色名和中文导航必须纳入布局验证。
5. Logo 不影响 keyboard order、nav `aria-current`、theme segmented control、language switcher 和 logout hit target。

## 明确非目标

- 不改 dashboard 数据、API health contract、operational clock cadence 或 permissions。
- 不重做 login authentication/session、安全错误语义或页面 IA。
- 不改 Native app、Web mobile scan 专用工作区业务行为、Excel/PDF/labels。
- 不新增 logo 动画、hero、背景水印、渐变、卡片套卡片或装饰性 brand section。

## 验收标准

1. Authenticated desktop 只在 rail 显示一个完整字标，top header 不重复。
2. Tablet/mobile 与 unauthenticated Shell 显示一个清晰 identity；320px fallback 使用 icon 而非裁切 wordmark。
3. 登录页始终能看到企业身份，同时表单仍是首屏主要任务且无重复 logo。
4. light/dark/system、en/zh-CN、authenticated/anonymous 从 SSR 首帧起使用正确对比度和正确语言。
5. Theme/locale switch、logout、login redirect、user/roles、health、clock、nav active state 和 permission filtering 全部回归通过。
6. 关键 viewport/zoom 无 page overflow、logo distortion、按钮遮挡或 layout shift。
7. Web lint、typecheck、unit、build、auth/dashboard/theme/locale focused Docker Playwright、healthcheck 和 diff check 通过。
8. 无 API、schema、Worker 或 business logic 变更。

## 必须执行的测试

```bash
docker compose -f infra/docker/compose.local.yml up -d --build web nginx
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web lint
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web typecheck
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web test
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web build
docker compose -f infra/docker/compose.local.yml --profile e2e run --rm e2e-web e2e/auth-login.spec.ts e2e/dashboard.spec.ts --project=chromium
scripts/healthcheck.sh
git diff --check
```

如现有 E2E 无法对 brand geometry 做稳定断言，新增 focused spec；不要把 WEB-BRAND-03 的完整矩阵提前复制到本任务。

## 手工视觉检查

1. 保存 authenticated desktop rail、authenticated 390px top Shell、anonymous login desktop/mobile 的高信号截图。
2. 至少覆盖 en-light、zh-CN-dark，并补 320px compact fallback 和 desktop 200% zoom。
3. 使用图片查看工具按原始分辨率逐张检查；只生成截图不查看不算完成。

## 完成输出

- 列出 desktop/tablet/mobile/anonymous 的实际 placement 和 accessible-name 策略。
- 列出现有 Shell/login 行为回归、Docker 测试、截图绝对路径和已知限制。
- 更新本 Task、任务索引、完成度报告和 `HANDOFF.md` 的真实终态。
- 下一推荐任务固定为 `WEB-BRAND-03I18n Theme Accessibility Performance Visual Exit Gate.md`。
