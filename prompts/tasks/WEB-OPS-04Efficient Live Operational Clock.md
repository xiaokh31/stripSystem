# 执行 WEB-OPS-04：Efficient Live Operational Clock

## 优先级与前置任务

- 优先级：P1 页眉可用性与性能优化。
- 前置任务：`WEB-OPS-01Wide 2048 Office Workspace.md`。
- 后续任务：`WEB-OPS-05I18n Visual and Performance Exit Gate.md`。

## 必须读取与使用

- `AGENTS.md`、`CONTEXT.md`
- `prompts/agents/business-logic-agent.md`
- `.codex/skills/nextjs-pwa-ui/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- `apps/web/src/components/layout/office-shell.tsx`
- `apps/web/src/lib/date-time.ts` 及 tests
- i18n provider/catalog/server locale contract
- Office Shell、theme、locale、hydration 和 Playwright tests
- Docker Web/E2E configuration

## 已确认现状与评估结论

1. 页眉 `Operational time` 当前在 Server Component render 时执行一次 `formatOperationalDateTime(new Date())`，
   页面保持打开后不会刷新。
2. 当前格式包含秒，因此产品决定保留秒级显示并在可见 desktop header 中每秒刷新。
3. 单个隔离 clock leaf 每秒一次 state update 的 CPU 和固定内存成本很小；真正风险是让整个 OfficeShell 重渲染、
   每 tick 重建 `Intl.DateTimeFormat`、重复 timer/listener、route 切换后未清理，以及在隐藏 tab/不可见 mobile header
   中继续无意义运行。
4. 本任务必须用程序化测试和 Chromium 测量验证上述判断，不能只写“影响不大”。

## 产品与技术决定

1. 动态时间只做浏览器本地显示，不增加每秒/每分钟 API polling；业务记录时间仍以后端数据库为准。
2. 使用固定 `America/Edmonton` operational timezone 和动态 DST；浏览器系统时间只是显示时钟来源。
3. 保留 Server Component OfficeShell，把动态部分拆成最小 Client Component，例如 `OperationalClock`。
4. 首个 HTML 使用服务端生成的初始 ISO/epoch 值；Client 首次 render 必须与 SSR 一致，mount 后才开始更新。
5. 可见且达到当前 header 显示 breakpoint 时每秒对齐真实 `Date.now()` 更新；tab hidden、页面不可见或 clock
   因 viewport 隐藏时暂停，恢复时立即校时。
6. module-level 缓存/复用 `Intl.DateTimeFormat`，不在每秒 tick 创建 formatter。
7. 使用可清理的 self-correcting timeout 或等价单 timer；React Strict Mode、route navigation、locale/theme
   切换不得形成重复 timer。

## 实现要求

1. Client clock 只更新 `<time>` 和必要的最小 wrapper，不把 current time state 提升到 OfficeShell/header 根节点。
2. 每次 tick 从当前时间重新计算，不用 `previous + 1000` 累积漂移；恢复可见时立即显示正确秒数。
3. 监听 `visibilitychange` 和 breakpoint/element visibility 时必须成对 cleanup；unmount 后无 callback、listener 或 state update。
4. 不使用 `setInterval` 泄漏、`requestAnimationFrame` 60fps 时钟、全局 singleton 未引用计数、DOM MutationObserver
   或强制整页刷新。
5. 不通过 `suppressHydrationWarning` 隐藏设计错误；跨秒 hydration 由 initial server value contract 解决。
6. timezone label 与 clock 格式保持现有数据展示语义；DST 切换、无效日期和配置 fallback tests 保留。
7. `<time dateTime="...">` 提供 machine-readable value。不要给每秒变化的文本设置 assertive/polite `aria-live`，
   避免屏幕阅读器每秒播报；静态 label 继续本地化。
8. clock 不触发 health、Dashboard、session、locale、theme 或任何业务 API 请求。

## 性能与内存验证方案

1. 新增 fake-timer unit tests：可见 desktop 恰好一个 timer；60 ticks 只更新 clock leaf；hidden/narrow 时停止；
   visible/wide 恢复立即校时；unmount 后 timer/listener 为 0。
2. 记录 formatter 构造/复用行为，证明不是每 tick 新建 `Intl.DateTimeFormat`。
3. 在 Docker Chromium 中使用 CDP Performance/Heap 指标或等价可重复方法，对静态基线和动态实现分别采样。
4. 至少运行两个连续 60 秒窗口；在可用时先触发 GC，再比较 retained JS heap、timer/listener 数和 clock render count。
   不设置易受环境影响的绝对 MB 门槛，但不得出现随窗口单调增长、timer 数递增或 whole-shell commit 每秒发生。
5. 验证 tab hidden 和 390/768 viewport 时 60 秒内没有持续 clock tick；重新显示后只有一个 timer 恢复。
6. 在 `docs/reports/` 写简洁评估，记录测量方法、结果、固定内存对象、CPU/render 频率和限制，不提交超长 trace。

## i18n 硬门禁

1. `Operational time`、timezone label、任何错误/辅助/aria/title 文案继续通过 typed en/zh-CN catalog。
2. 时间数字、日期、`MDT` / `MST` 属于业务数据，可使用 data formatting contract；不得把英文 UI 句子放进
   `data-i18n-ignore` 绕过 catalog。
3. locale 切换不能创建第二个 timer，不能让中英文同时显示，也不能造成 SSR/hydration 英文闪现。
4. English/中文使用同一时钟来源和更新频率；不因 locale 改变业务 timezone。
5. catalog parity、explicit translator 和 no-flash tests 必须继续通过。

## 明确非目标

- 不新增服务器时间同步 API、WebSocket、SSE 或 background worker。
- 不改变后端审计/业务时间戳。
- 不把 clock 扩展为倒计时、排班、天气或营销信息。
- 不在不可见 mobile header 中为了测试而强制显示运营时间。

## 验收标准

1. desktop 可见页眉的秒数连续动态变化，timezone/DST 正确；页面刷新后首帧无 hydration mismatch。
2. 整个 OfficeShell、导航、用户菜单和 health status 不随秒重渲染；无业务 API polling。
3. hidden tab、不可见 breakpoint 和 unmount 时 timer 停止并完全清理；恢复后时间立即正确且只有一个 timer。
4. 连续测量没有 timer/listener/retained state 单调增长，内存占用保持固定量级。
5. locale/theme/route 切换后仍只有当前语言和一个 clock instance。
6. Web lint、typecheck、unit、build、Docker Playwright、performance report、healthcheck、`git diff --check` 通过。

## 必须执行的测试

```bash
docker compose -f infra/docker/compose.local.yml up -d --build web nginx
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web lint
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web typecheck
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web test
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web build
docker compose -f infra/docker/compose.local.yml --profile e2e run --rm e2e-web web-ops-clock.spec.ts --project=chromium
scripts/healthcheck.sh
git diff --check
```

## 完成输出

- 先给出性能/内存评估结论，再列实现结构。
- 列出 timer 生命周期、render 边界、formatter cache、hidden/narrow pause 证据。
- 列出 CDP/heap 测量摘要、双语/主题/route E2E 和已知限制。
- 更新任务索引、完成度报告和性能评估文档。
