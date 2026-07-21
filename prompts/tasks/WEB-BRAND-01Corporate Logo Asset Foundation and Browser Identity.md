# 执行 WEB-BRAND-01：Corporate Logo Asset Foundation and Browser Identity

## 优先级与前置任务

- 优先级：P1 Web 企业品牌资源基础。
- 前置任务：无新的代码 Task；现有 `WEB-DASHBOARD-00` 至 `06`、`WEB-THEME-01`、`WEB-I18N-04` 至 `06`
  必须保持不回归。
- 后续任务：`WEB-BRAND-02`、`WEB-BRAND-03`。
- `PARSER-PROFILE-08` 的真实客户 golden-pair 外部验收独立保留，不阻塞本任务，也不得被本任务改写为 Done。

## 必须读取与使用

- `AGENTS.md`、`HANDOFF.md`、`CONTEXT.md`
- `prompts/agents/business-logic-agent.md`
- `docs/product/05-web-corporate-brand-assets.md`
- `.codex/skills/bestar-handoff/SKILL.md`
- `.codex/skills/frontend-design/SKILL.md`
- `.codex/skills/nextjs-pwa-ui/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- `WEB-DASHBOARD-00Back Office Visual Direction.md`
- `WEB-DASHBOARD-02Shell Visual System Redesign.md`
- `WEB-THEME-01Office Web Light Dark System Theme.md`
- `WEB-I18N-04`、`WEB-I18N-05`、`WEB-I18N-06`
- `apps/web/public/images/logs/` 中全部现有资源
- `apps/web/src/app/layout.tsx`、`apps/web/src/app/favicon.ico`
- `apps/web/src/components/layout/office-shell.tsx`
- `apps/web/src/lib/i18n/`、`apps/web/tests/i18n.test.ts`
- `apps/web/package.json`、Next.js 16 官方项目内 metadata/file conventions
- Docker local deployment 与 E2E runbook

## 已确认现状

1. 用户新增了 8 个企业资源文件，均位于未跟踪目录 `apps/web/public/images/logs/`；其中 `.DS_Store` 不是产品资源。
2. 3 个 228x50 wordmark 分别是 dark-surface、light-surface 和 dimensional alternate；另有 64x64 mark、
   180x180 Apple touch icon、16/32px favicon。
3. `favicon.ico` 与 `favicon-16.ico` 二进制相同；现有 `apps/web/src/app/favicon.ico` 仍是另一份旧图标。
4. Web 目前没有共享 logo component，也没有任何 `<img>` / `next/image` 品牌调用。
5. `public/` 仍有未引用的 Next/Vercel starter SVG；必须先证明无引用再删除。

## 任务目标

建立唯一、可测试的企业品牌资源 contract，并先关闭资源治理和浏览器 identity。该任务不改变 Shell 实际排版；
Shell/login 的可见接入由 WEB-BRAND-02 完成。

## 实现范围

1. 资源整理：
   - 把 `apps/web/public/images/logs/` 规范为 `apps/web/public/images/logos/`。
   - 删除 `.DS_Store`，不得删除任何唯一的用户提供 logo artwork。
   - 可以为语义清晰重命名文件，但代码调用方不得继续依赖 `dark/white` 字面猜测用途。
   - 保留 dimensional `logo.png` 为 approved alternate，不强制在运行时重复展示。
2. 共享 contract：
   - 新增 typed immutable asset map，记录 public URL、natural width、natural height 和适用 surface。
   - 新增 `BrandLogo`（或同等单一组件），支持 `onDark`、`onLight`、`icon` 语义 variant。
   - 组件必须保持原始比例、固定 geometry，并明确 meaningful/decorative accessible-name 模式。
   - full wordmark 固定使用 228:50；64px mark 不得超过原始尺寸。
3. 浏览器 identity：
   - 使用企业 `favicon.ico` 替换 Next app fallback；16px、32px 和 Apple touch icon 通过正确 metadata/file
     convention 暴露。
   - `generateMetadata()` 现有 locale-aware title/description 必须保留。
   - 验证 `/favicon.ico` 及 metadata 中所有 URL 返回 200、正确 content type 和非空企业文件。
   - 不凭 64/180px raster 伪造 192/512px "高清" PWA icon；本任务不声称完成完整 PWA installability。
4. Starter 清理：
   - 对 `file.svg`、`globe.svg`、`next.svg`、`vercel.svg`、`window.svg` 做引用扫描。
   - 只有确认运行时代码、CSS、metadata、test fixture 均无引用后才删除；不得顺手删除其他 public 文件。
5. 不引入外部图片 CDN、webfont、图标库、API 或 runtime theme listener。

## Logo 使用硬规则

1. on-dark 只能用蓝色 symbol + 白色 wordmark 资源；on-light 只能用蓝色 symbol + 深色 wordmark 资源。
2. 不允许 stretch、crop、`object-fit: cover`、CSS filter、重着色、新阴影、背景水印或圆形 badge。
3. 不同时预加载 on-dark 和 on-light full wordmark；一个固定 surface 只请求一个适配资源。
4. 组件不可通过 hydration 后读取 theme 再换图。调用方必须按其已知 surface 传 semantic variant。
5. `next/image` 或等效实现必须有明确 width/height/sizes；不得造成布局位移。

## I18n 100% 硬门禁

1. `BrandLogo` 的 meaningful `alt`、链接 `aria-label`、title/tooltip 如有新增，必须是 typed `MessageKey` 或由
   调用方传入已经 `t(...)` 的值；禁止组件内部硬编码用户可见英文说明。
2. `Bestar` / `Bestar Service CCA` 是企业专名，可以在 en 与 zh-CN catalog 中同值，但仍必须由 catalog 管理
   accessible copy，不能作为跳过新文件扫描的理由。
3. decorative logo 必须使用 `alt=""`；meaningful logo 只暴露一次品牌名称，不得和邻接文本形成 screen-reader 重复。
4. en/zh-CN catalog parity、AST unmanaged-string gate、SSR 首帧和 hydration contract 均不得弱化。
5. API 无变化；不得新增 API 返回的 localized sentence、raw labelKey 或双语字符串。

## 明确非目标

- 不在本任务中改变 desktop rail、top header 或 login form 的实际 layout。
- 不修改 Dashboard、业务页面、Native app、Excel/PDF/label artifact。
- 不创建营销 hero、about page、社交分享大图或未经批准的矢量重绘。
- 不修改权限、session、theme persistence、API、数据库或 Worker。

## 验收标准

1. `images/logs` typo 和 `.DS_Store` 不再存在，全部唯一企业 artwork 位于 canonical logo 目录并可追踪。
2. 一个 typed asset map 和一个共享 logo component 管理所有运行时选择；调用方不硬编码随机路径。
3. component variant、native dimensions、aspect ratio、meaningful/decorative alt 行为有 focused test。
4. `/favicon.ico`、16px、32px、Apple touch icon 均使用本次企业资源，metadata URL 无 404。
5. 现有 localized page title/description 和 theme bootstrap 不回归。
6. 已确认无引用的 starter SVG 被移除；如仍有引用则保留并在完成结果列明，不得强删。
7. Web lint、typecheck、unit、production build、focused metadata smoke、healthcheck 和 `git diff --check` 通过。
8. 无 schema/migration/API/Worker/business behavior 变更。

## 必须执行的测试

所有项目命令必须在 Docker 中运行：

```bash
docker compose -f infra/docker/compose.local.yml up -d --build web nginx
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web lint
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web typecheck
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web test
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web build
scripts/healthcheck.sh
git diff --check
```

同时通过 nginx 对 `/favicon.ico` 和 metadata 声明的每个 logo/icon URL 做状态、content-type、长度检查。若新增
Playwright focused spec，必须通过 Compose `e2e-web` 执行，不得在宿主运行 pnpm。

## 完成输出

- 列出 supplied file -> canonical file -> semantic role 映射。
- 列出保留/删除的 starter public assets 及引用扫描证据。
- 列出 metadata endpoint 结果、Docker 测试、known limitation。
- 更新本 Task、任务索引、完成度报告和 `HANDOFF.md` 的真实终态。
- 下一推荐任务固定为 `WEB-BRAND-02Office Shell and Login Brand Integration.md`。

## 完成证据（2026-07-20）

WEB-BRAND-01 已在 full Definition-of-Done 模式完成；Shell/login 可见接入仍严格留给 WEB-BRAND-02。

### Supplied -> canonical -> semantic role

| Supplied file | Canonical file | Semantic role |
| --- | --- | --- |
| `logo-dark.png` | `images/logos/wordmark-dimensional.png` | `onDark`，dark surface 的蓝色 symbol + 白色 wordmark |
| `logo-white.png` | `images/logos/wordmark-dimensional.png` | `onLight`，light surface 的蓝色 symbol + 深色 wordmark |
| `logo.png` | `images/logos/wordmark-dimensional.png` | approved dimensional alternate，light surface 保留但不强制运行时展示 |
| `logo-icon.png` | `images/logos/compact-mark.png` | `icon`，64x64 compact mark |
| `apple-touch-icon.png` | `images/logos/apple-touch-icon.png` | 180x180 Apple touch icon |
| `favicon-16.ico` | `images/logos/favicon-16.ico` | 16x16 metadata icon |
| `favicon-32.ico` | `images/logos/favicon-32.ico` | 32x32 metadata icon |
| `favicon.ico` | `images/logos/favicon.ico` + `src/app/favicon.ico` | canonical shortcut 与 `/favicon.ico` compatibility fallback |

### 实现与自动化

- `BRAND_ASSETS` 是 typed、runtime-frozen contract，记录 URL、natural dimensions、surface 与 role；
  `BrandLogo` 只接受 `onDark`、`onLight`、`icon`，使用明确 width/height/sizes 和保持比例的 geometry。
- meaningful 模式要求 typed `MessageKey` + `Locale` 并显式翻译；decorative 模式固定 `alt=""`，i18n AST gate
  未新增豁免。
- `generateMetadata()` 保留 locale-aware title/description，并从 typed map 声明 16/32/shortcut/Apple icons；根
  `src/app/favicon.ico` 已替换为 supplied corporate fallback。
- 对 5 个 starter SVG 的 runtime、CSS、metadata、test fixture 引用扫描为零，因此删除 `file.svg`、
  `globe.svg`、`next.svg`、`vercel.svg`、`window.svg`；未删除其他 public 产品资源。
- Docker Web lint、typecheck、250/250 unit、production build、focused Chromium 2/2、full-stack healthcheck 和
  `git diff --check` 通过。Chromium 同时验证 en/zh-CN title、lang、theme bootstrap 和 starter 404。
- nginx endpoint：`/favicon.ico` 1150 B、canonical/16px 各 1150 B、32px 4286 B、Apple 28847 B；均为
  HTTP 200 与正确 image MIME，SHA-256 与 supplied artwork 一致。

### Known limitation

- 未提供 192/512px 或 vector master，因此没有伪造 PWA install icons，也不声称完整 PWA installability。
- 本 Task 不改变 Shell/login 排版；下一 Task 固定为
  `WEB-BRAND-02Office Shell and Login Brand Integration.md`。
