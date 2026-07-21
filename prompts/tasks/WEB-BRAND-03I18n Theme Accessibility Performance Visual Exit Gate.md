# 执行 WEB-BRAND-03：I18n Theme Accessibility Performance Visual Exit Gate

## 优先级与前置任务

- 优先级：P1 Web 企业品牌资源关闭门禁。
- 前置任务：`WEB-BRAND-01`、`WEB-BRAND-02` 必须均达到受监督终态。
- 本任务发现缺陷必须直接修复并重跑，不得只输出问题清单或停在“尚未达到可交付终态”。

## 必须读取与使用

- `AGENTS.md`、`HANDOFF.md`、`CONTEXT.md`
- `prompts/agents/business-logic-agent.md`
- `docs/product/05-web-corporate-brand-assets.md`
- `WEB-BRAND-01/02` task、changed files、tests、screenshots、handoff
- `.codex/skills/bestar-handoff/SKILL.md`
- `.codex/skills/frontend-design/SKILL.md`
- `.codex/skills/nextjs-pwa-ui/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- `WEB-I18N-04/05/06`、`WEB-THEME-01`、`WEB-DASHBOARD-05/06`、`WEB-OPS-01/04/05/09`
- brand component/asset map、root metadata/layout、OfficeShell、login、navigation、theme/i18n bootstrap
- `apps/web/tests/i18n.test.ts`、auth/dashboard/theme tests and E2E
- Docker local deployment/E2E runbooks and Compose

## 关闭目标

以真实 Docker/nginx full stack 证明企业 logo 在浏览器 metadata、anonymous login、authenticated desktop rail、
tablet/mobile Shell 中完整可用，并且没有破坏 i18n、theme、RBAC、导航、性能或现有 Manifest Control Room 布局。

## 强制功能检查

1. `/favicon.ico`、16px、32px、Apple touch icon 和页面 metadata link 均返回正确企业资源，无旧 Next 图标和 404。
2. authenticated desktop 只有一个 rail full wordmark；authenticated mobile/tablet 和 anonymous Shell 各有一个 top identity。
3. 320px compact fallback、390px full wordmark、`lg` breakpoint rail/header 切换不会瞬间双显或全隐。
4. navigation permission filtering、active route、health、clock、current user/roles、theme、locale、login/logout 均保持原功能。
5. 所有图片 `naturalWidth > 0`、比例正确、无 stretch/crop；64px mark 不被放大超过 natural size。
6. starter asset 已无 runtime request；logo 与 icon 全部来自本地同源路径。

## I18n 100% 关闭门禁

1. AST/catalog gate 覆盖 brand component、metadata helper、OfficeShell、navigation、login 和 touched CSS-driven labels。
2. en/zh-CN catalog key、dynamic placeholder 和 accessible-name parity 必须通过；禁止 broad allowlist 或整文件跳过。
3. English 页面不得出现中文 UI；中文页面不得出现 English fallback UI、raw key、raw enum 或双语 label。
4. 公司 wordmark 内的 `BESTAR` 以及真实 email/role code/API code 等既有 raw data exception 不得被误报为翻译泄漏；
   但不得借此豁免邻接 descriptor、alt、aria-label、title 或 tooltip。
5. 中文/English SSR 原始 HTML、first visible frame、hydration、refresh、client navigation 全程保持目标 locale。
6. locale switch 期间 logo 不重新请求错误 variant、不闪现 plain-text duplicate、不让 screen reader 获得重复名称。

## Theme 与视觉矩阵

高信号最终截图不超过 18 张，至少覆盖：

- Routes：anonymous `/login`、authenticated `/`、一个非 Dashboard office route。
- Locale/theme：`en-light`、`en-dark`、`zh-CN-light`、`zh-CN-dark`、至少一个 `system` theme 路径。
- Viewports：320x568、390x844、768x1024、1366x768、1920x1080、2560x1440。
- Zoom：desktop 125% 与 200%。
- Identity：anonymous、ADMIN、多角色/长 email user；不得创建或修改真实业务账号。

每张截图必须以原始分辨率打开检查：logo 清晰度/比例/对比度、rail/header breakpoint、长文本、操作按钮、导航、
focus、no-overlap、no-clipping、no-mixed-language。不得重新建立 200+ 张无差别截图矩阵。

## 自动几何、无障碍和性能断言

1. logo rendered ratio 与 natural ratio 在像素容差内；bounding box 非零且不与 header actions/nav 相交。
2. `documentElement.scrollWidth <= clientWidth`；局部可滚区域不撑宽页面。
3. meaningful placement 恰有一个可访问名称；decorative image `alt=""`；可点击 logo 有 keyboard focus 和 home action。
4. 200% zoom 与 320px 下操作仍可达，不得用 `scaleX`、负 letter-spacing、hidden overflow 裁掉字标。
5. Shell logo 使用固定 dimension，品牌资源引起的 cumulative layout shift 为 0 或测试可证明没有几何跳动。
6. 一个 fixed surface 不同时请求 light/dark full wordmark；theme toggle 不新增 logo listener/timer 或重复 image request。
7. browser console error、pageerror、hydration warning、missing translation、broken image request 和外部 image request 均为 0。
8. 保持 operational clock 的单 timer/performance contract；brand integration 不触发 whole-shell per-second rerender。

## 明确非目标

- 不复跑 API/Worker/数据库全量业务回归；本任务没有业务 contract 变更。
- 不制造 192/512px PWA icon、不宣称 PWA store/install icon gate 完成。
- 不修改 Native、Excel/PDF/report/label branding。
- 不借关闭门禁重做 Dashboard、Shell IA、主题配色或权限。

## 必须执行的测试

```bash
docker compose -f infra/docker/compose.local.yml up -d --build web nginx
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web lint
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web typecheck
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web test
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web build
docker compose -f infra/docker/compose.local.yml --profile e2e run --rm e2e-web e2e/brand-identity.spec.ts --project=chromium
docker compose -f infra/docker/compose.local.yml --profile e2e run --rm e2e-web e2e/auth-login.spec.ts e2e/dashboard.spec.ts --project=chromium
scripts/healthcheck.sh
git diff --check
```

如果 focused spec 使用别的最终文件名，任务结果必须写出准确命令。所有 pnpm/Playwright 命令必须在 Docker 中执行。

## 验收标准

1. WEB-BRAND-01/02 的资源、metadata、placement、responsive 和 accessible-name contract 全部通过。
2. en/zh-CN x light/dark/system 从 SSR 到 hydration/refresh/navigation 单语稳定，无双语、raw key 或另一语言闪现。
3. 320/390/768/1366/1920/2560 与 125%/200% zoom 无 logo/文字/控件重叠、裁切、拉伸或 page overflow。
4. Favicon/touch icon/wordmark 全部同源、200、正确类型且无旧 starter identity。
5. 无多余 asset request、theme-selection effect、logo listener/timer、brand CLS 或 operational clock 回归。
6. Agent 已查看全部最终截图；自动测试、production build、healthcheck 和 diff check 全部通过。
7. 更新 task index 与 completion report，把 01/02/03 分别写成真实终态；没有外部 PWA high-resolution master 时明确
   只是不在本需求范围，不能伪造成 blocker，也不能宣称已完成 192/512 icon。

## 完成输出

- 按 Standards / Spec 两轴给出最终结论和本任务实际修复的问题。
- 列出 asset endpoint、network request、CLS/geometry、a11y、locale/theme/viewport/zoom 结果。
- 列出 Docker tests、准确通过数量、截图绝对路径和逐图检查结论。
- 更新 `HANDOFF.md`；已知限制没有则明确写“无 WEB-BRAND 范围内已知限制”。

## 执行结果（2026-07-20）

状态：**Done**。

### Standards / Spec 与实际修复

- Standards：保持 Docker-only、typed i18n、真实 nginx/full-stack、真实 auth/RBAC 与现有 Manifest Control Room
  视觉系统；无 API、schema、migration、Worker、Native 或业务 contract 变更。临时 E2E ADMIN 与多角色长 identity
  均在 `finally`/shell trap 中精确清理，最终 `e2e-web-brand-03-%` 账号残留为 0。
- Spec：修复 `BRAND_ASSETS.onDark` / `onLight` 错误共用 dimensional alternate 的缺陷，恢复
  `wordmark-on-dark.png` / `wordmark-on-light.png` 的 surface 语义；静态门禁新增 exact path/hash、metadata/BrandLogo
  i18n boundary，以及无 logo theme listener/timer/asset swap 断言。
- focused Chromium 覆盖 anonymous `/login`、authenticated `/`、authenticated `/settings`，en/zh-CN、
  light/dark/system、320/390/768/1366/1920/2560 与真实 125%/200% zoom，并覆盖 ADMIN 和四角色长 identity。

### Asset、i18n、几何、a11y 与性能证据

- `/favicon.ico`、16px、32px、Apple touch icon、on-dark wordmark 和 compact mark 经 nginx 均为 HTTP 200 与正确
  image MIME；metadata 3/3 focused tests 同时验证 link、body 非空、favicon 内容一致和 starter SVG 404。
- 最终网络只出现 compact mark 与 on-dark wordmark 的本地同源请求；on-light/dimensional/starter/external image
  request、broken brand request、console error、pageerror、hydration warning 和 missing translation 均为 0。
- 10/10 geometry 记录的 logo box 固定为 64x64 或 228x50，rendered ratio 正确、非零且不与 actions/nav/user
  cluster 相交；`documentScrollWidth === documentClientWidth`，brand layout shift 为 0。
- 每个可见 placement 恰有一个 `Bestar Service CCA` accessible image name、没有 plain-text duplicate；logo 按产品
  contract 保持非交互，不伪装 link/button。320px compact mark 不超过原生 64px。
- locale/theme 切换与 client navigation 不更换 logo、不增加 brand request；2.2 秒 clock probe 只观察到 clock leaf
  更新，非 clock header mutation 为 0；unit contract 继续证明单 timer/hidden/narrow pause。

### 自动化与视觉检查

- Docker Web lint、typecheck、255/255 unit tests、production build、`scripts/healthcheck.sh` 与
  `git diff --check` 通过。typecheck 初次发现 E2E readonly cookie 类型错误，修复并重建后通过。
- Docker Chromium：`brand-identity.spec.ts` 最终 3/3；`auth-login.spec.ts` + `dashboard.spec.ts` 5/5。
  focused 门禁开发期间修复了 catalog 期望、Next responsive image 像素取整、strict locator、hidden lazy image 与
  RSC prefetch abort 等测试假阳性；最后两次 3/3 均通过，最后一次保留最终 artifacts。
- 10 张最终 PNG 与 `brand-exit-evidence.json` 位于
  `/Volumes/xfl/logistics/stripSystem/test-results/web-brand-03/`。Agent 已用图片查看器按原始分辨率查看 10/10，
  logo 比例/对比、rail/top breakpoint、长 identity、focus、控件可达性、无重叠/裁切/页面 overflow/混语均通过。

已知限制：**无 WEB-BRAND 范围内已知限制**。供应资源仍无 192/512px 或 vector master；PWA store/install icon
不在本需求范围，本任务未伪造或宣称完成。
