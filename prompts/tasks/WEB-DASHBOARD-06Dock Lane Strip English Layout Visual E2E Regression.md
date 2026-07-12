# 执行 WEB-DASHBOARD-06：Dock Lane Strip English Layout Visual E2E Regression

## 优先级

- P0 现场 UI 回归，立即执行。
- 本任务是 `WEB-DASHBOARD-05Bilingual Typography and Layout Regression.md` 的阻塞修复；本任务未通过前，
  `WEB-DASHBOARD-05` 不得标记完成。

## 现场问题

Dashboard 页面切换为 English 后，`Dock lane strip` 中各生命周期 lane 仍然发生错位。英文
`Report generated`、`Labels generated`、`Loading in progress`、`Delivered to destination` 等标签比中文长，
当前布局不能稳定保持 lane 标题、数量、进度条和比例文本对齐。

Dashboard 上以 `Dock lane strip` 命名的区域实际由 `LifecycleDockStrip` 渲染。不要只修改当前首页未使用的
`DockLaneStrip` 后就宣称问题已解决。

## 必须读取与使用

- `AGENTS.md`、`CONTEXT.md`
- `prompts/agents/business-logic-agent.md`
- `WEB-DASHBOARD-00Back Office Visual Direction.md`
- `WEB-DASHBOARD-05Bilingual Typography and Layout Regression.md`
- `.codex/skills/frontend-design/SKILL.md`
- `.codex/skills/nextjs-pwa-ui/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- `apps/web/src/app/page.tsx`
- `apps/web/src/app/globals.css`
- `apps/web/src/components/dashboard/dashboard-components.tsx`
- `apps/web/src/components/dashboard/operations-dashboard-flow.ts`
- `apps/web/src/lib/i18n/locales/en.ts`
- `apps/web/src/lib/i18n/locales/zh.ts`
- `apps/web/tests/dashboard-components.test.ts`
- `apps/web/e2e/dashboard.spec.ts`
- `apps/web/playwright.config.ts`
- `apps/web/package.json`
- `infra/docker/compose.local.yml`
- `docs/runbooks/local-deployment.md`

## 执行约束

1. 使用最新 business-agent profile，通过 `scripts/run-business-agent.sh` 新建会话执行；不要恢复旧权限会话。
2. Web build、lint、typecheck、unit 和 Playwright 必须在 Docker 中运行；禁止在宿主机直接运行 `pnpm`、
   `npm`、`npx`、Next.js 或 Playwright。
3. 开始修改前列出预计修改文件、验收标准和测试命令。
4. 不修改 container lifecycle 的 API code、顺序、数量、href 或业务状态语义。
5. 不引入 mock business data 冒充真实 Dashboard 数据；E2E 登录真实本地 API，并消费真实
   `/api/dashboard/operations` 响应。

## 复现与根因确认

1. 用 Docker Compose 重建 full stack，通过 nginx `http://127.0.0.1/` 打开 Dashboard。
2. 使用具备 Dashboard 生命周期读取权限的真实本地 E2E/测试账号登录；凭据只通过环境变量传入，不写入
   task、截图、日志或报告。
3. 通过页面语言按钮切换为 English，刷新后确认 `<html lang="en">` 且仍保持 English。
4. 至少在 1366x768、1920x1080、768x1024、390x844 查看 light/dark。
5. 修复前保存可复现错位的截图，并记录具体错位对象和 viewport；不能只根据源码猜测根因。
6. 检查 `LifecycleDockStrip` 当前 `grid-flow-col` / `auto-cols-fr`、lane 最小宽度、header flex、长 label
   换行和固定间距之间的实际关系，确认是轨道宽度、行高、flex 收缩、内容溢出还是多项共同导致。

## 修复要求

1. 七个 lifecycle lanes 在同一 strip 内保持一致的顶部、底部和内容行结构；序号、数量、标题、进度条和
   `count/total` 不因英文标签行数不同而上下漂移。
2. 为 lane 使用可解释的 responsive track/minimum width 和稳定 row layout。窄屏允许 strip 自身横向滚动，
   但不得让整个页面横向溢出。
3. 英文标签允许自然换行并完整显示。禁止通过以下方式伪修复：
   - 缩短或改错业务翻译；
   - 显示 raw enum/code；
   - `scaleX`、`font-stretch`、负 letter-spacing；
   - 把字体缩小到不可读；
   - `overflow-hidden`、固定高度或 ellipsis 静默裁剪普通 UI 标签；
   - 绝对定位覆盖相邻内容。
4. count pill 不得压缩或覆盖 label；progress bar 和比例文本必须始终位于所属 lane 内。
5. lane 内容可因 200% zoom 增高，但所有 lanes 仍保持一致的 row alignment，不覆盖下方内容。
6. 保留 lane link 的完整点击区域、hover、focus-visible、Enter 导航和现有 aria-label 语义。
7. 如 E2E 需要稳定定位，可增加不显示在 UI 中的 `data-testid` / `data-lane-code`；不得显示技术 code。
8. 修改范围优先限制在 Dashboard shared component、相关 CSS 和测试；不要借机重做其他 Dashboard section。

## i18n 硬门禁

1. `Uploaded`、`Parsed`、`Report generated`、`Labels generated`、`Unloaded`、`Loading in progress`、
   `Delivered to destination` 必须继续通过现有 typed translator/status helper 生成。
2. 不允许为适配布局而只修改 English 或只修改中文；任何新增/修改的可见文案、title、aria-label、tooltip
   必须同步 `en` / `zh-CN` catalog，并通过 catalog parity。
3. English 页面只能显示 English，中文页面只能显示中文；不得出现双语标签、raw `labelKey`、raw enum。
4. 语言切换和刷新不能闪现另一语言，不能恢复 DOM translator 或 MutationObserver 翻译路径。
5. E2E 必须断言最长英文标签完整可见，并切换回中文确认布局和单语显示未回归。

## Docker Playwright 运行能力

当前 production `web` 容器不应为了测试被永久加入 Chromium 系统依赖。若仓库尚无可重复的 Docker
Playwright 入口，本任务需要新增 profile-gated `web-e2e` Compose service 或等价的专用测试容器：

- Playwright container/browser 版本必须与 `@playwright/test` 锁定版本兼容；
- 通过 Compose 网络访问 `http://nginx` 或等价 full-stack 地址；
- E2E credentials 只从环境变量读取；
- `test-results`、截图和 Playwright report 必须可从宿主工作区查看；
- 不在宿主创建第二套 `node_modules`，不修改 production web image 的运行时职责；
- 将可重复执行命令写入 `docs/runbooks/local-deployment.md`。

## 强制 E2E 视觉浏览门禁

修复完成后必须使用真实 Chromium 页面执行视觉验证，不能只跑 render/unit tests。

### 浏览矩阵

- English：390x844、768x1024、1366x768、1920x1080，light 和 dark。
- 中文回归：同样四个 viewport，light 和 dark。
- English 1366x768 至少增加浏览器 125% 和 200% zoom；必须使用真实浏览器 zoom/viewport 行为，
  不得用 CSS transform 冒充。
- 390/768 宽度需要水平滚动 strip 到最后一个 lane，再截图验证
  `Delivered to destination` 完整可见。

### 自动几何断言

Playwright 至少验证：

1. 所有 lane 的 top/bottom 边界一致，或在 1px 抗锯齿容差内一致。
2. label、count pill、progress bar、ratio 的 bounding boxes 均位于所属 lane 内。
3. label 与 count pill 不相交；相邻 lane 内容不相交。
4. 所有 progress bars 在同一视觉行对齐；所有 ratio 文本在同一视觉行对齐。
5. label 没有 `scrollWidth > clientWidth` 或 `scrollHeight > clientHeight` 导致的静默裁剪。
6. desktop 不出现 strip 非预期 overflow；mobile/tablet 只允许 `.lifecycle-dock-strip` 内部滚动，
   `documentElement.scrollWidth` 不得超过 viewport 容差。
7. console error、pageerror、hydration mismatch 为 0。
8. locale 切换、refresh、light/dark 切换后上述断言仍通过。

### 截图与人工视觉检查

1. 保存每个矩阵组合的 Dock Lane Strip panel 截图，关键 viewport 同时保存 full-page 截图。
2. 截图文件名必须包含 locale、theme、viewport 和 zoom。
3. Agent 必须用图片查看工具或 Playwright report 以原始分辨率逐张浏览截图。只生成截图但不查看，不算验收。
4. 最终报告列出截图路径，并逐项记录：lane 等高、标题完整、count 不覆盖、bar/ratio 对齐、页面无溢出。
5. 任意截图或几何断言失败时继续修复并重跑全矩阵；不得把失败截图作为“已验证”证据。

## 自动化与命令

所有 Node/Web 命令通过 Docker Compose 执行。按最终实现提供等价的可复制命令，至少包含：

```bash
docker compose -f infra/docker/compose.local.yml up -d --build
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web lint
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web typecheck
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web test
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web build
docker compose -f infra/docker/compose.local.yml --profile e2e run --rm web-e2e pnpm --filter web test:e2e -- dashboard.spec.ts --project=chromium
scripts/healthcheck.sh
git diff --check
```

如专用 service 使用不同名称，可调整命令，但不得退回宿主 `pnpm`。除 focused spec 外，还要运行现有
dashboard locale/theme smoke，确保不是只让新增测试通过。

## 验收标准

1. English 下七个 lifecycle lanes 在全部指定 viewport/theme 中无错位、重叠、裁剪或错误基线。
2. `Delivered to destination` 等最长标签完整可读，count、bar、ratio 对齐稳定。
3. 125%/200% zoom 不覆盖相邻内容；窄屏只在 strip 内滚动且页面无横向溢出。
4. 中文布局、light/dark、lane link/focus 和现有 Dashboard 行为不回归。
5. i18n catalog parity、单语显示、语言切换和 refresh 均通过。
6. Docker lint、typecheck、unit、build、focused Playwright、现有 Dashboard E2E、healthcheck 和
   `git diff --check` 全部通过。
7. 最终交付包含实际浏览过的截图路径、几何断言结果和 viewport/theme/locale 矩阵，不接受“环境原因未跑”。

## 不得关闭任务的情况

- 只修改 CSS/组件但未启动真实浏览器。
- 只运行 unit/render test。
- 只检查中文或单一 desktop viewport。
- 截图已生成但 Agent 未逐张查看。
- Playwright 因 Docker/browser 环境缺失而跳过。
- 通过缩短英文翻译、隐藏 overflow 或显示 raw code 避开错位。
- E2E、截图、console 或几何断言仍有失败。

## 完成输出

1. 根因及修复方式。
2. 修改文件列表。
3. Docker 测试命令和结果。
4. E2E 矩阵结果与截图绝对路径。
5. 人工视觉浏览结论。
6. i18n 检查结果。
7. 已知限制；没有则明确写“无已知 Dock Lane Strip 布局限制”。
8. 更新本任务索引和 `docs/reports/project-completion-status.html`；只有全部门禁通过后才标记 Done。
