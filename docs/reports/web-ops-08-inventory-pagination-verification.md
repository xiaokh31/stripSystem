# WEB-OPS-08 库存分页、排序与自适应工作区验证报告

验证日期：2026-07-15

任务：`WEB-OPS-08Inventory Pagination Sorting and Adaptive Workspace.md`

## 完成结论

`/inventory` 已完成服务端分页、共享稳定排序、全筛选集合 totals、跨页 selection 和内容驱动工作区。当前环境的
API、Web、Worker、真实 PostgreSQL Chromium、生产构建、健康检查及源码差异检查均已完成；没有 schema/migration
变更、外部设备检查或遗留验收项。

## API contract 与查询形态

- `GET /api/reports/container-summary` 接受 `page >= 1`、`pageSize=5|10|20|50`、
  `sortBy=createdAt|containerNo|status`、`sortDirection=asc|desc`，默认 `1/10/createdAt/desc`。
- response 返回当前页 `items`，以及后端规范化后的 `page`、`pageSize`、`totalItems`、`totalPages` 和完整筛选集合
  的 `totals`。越界页由 API 规范化到最后有效页。
- summary service 使用一条 PostgreSQL `containers LEFT JOIN container_destinations LEFT JOIN pallets` 聚合查询完成
  filter 与柜级库存计数，不读取或水合 pallet records；随后只在后端对聚合行执行共享 comparator 和分页。
- 55 柜 unit fixture 证明 pageSize 为 5/10/20/50、六种排序和越界均正确；query instrumentation 证明每次 summary
  只有一次 `$queryRaw`，柜外 pallet 数不会产生逐柜或逐目的仓 N+1。
- WEB-OPS-07 的 createdAt/containerNo/status 生命周期 rank、数字分段柜号排序和 tie-break 已抽到
  `common/container-ordering.ts`，柜子索引与库存汇总共用同一实现。
- 全局 Destination summary 使用独立的一条完整筛选集合聚合查询；top metrics 直接读取 summary response 的
  `totalItems/totals`，因此翻页不会改变口径。
- selected detail 继续按稳定 `containerId` 独立读取，不依赖当前页；unit 与浏览器均证明 selected 柜位于页外时仍可查看、
  调整和刷新。
- 现有 `Container.createdAt`、status 与关联索引已满足查询；本 Task 无 Prisma schema 或 migration 变更。

## Web、URL 与布局

- URL 稳定保存 filter、`containerId`、page、pageSize、sortBy、sortDirection；旧 URL 使用默认值。搜索、page size、
  sort field/direction 变化回到第 1 页，删除或过滤后的越界页 replace 到 API 返回的最后有效页。
- 上一页、下一页、当前页/总页、总条数、page-size 和 sort 控件均使用 typed en/zh-CN 文案、原生可聚焦控件、
  disabled 边界状态和 localized aria-label。
- operation grid 使用 `align-items: start`；左右列按内容自然占高。短 selected workspace 不再被左表 stretch，
  全局 Destination summary 紧随较高 grid 内容。
- 只有目的仓超过 5 个或历史超过 10 条时，具名且 focus 可达的内部列表区域才启用 bounded scroll；整个页面不进入
  nested-scroll 陷阱。390/768px 保持左汇总、右操作、全局目的仓的自然单列 DOM 流，页面横向 overflow 为 0。
- polling、浏览器 refresh、locale/theme 切换和人工调整成功后的后端刷新均保留 URL；浏览器在已填写调整 draft 后切换
  page size 并返回 selected 柜，reason/note/count 保持且提交成功。

## 真实浏览器与业务证据

Chromium 通过直连 PostgreSQL 创建隔离 fixture：24 个柜、29 个目的仓、58 个托盘；所有库存均来自真实数据库，
没有页面或 API mock。

- pageSize 5/10/20/50 分别显示 5/10/20/24 行，总页数 5/3/2/1；默认 10。
- createdAt、containerNo、status 的 asc/desc 六种顺序均通过；翻页前后 top metrics 与全局 Destination summary 文本完全一致。
- 模糊联想选中稳定 containerId；选中柜在当前页外仍显示工作区和提示，越界 `page=999` 被规范化。
- 人工消库存前后：remaining `2 -> 1`、adjusted `0 -> 1`、loaded 恒为 `0`；`SCAN_MISSED`、note、真实 actor、
  adjustment id、pallet event id 和 `LABEL_PRINTED -> ADJUSTED_OUT` 均写入审计证据。
- finally 精确删除 correction feedback、pallet events、adjustments、generated files、pallets、destinations 和 containers；
  测试结束再次查询 fixture container count 为 0。

几何证据位于 `test-results/web-ops-08/adaptive-geometry.json`：

- desktop 左表高 1378px，右侧短工作区高 1081.5px，证明没有 stretch；后续 section 间距 16px。
- 长工作区可访问列表 `clientHeight=766`、`scrollHeight=3594`，只有长列表区域受约束。
- 390px 单列顺序为 left top 1780.656、right top 3276.656、destination top 4551.656，document overflow 为 0。

调整审计证据位于 `test-results/web-ops-08/pagination-adjustment-evidence.json`。28 张 PNG 覆盖 en/zh-CN、light/dark、
390/768/1366/1920/2560，以及真实 Chromium 125%/200% zoom；已按原始分辨率抽检英文桌面、中文暗色移动和英文暗色
200% zoom，未见混语、裁剪、重叠或页面 overflow。

## 自动化结果

- API lint、typecheck、production build：通过。
- API unit：31 suites / 249 tests passed。
- API E2E（`--runInBand`）：18 suites / 110 tests passed；包含新分页/RBAC 12 项和真实 Excel worker 链路。
- Web lint、typecheck、Next production build：通过。
- Web unit：220/220 passed。
- Worker pytest：127/127 passed，包含所有 Phase 0 真实 fixture，耗时 404.56 秒。
- Docker Chromium：`web-ops-08-inventory-pagination.spec.ts --project=chromium` 1/1 passed，最终用例 58.7 秒。
- `scripts/healthcheck.sh`：PostgreSQL、Redis、API、Web、nginx、worker 与 Next static assets 全部通过。
- `git diff --check`：通过。

imports E2E 调用真实 parser/report/label 子进程；Docker Desktop 上成功请求实测可超过 Jest 的 5 秒 unit 默认值，因此该
真实 integration suite 明确使用 15 秒预算。未减少测试、未放宽任何业务断言。

## 手工复核步骤

1. 以有 `inventory.read` 的账号打开 `/inventory`，切换 5/10/20/50、六种排序和前后页；复制 URL 到新标签确认状态一致。
2. 选中不在当前页的柜子，确认右侧仍显示并可执行有权限的人工消库存；刷新后确认 selection、page、sort 和 filter 保持。
3. 在短 selected 柜与长历史柜之间切换，确认短内容无空白占位、长列表只有局部 bounded scroll。
4. 在 en/zh-CN、light/dark、390px 和 200% zoom 下用键盘操作分页、排序、联想和调整表单，确认单语且页面无横向滚动。

已知限制：无当前环境限制或外部验收项。下一建议任务为 `WEB-OPS-09`；本 Task 未启动该任务。
