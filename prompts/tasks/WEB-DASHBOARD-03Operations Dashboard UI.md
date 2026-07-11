执行 WEB-DASHBOARD-03：Operations Dashboard UI。

必须读取：
- AGENTS.md
- prompts/agents/business-logic-agent.md
- prompts/tasks/WEB-DASHBOARD-00Back Office Visual Direction.md
- prompts/tasks/WEB-DASHBOARD-01Operations Dashboard Data API.md
- prompts/tasks/WEB-DASHBOARD-02Shell Visual System Redesign.md
- .codex/skills/frontend-design/SKILL.md
- .codex/skills/nextjs-pwa-ui/SKILL.md
- .codex/skills/bestar-domain/SKILL.md
- apps/web/package.json
- apps/web/src/app/page.tsx
- apps/web/src/components/dashboard/
- apps/web/src/lib/api-client.ts
- apps/web/src/lib/permissions.ts
- apps/web/src/lib/i18n/

前置任务：
- WEB-DASHBOARD-00
- WEB-DASHBOARD-01
- WEB-DASHBOARD-02

目标：
用真实运营数据重做 `/` dashboard，让它成为办公室后台的默认工作台，而不是 API health 静态页。

页面结构：
1. Ops Header：
   - 页面标题：Operations dashboard / 运营中控台
   - 当前 range filter：today / 7 days / 30 days
   - 当前 month selector：用于月度拆柜汇总和工资摘要
   - API/database health compact display
2. Work Queue Strip：
   - 一组可点击 action metrics。
   - 每项显示 count、label、severity、目标页面链接。
   - count 为 0 时显示稳定空状态，不隐藏整个区域。
3. Dock Lane Strip：
   - 根据 `containerLifecycle.stages` 渲染状态流转带。
   - 每个 stage 可点击进入对应筛选页或相关页面。
   - `UNLOADED` / `LOADING_IN_PROGRESS` / `LOADED` 显示必须使用 locale-aware status label。
   - `LOADED` 中文仍为 `已送库`。
4. Inventory Pressure：
   - total / loaded / remaining pallets
   - top destinations by remaining pallets
   - pressure bars with visible numbers
   - 无 `inventory.read` 时显示 permission-aware unavailable panel，而不是假数据。
5. Active Load Jobs：
   - open / in-progress / due today counts
   - active jobs progress list
   - 每个 job 链接到 `/load-jobs/[id]` 或现有详情页；如果详情页不存在，链接到 `/load-jobs` 并带 query/filter。
6. Exceptions / Review：
   - parser failures
   - missing destination/cartons/volume warnings
   - zero volume with cartons
   - failed generated files / failed jobs
   - missing unloading completion date
   - monthly summary review warnings
7. Role-aware workflow panels：
   - HR_MANAGER：work-hours queue
   - WAREHOUSE_MANAGER：unloading wage / monthly summary queue
   - WAREHOUSE：mobile scan / load jobs queue
   - OFFICE：imports / containers / reports queue
   - ADMIN：system/account/settings shortcuts
8. Recent Activity：
   - latest imports
   - latest containers
   - latest generated files
   - latest corrections/load jobs

交互：
1. 所有数字卡片必须可点击或提供明确 open action。
2. Filters 使用 URL query params，不只存在 React state。
3. Refresh 使用 server re-fetch，不用假 optimistic 数字。
4. API error 显示明确错误 panel。
5. Dashboard data loading failure 不应让整页白屏；health 和可访问快捷入口仍可显示。

文案要求：
1. 所有新增文案进入 i18n catalog。
2. 不可见双语同时显示。
3. API `labelKey` 必须在 Web 层映射为当前 locale 文案，不得直接显示 key。
4. Empty states 给下一步：
   - “No imports need parsing” / “没有待解析导入”
   - “Open imports” / “打开导入列表”
5. Error states 给原因和目标页面，不要只显示 “failed”。

I18n 强制要求：
1. Dashboard 页面和 `apps/web/src/components/dashboard/` 新增组件不得包含 unmanaged visible UI strings。
2. 必须补齐：
   - `locales/en.ts`
   - `locales/zh.ts`
   - dynamic catalog / translator entries for parameterized strings
   - status-label mappings if新增 dashboard 使用了新的 status/business label
3. 必须本地化的字段包括：
   - dashboard title/subtitle
   - range/month filters
   - section headings
   - metric labels
   - `labelKey` 对应文案
   - severity labels
   - chart/lane labels
   - destination pressure captions
   - active load job captions
   - exception labels
   - recent activity kind labels
   - permission unavailable messages
   - empty/error/loading/success text
   - button/link text
   - aria-label/title/placeholder
4. Dynamic text 规则：
   - count/month/range/status 句子必须用参数化翻译。
   - 不要把 “3” + “items” + “pending” 这类片段拼成句子。
   - 不要在中文 locale 下保留英文 UI fallback，除非是 raw source data。
5. Status 文案：
   - container status 使用 `containerStatusLabel` / business status helper。
   - pallet/load scan status 使用 pallet/load-job 对应 helper。
   - 不允许把 container `LOADED` 显示成 `已拆完`。
6. 允许保持 raw 的内容：
   - container number
   - load number
   - destination code
   - employee/worker/user display name
   - import filename
   - SHA-256
   - API enum in non-visible audit title/debug context

可视化要求：
1. 不新增重型 chart library。
2. 用 CSS/SVG 绘制：
   - Dock Lane Strip
   - progress bars
   - destination pressure bars
3. 每个可视化都必须有文本数字。
4. 不使用颜色作为唯一含义。
5. Responsive：
   - 1920 desktop：使用 2-3 列信息区，减少空白。
   - 1366 desktop：首屏显示 Work Queue + Dock Lane + 部分 inventory/load jobs。
   - mobile：单列堆叠，表格横向滚动或转换为简洁列表。

不做：
1. 不改变实际业务状态。
2. 不在前端计算 remaining inventory。
3. 不伪造近期活动。
4. 不做独立 landing page。
5. 不把 dashboard 做成一堆静态卡片。

验收标准：
1. `/` 从当前静态 health page 改为真实 dashboard。
2. Dashboard 调用 `GET /api/dashboard/operations`。
3. ADMIN 可见完整 dashboard。
4. OFFICE / WAREHOUSE / HR_MANAGER / WAREHOUSE_MANAGER 只看到自己有权限的数据 sections。
5. 无数据时显示有行动指引的 empty state。
6. API 错误时显示明确错误，不白屏。
7. 所有 visible 文案可中英文切换。
8. 不出现中英文同时显示的状态文本。
9. Dock Lane Strip 显示真实 lifecycle counts。
10. Inventory pressure 的 remaining pallets 来自 API response。
11. `apps/web/tests/i18n.test.ts` 覆盖 dashboard page/components，新增文案无 unmanaged UI strings。
12. locale switch smoke 覆盖 `/` dashboard，English -> 中文 -> refresh -> English 均正确。

测试命令：
pnpm --filter web lint
pnpm --filter web typecheck
pnpm --filter web test -- dashboard i18n
pnpm --filter web build

建议 Playwright smoke：
pnpm --filter web exec playwright test e2e/dashboard.spec.ts

手工验证：
1. Docker full-stack 登录 ADMIN 打开 `/`。
2. 确认 dashboard 有真实数字、lane strip、inventory pressure、load jobs、exceptions。
3. 切换 OFFICE / WAREHOUSE / HR_MANAGER / WAREHOUSE_MANAGER 账号，确认权限裁剪。
4. 切换中英文，确认状态、按钮、empty/error 文案跟随语言。
5. 用 mobile viewport 检查无文本重叠。

完成输出：
1. changed files
2. tests run
3. dashboard visible sections by role
4. known limitations
5. next recommended task：WEB-DASHBOARD-04
