执行 WEB-DASHBOARD-02：Shell Visual System Redesign。

必须读取：
- AGENTS.md
- prompts/agents/business-logic-agent.md
- prompts/tasks/WEB-DASHBOARD-00Back Office Visual Direction.md
- prompts/tasks/WEB-DASHBOARD-01Operations Dashboard Data API.md
- .codex/skills/frontend-design/SKILL.md
- .codex/skills/nextjs-pwa-ui/SKILL.md
- .codex/skills/bestar-domain/SKILL.md
- apps/web/package.json
- apps/web/src/app/layout.tsx
- apps/web/src/app/globals.css
- apps/web/src/components/layout/office-shell.tsx
- apps/web/src/components/layout/office-navigation.tsx
- apps/web/src/components/i18n/
- apps/web/src/lib/i18n/
- apps/web/src/lib/permissions.ts

前置任务：
- WEB-DASHBOARD-00
- WEB-DASHBOARD-01

目标：
重塑后台整体风格和布局，让系统从简单顶部导航变为“办公室运营中控台”框架。该任务只做全局 Shell、视觉 tokens 和可复用展示组件，不实现 dashboard 业务页面。

范围：
1. 全局 CSS tokens：
   - 按 WEB-DASHBOARD-00 增加颜色、字体、状态色、分隔线 token。
   - 保留 Tailwind 使用方式，不引入 CSS-in-JS。
   - 不破坏现有页面的表格、表单、按钮可读性。
2. OfficeShell：
   - Desktop：左侧紧凑 nav rail + 顶部 operational bar。
   - Mobile：保持可用的顶部/横向导航，不能让 nav 挡住内容。
   - 顶部 bar 显示：
     - current operational date/timezone
     - API/database health compact status if cheap or passed from page
     - current user
     - role labels
     - language switcher
     - logout/sign in
3. Navigation：
   - 保持现有权限过滤。
   - 当前 route 要有明显 active state。
   - nav label 全部走 i18n。
   - 不显示用户无权限入口。
4. Reusable components：
   - `DashboardPanel`
   - `MetricTile`
   - `StatusPill`
   - `ProgressBar`
   - `DockLaneStrip` shell-only/static props component
   - `PressureBar`
   - `ExceptionList`
   - 这些组件可以放在 `apps/web/src/components/dashboard/`。
5. Accessibility：
   - 所有可点击 metric 必须是 link 或 button。
   - focus ring 清楚。
   - 状态不能只靠颜色表达。
   - reduced-motion 下禁用不必要动画。

I18n 强制要求：
1. Shell / nav / topbar 新增的所有 visible text 都必须进入 i18n catalog：
   - `apps/web/src/lib/i18n/locales/en.ts`
   - `apps/web/src/lib/i18n/locales/zh.ts`
   - dynamic catalog if the copy contains variables.
2. 覆盖范围包括：
   - nav label
   - active route aria-current/aria-label
   - topbar API/database health labels
   - timezone/date labels
   - user/role labels
   - sign in/logout related labels if touched
   - tooltips/title/aria-label/placeholder
   - permission/empty/error messages introduced by Shell
3. Shell 不允许：
   - 在 JSX 中硬编码中文 UI 文案。
   - 在 JSX 中硬编码只给用户看的英文长句。
   - 通过字符串拼接生成中英文混排句子。
   - 显示 `中文 (ENUM)` 或 `English / 中文` 形式的状态。
4. Status / role / permission display 必须使用统一 mapping：
   - status 走 locale-aware status helper。
   - permission/role description 走 catalog，不直接显示 API description。
   - raw role code 可以保留在审计 title 中，但普通可见 label 要本地化。
5. `apps/web/tests/i18n.test.ts` 必须覆盖新增 Shell 文件和 dashboard components。

视觉要求：
1. 使用 WEB-DASHBOARD-00 的 Manifest Control Room 方向。
2. Dock Lane Strip 是唯一主要视觉风险点，其余界面保持安静、密集、工作导向。
3. 不使用：
   - 渐变球
   - bokeh
   - marketing hero
   - 卡片套卡片
   - 大面积深色背景
4. 字体：
   - section title / key metric 可用 condensed stack。
   - container number / SHA / enum 使用 mono stack。
5. 页面宽度：
   - 保留宽屏运营工具能力，避免强行窄版。
   - 表格和 dashboard 在 1440/1920 宽屏应能有效利用空间。

迁移约束：
1. 不重写所有业务页面。
2. 现有页面在新 shell 下必须仍可用。
3. 不改变 API client、业务权限、状态语义。
4. 不引入图表库；dashboard 图形组件用 CSS/SVG 实现即可。
5. 如需新增 icon 依赖，必须说明必要性；默认不新增依赖。

验收标准：
1. `OfficeShell` 在 desktop 显示 nav rail + operational bar。
2. mobile 下导航不遮挡正文，所有入口可访问。
3. 当前 route active state 可见。
4. 所有 nav/user/topbar 文案可中英文切换，不出现双语同时显示。
5. `pnpm --filter web test -- i18n` 对新增 Shell/dashboard component 无 unmanaged UI strings。
6. 现有核心页面仍能渲染：
   - `/`
   - `/imports`
   - `/containers`
   - `/load-jobs`
   - `/reports`
   - `/reports/inventory`
   - `/work-hours`
   - `/unloading-wage`
   - `/unloading-summary`
7. 新组件有 focused unit tests 或 render helper tests，至少覆盖 class/label/role 输出。
8. `pnpm --filter web build` 通过。

测试命令：
pnpm --filter web lint
pnpm --filter web typecheck
pnpm --filter web test
pnpm --filter web test -- i18n
pnpm --filter web build

手工验证：
1. Docker full-stack 下登录 ADMIN。
2. 在 desktop 宽度检查 nav rail、topbar、当前路由 active。
3. 在 mobile 宽度检查导航可用、文本不重叠。
4. 切换 English / 中文，确认 shell 和 nav 不出现双语混排。

完成输出：
1. changed files
2. tests run
3. desktop/mobile screenshots or clear manual verification notes
4. known limitations
5. next recommended task：WEB-DASHBOARD-03
