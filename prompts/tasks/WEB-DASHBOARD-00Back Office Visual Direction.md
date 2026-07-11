执行 WEB-DASHBOARD-00：Back Office Visual Direction。

本任务是设计 brief，不实现 API、数据库、页面代码或业务行为。后续
WEB-DASHBOARD-01 至 WEB-DASHBOARD-04 必须先读取本文件。

必须读取：
- AGENTS.md
- docs/product/00-business-context.md
- docs/runbooks/local-deployment.md
- .codex/skills/nextjs-pwa-ui/SKILL.md
- .codex/skills/bestar-domain/SKILL.md
- .codex/skills/frontend-design/SKILL.md（如果该 skill 存在）
- apps/web/package.json
- apps/web/src/app/layout.tsx
- apps/web/src/app/page.tsx
- apps/web/src/components/layout/office-shell.tsx
- apps/web/src/components/layout/office-navigation.tsx
- apps/web/src/lib/i18n/catalog.ts
- apps/web/src/lib/i18n/locales/en.ts
- apps/web/src/lib/i18n/locales/zh.ts
- apps/web/src/lib/i18n/status-labels.ts
- apps/web/src/lib/api-client.ts

## Subject

后台体验升级的主题是 Manifest Control Room。

它不是营销首页，也不是通用 SaaS dashboard。它是办公室和仓库主管在
PC 浏览器上反复查看的运营中控台，用来回答：

1. 哪些柜子、导入、生成任务、工资/月结和装车任务需要处理。
2. 哪些月台和装车任务正在推进。
3. 哪些目的仓或托盘库存形成压力。
4. 哪些异常会阻塞卸柜、面单、装车或月结。
5. 最近谁做了哪些关键操作，是否可追溯。

移动扫码仍只服务扫码现场；Back Office dashboard 默认按 PC 浏览器设计，
应利用横向空间，不把主要信息挤进窄容器。

## Visual Direction

名称：Manifest Control Room。

设计关键词：
- operational
- dense but calm
- manifest ledger
- dock control strip
- audit-readable
- bilingual-safe

视觉风险只花在一个地方：Dock Lane Strip。它用横向月台/柜号/装车进度条
表达现场流动，成为首页第一眼识别点。其他区域保持克制、清晰、表格式。

不得使用：
- marketing hero
- gradient orb / bokeh / decorative blobs
- 紫色/蓝紫渐变主视觉
- 米色、棕色、咖啡色一整套单色主题
- 深蓝/ slate 单色大面积主题
- 嵌套 card
- 为了装饰而编号

## Token Direction

颜色必须从仓库现场和清单系统抽象，不做一色到底：

- Manifest paper: `#F7F8F5`
- Dock steel: `#253238`
- Forklift amber: `#D98E04`
- Seal teal: `#0F766E`
- Exception red: `#B42318`
- Ink: `#172026`

使用方式：
- 页面背景使用 Manifest paper 或非常浅的中性色。
- 顶部与主导航可用 Dock steel，但不要把整页做成深色。
- Seal teal 用于确认、已完成、健康。
- Forklift amber 用于等待、队列、注意事项。
- Exception red 仅用于错误、阻塞、异常。
- 状态颜色必须继续服从 status-label helpers，不允许每个页面自造颜色语义。

圆角：
- 业务面板、表格和按钮使用 `0` 到 `8px`。
- 不使用大圆角胶囊作为普通布局装饰。

尺寸：
- PC 主内容宽度应向两侧扩展，目标 `max-width` 至少覆盖宽屏工作台场景。
- 表格、strip、queue list 和状态栏必须有稳定高度/列宽，避免刷新或轮询时跳动。
- 移动端保持可读，但 dashboard 的主要验收视口是 PC 浏览器。

字体：
- 不新增外部 webfont 依赖，除非任务明确允许并能离线构建。
- 默认使用当前系统 sans stack。
- 数据列、编号、SHA、柜号、托盘号、时间戳可使用 tabular numeric style。
- 标题不要使用 landing-page 尺寸；后台页面标题应紧凑、可扫描。

## Information Architecture

`/` dashboard 后续应由真实 API 驱动，建议分区：

1. Work Queue
   - failed imports / parse pending / generation failed / async jobs failed
   - attendance parse / wage generation / unloading summary export blockers
   - 每个 item 必须有目标 route、stable code、priority 和 created/updated time。

2. Dock Lane Strip
   - active load jobs、dockNo、truckNo、assigned containers、loaded / remaining pallets
   - 状态来自后端 load job / scan transaction，不从前端推算库存。

3. Inventory Pressure
   - destination pressure、remaining pallets、exception pallets、stale inventory
   - 只使用后端 inventory/report API 聚合结果。

4. Active Load Jobs
   - planned / in-progress / completed today
   - 显示最近 scan、duplicate scan、override 标记和 dock requirement。

5. Exceptions
   - missing destination/cartons/volume
   - zero volume with cartons warning
   - duplicate imports by SHA-256
   - failed async jobs
   - scan conflicts and invalid scans

6. Recent Activity
   - import, correction, generated file, reprint, scan, wage and settings events
   - 显示 actor、action code、target、time；actor 缺失必须可见。

Dashboard 不展示假数据。空状态必须说明当前没有对应真实记录，并给出下一步入口。

## API Contract Governance

WEB-DASHBOARD-01 新增 dashboard API 时：

- API 只返回稳定 `code`、`labelKey`、enum、数字、时间戳、route、raw source data。
- API 不返回本地化 UI 文案。
- API response 必须按当前用户权限裁剪 section 和 action。
- 不允许让前端根据隐藏数据自行决定是否展示无权限 section。
- 错误返回稳定 `code`，message 可以用于技术排错，但用户可见文案由 Web catalog 管理。
- Dashboard summary 不能从 frontend state 计算剩余库存。
- 与 scan、inventory、wage、generated file、correction 相关的数字都必须来自数据库或 API 聚合。

推荐 endpoint：
- `GET /api/dashboard/operations`

推荐 response 概念：
- `generatedAt`
- `sections[]`
- `section.code`
- `section.labelKey`
- `section.permissionScope`
- `section.status`
- `section.items[]`
- `item.code`
- `item.labelKey`
- `item.priority`
- `item.route`
- `item.targetType`
- `item.targetId`
- `item.metrics`
- `item.timestamps`

## I18n Governance

i18n 是硬门禁。

后续 dashboard / shell / nav 改造必须遵守：

1. 所有新增可见文案进入 `apps/web/src/lib/i18n/locales/en.ts` 和 `zh.ts`。
2. 所有 aria-label、title、placeholder、button label、empty state、error state、
   table heading、panel heading、help text 都必须纳入 i18n 管理。
3. 动态句子必须用 catalog dynamic translation 或稳定 formatter，不允许 JSX 中拼接
   用户可见英文/中文。
4. 状态、enum、业务标签必须使用 `status-labels.ts` 或新增同类 helper。
5. API `labelKey` 只作为稳定 key；Web 决定当前 locale 下的显示。
6. `en` 与 `zh-CN` 切换后刷新仍应保持同一 locale。
7. 技术 raw data 例外仅限：柜号、托盘号、员工姓名、email、role code、permission code、
   SHA-256、MIME、file path、API code、job id、timestamp 等。
8. 不允许普通 UI 可见文本出现 `English / 中文` 双语混排。
9. Dashboard QA 必须跑 i18n unmanaged string test 和 locale switch smoke。

## Shell And Navigation Direction

WEB-DASHBOARD-02 改 Shell 时：

- Shell 应更像操作台，不像简单网站 header。
- 保留权限感知导航，所有 nav label 进入 i18n catalog。
- 当前用户、角色、环境、locale switch 和 logout 需要稳定位置。
- 横向主导航可以保留，但应支持宽屏展开和窄屏滚动，不产生水平页面滚动。
- 主内容区域应比当前 `max-w-7xl` 更适合 PC 后台，可使用更宽的工作区。
- 不要改移动扫码专用页面的可用性；移动扫码仍以大触控目标为主。

## Component Direction

后续 UI 组件优先级：

- dense data table
- queue list
- lane strip
- status chip
- exception row
- metric tile
- compact filter bar
- audit activity row
- permission-aware empty state

避免：
- 重复卡片堆叠成首页
- 大 hero 文案
- 插画
- 装饰性图形
- 与业务无关的图标

图标只用于明确动作或状态，优先使用已有依赖；不要为了本任务新增图标库，除非
WEB-DASHBOARD-02 明确评估依赖和 bundle 影响。

## Task Split

WEB-DASHBOARD-01 Operations Dashboard Data API：
- 新增真实 dashboard 汇总 API。
- 按角色/权限裁剪 sections。
- API 不返回本地化 UI 文案。
- 补 API unit/e2e。

WEB-DASHBOARD-02 Shell Visual System Redesign：
- 重塑后台 Shell、导航、topbar、layout tokens 和基础 dashboard 组件。
- 所有新增 shell/nav 文案进入 i18n catalog。
- 不接 mock API。

WEB-DASHBOARD-03 Operations Dashboard UI：
- 用真实 WEB-DASHBOARD-01 API 重做 `/` dashboard。
- 实现 Work Queue、Dock Lane Strip、Inventory Pressure、Active Load Jobs、
  Exceptions、Recent Activity。
- 覆盖 loading/error/empty/permission states。

WEB-DASHBOARD-04 Dashboard QA I18n Regression：
- 跑 API/Web/i18n/Playwright/full-stack 回归。
- 覆盖 English -> 中文 -> refresh -> English。
- 验证无 unmanaged UI strings。

## Acceptance Criteria

WEB-DASHBOARD-00 完成条件：

1. 本文件存在，并明确 Manifest Control Room 方向。
2. 明确 dashboard 不是 mock、不是 landing page、不是纯健康检查页。
3. 明确后续 API / Web / Shell / QA 拆分。
4. 明确 i18n governance 是硬约束。
5. 明确 API 只返回 stable code / labelKey / enum / raw source data。
6. 更新项目完成度报告和任务索引。
7. 不修改运行时业务代码。
8. `git diff --check` 通过。

后续任务不得把 WEB-DASHBOARD-00 当作 UI 实现完成；它只关闭设计方向。

测试命令：
- git diff --check

手工验收：
1. 读取本 brief，确认后续任务能独立执行。
2. 确认没有新增 mock business data。
3. 确认没有改动 API/Web 运行时代码。
