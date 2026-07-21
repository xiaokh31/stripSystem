# 执行 WEB-BRAND-04：Transparent Shell Wordmark Background Regression

## 优先级与前置任务

- 优先级：P1 Web 品牌视觉回归。
- 前置任务：WEB-BRAND-01/02/03 已完成，不得重跑或改写其历史证据。
- 用户现场反馈：页面左上角 Logo 必须使用透明底，不能在 dock-steel Shell 上显示黑色矩形底块。

## 必须读取与使用

- `AGENTS.md`、`HANDOFF.md`、`CONTEXT.md`
- `docs/product/05-web-corporate-brand-assets.md`
- `.codex/skills/frontend-design/SKILL.md`
- `.codex/skills/nextjs-pwa-ui/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- `apps/web/src/components/brand/brand-logo.tsx`
- `apps/web/src/components/layout/office-shell.tsx`
- `apps/web/src/lib/brand-assets.ts`
- `apps/web/src/app/globals.css`
- `apps/web/tests/brand-assets.test.ts`
- `apps/web/e2e/brand-identity.spec.ts`

## 已确认根因

1. Shell 外层没有单独的 Logo 背景块；它直接使用 `--dock-steel`。
2. `wordmark-on-dark.png` 虽为 RGBA，但 alpha 最小值为 221，黑色背景大部分接近或完全不透明，所以实际显示为黑框。
3. `wordmark-dimensional.png` 与字标保持相同 228x50 geometry，并带真实透明 alpha 轮廓；64x64 compact mark 本身也是真透明。

## 实现要求

1. 保留当前蓝色 symbol、白色 BESTAR wordmark 和 228x50 geometry。
2. on-dark full wordmark 使用已批准 transparent artwork 的 alpha 轮廓移除黑色底块；不得拉伸、裁切或生成近似新 Logo。
3. 320px compact fallback 不应用 228x50 mask，继续使用原生透明 64x64 mark。
4. 不修改 on-light、favicon、Apple touch icon、Dashboard、业务页面或 Native/Excel/PDF/label 资产。
5. 不增加客户端 theme effect、listener、timer、hydration 后换图或外部图片请求。
6. Logo layout、accessible name、SSR、theme/locale switch、navigation 与 Shell action geometry 保持不变。

## I18n 100% 硬门禁

- 本任务原则上不新增可见文案。
- 如新增 alt、aria、title、tooltip 或错误文案，必须进入 typed en/zh-CN catalog 并保持单语显示。
- `Bestar Service CCA` accessible name、中文/英文 SSR 首帧和现有 AST unmanaged-string gate 不得弱化。
- API 无变化，不得新增 localized API sentence、raw labelKey 或双语字符串。

## 验收标准

1. Desktop rail、tablet/mobile top Shell 和 anonymous login 的 full wordmark 不再显示黑色矩形背景。
2. 透明区域直接露出当前 `--dock-steel`，蓝色 symbol 与白色字标完整清晰。
3. 320px compact mark 仍为 64x64 真透明资源，不被错误 wordmark mask 破坏。
4. en/zh-CN、light/dark/system、desktop/mobile、125%/200% zoom 无裁切、重叠、CLS 或另一语言闪现。
5. focused unit/E2E 对 full wordmark mask、compact reset、asset request、geometry 与截图建立回归。
6. Docker Web lint、typecheck、unit、build、focused Chromium、healthcheck 和 `git diff --check` 通过。

## Docker 测试

```bash
docker compose -f infra/docker/compose.local.yml up -d --build web nginx
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web lint
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web typecheck
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web test
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web build
docker compose -f infra/docker/compose.local.yml --profile e2e build e2e-web
docker compose -f infra/docker/compose.local.yml --profile e2e run --rm e2e-web e2e/brand-identity.spec.ts --project=chromium
scripts/healthcheck.sh
git diff --check
```

## 完成输出

- 记录根因、实现方式、测试数量、截图路径和原始分辨率视觉检查结果。
- 同步产品规范、任务索引、完成度报告和 `HANDOFF.md`。

## 执行结果（2026-07-20）

状态：**Done**。

### 根因与实现

- `wordmark-on-dark.png` 虽是 RGBA，但左上角像素为 `[0, 0, 0, 229]`，alpha 最小值为 221；大部分黑色 matte
  近乎或完全不透明。Shell 本身没有额外 Logo 背景，现场黑框来自图片内容。
- 保留 on-dark 资源的蓝色 symbol、白色 BESTAR 与 228x50 geometry，使用同 geometry 且真实透明的
  `wordmark-dimensional.png` 仅提供 CSS alpha contour。未重绘、改色、拉伸或引入外部图片。
- 359px 以下继续使用原生透明 64x64 `compact-mark.png`，并显式取消 full-wordmark mask；on-light、favicon、
  Apple touch icon、业务页面、API、数据库、Native 和生成文件均未修改。
- 未新增可见文案、alt、aria、title 或 tooltip；typed `en` / `zh-CN` catalog 与 SSR 单语 contract 保持不变。

### 自动化与视觉证据

- Docker Web lint、typecheck、256/256 unit tests 与 production image build 通过。
- Docker Chromium `brand-identity.spec.ts`：3/3 通过；`auth-login.spec.ts` + `dashboard.spec.ts`：5/5 通过。
- focused E2E 断言 full wordmark 加载 approved alpha contour、compact mode 不使用错误 mask、on-light 不被 dark
  Shell 请求，并继续覆盖同源请求、geometry、locale/theme、SSR、navigation、a11y、CLS 与 clock render boundary。
- 10 张最终 PNG 与 `brand-exit-evidence.json` 保存在
  `/Volumes/xfl/logistics/stripSystem/test-results/web-brand-03/`；已按原始分辨率检查 320/390/768/1366/1920/2560、
  light/dark/system、en/zh-CN 与 125%/200% zoom，透明区域均直接露出 dock-steel，无黑色矩形、裁切、重叠或拉伸。
- `scripts/healthcheck.sh` 与 `git diff --check` 通过。

已知限制：供应资源仍无 192/512px 或 vector master；该 PWA 范围保持既有 out-of-scope，不影响本任务 Done。
