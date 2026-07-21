# Bestar Agent Handoff

> 新会话必须先读 `AGENTS.md` 和本文件，再核对当前 Task、任务索引、完成度报告与 `git status`。本文件用于交接，不替代验收证据。

## 交接元数据

- Generated at: `2026-07-21T05:41:21Z`
- Source: `direct-codex-session`
- Task: `WEB-BRAND-04`
- Task file: `prompts/tasks/WEB-BRAND-04Transparent Shell Wordmark Background Regression.md`
- Status: `DONE`
- Execution mode: `full`
- Session: `current interactive session`
- Git HEAD: `739b1f8`
- Worktree: dirty with the complete WEB-BRAND-04 change set; preserve and inspect it

## 现在在做什么

WEB-BRAND-04 已完成。页面左上角 full wordmark 的黑色矩形底块已去除，代码、Docker 自动化、Chromium
视觉矩阵、权威任务文档和完成度报告均已同步；本 Task 没有剩余实现或验证。

## 已完成

- 确认根因是 `wordmark-on-dark.png` 自身的近乎不透明黑色 matte，不是 Office Shell 额外设置了背景色。
- 保留 on-dark 蓝色 symbol、白色 BESTAR 与 228x50 geometry，仅使用同尺寸 approved dimensional alternate 的
  真实透明 alpha contour 去底；未重绘、改色或引入外部资产。
- 359px 以下显式取消 full-wordmark mask，继续使用原生透明 64x64 compact mark。
- 增加静态和真实浏览器回归，覆盖 mask、compact reset、asset request、geometry、locale/theme、SSR、navigation、
  a11y、CLS 与 operational clock render boundary。
- 没有新增或修改可见文案、alt、aria、title 或 tooltip；typed `en` / `zh-CN` i18n contract 保持不变。
- 产品规范、Task Index、项目完成度报告和 WEB-BRAND-04 Task 已同步为 Done。

### Changed files

- `HANDOFF.md`
- `apps/web/e2e/brand-identity.spec.ts`
- `apps/web/src/app/globals.css`
- `apps/web/src/components/brand/brand-logo.tsx`
- `apps/web/tests/brand-assets.test.ts`
- `docs/product/05-web-corporate-brand-assets.md`
- `docs/reports/project-completion-status.html`
- `prompts/tasks/OPEN-FUNCTIONS-20260707Task Index.md`
- `prompts/tasks/WEB-BRAND-04Transparent Shell Wordmark Background Regression.md`

### Tests and verification actually run

- `docker compose -f infra/docker/compose.local.yml up -d --build web nginx`：通过，包含 production Web image build
- Docker Web lint：通过
- Docker Web typecheck：通过
- Docker Web unit tests：256/256 通过
- Docker Chromium `brand-identity.spec.ts --project=chromium`：3/3 通过
- Docker Chromium `auth-login.spec.ts dashboard.spec.ts --project=chromium`：5/5 通过
- `scripts/healthcheck.sh`：通过
- `git diff --check`：通过
- `brand-exit-evidence.json`：10 screenshots、10 geometry，browser/page/network/external image errors 均为 0
- `test-results/web-brand-03/` 的 10 张最终 PNG 已逐张按原始分辨率检查；320/390/768/1366/1920/2560、
  light/dark/system、en/zh-CN 与 125%/200% zoom 均无黑色矩形、裁切、重叠或拉伸

## 卡在哪里

### Remaining implementation

- None.

### External verification

- None for WEB-BRAND-04.

### Blockers

- None.

## 下一步

- 审阅并保留当前 WEB-BRAND-04 diff；本品牌线路没有下一项开发 Task，不要重跑 WEB-BRAND-01/02/03/04。
- 其他既有 parser、真实 workbook、打印、设备和目标主机外部门禁继续按 Task Index 独立处理，不受本次改动影响。

## 不要再踩的坑

- `wordmark-on-dark.png` 是 RGBA 但并非透明底；不要因为有 alpha channel 就假设其背景透明。
- `wordmark-dimensional.png` 只能提供匹配的 alpha contour，不得把其灰黑色像素作为 Shell 企业字标显示。
- 320px compact mark 已有真实透明 alpha；不得对其应用 228x50 full-wordmark mask。
- Web 与 E2E 镜像会烘焙源码；相关源码或 spec 改动后必须重建对应镜像。
- Playwright 后续套件会清理默认 `test-results`；需要保留品牌证据时应最后运行 brand suite。
- 不得在缺少 approved master 时伪造或宣称完成 192/512 PWA icon，也不得把本 Task 扩展到 Native、Excel/PDF 或 label。

## 新会话启动清单

1. Read `AGENTS.md` and `.codex/skills/bestar-handoff/SKILL.md`.
2. Run `git status --short`; preserve all existing changes.
3. Read the Task file above plus `prompts/tasks/OPEN-FUNCTIONS-20260707Task Index.md` and `docs/reports/project-completion-status.html`.
4. Verify this handoff against code, tests, runtime state, and artifacts before acting.
5. Do not execute any Task marked `Task-Status: ARCHIVED`.

## 权威参考

- `prompts/tasks/WEB-BRAND-04Transparent Shell Wordmark Background Regression.md`
- `docs/product/05-web-corporate-brand-assets.md`
- `prompts/tasks/OPEN-FUNCTIONS-20260707Task Index.md`
- `docs/reports/project-completion-status.html`
- `test-results/web-brand-03/brand-exit-evidence.json`
