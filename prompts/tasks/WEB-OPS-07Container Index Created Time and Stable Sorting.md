# 执行 WEB-OPS-07：Container Index Created Time and Stable Sorting

## 优先级与前置任务

- 优先级：P0 柜子索引可扫描性与稳定排序。
- 前置任务：`WEB-OPS-06Shared Container Fuzzy Search and Suggestion Contract.md`。
- 后续任务：`WEB-OPS-08Inventory Pagination Sorting and Adaptive Workspace.md`、
  `WEB-OPS-09Container Inventory I18n Accessibility Visual Exit Gate.md`。

## 必须读取与使用

- `AGENTS.md`、`CONTEXT.md`、`prompts/agents/business-logic-agent.md`
- `.codex/skills/frontend-design/SKILL.md`
- `.codex/skills/nextjs-pwa-ui/SKILL.md`
- `.codex/skills/nestjs-prisma-api/SKILL.md`
- `.codex/skills/bestar-domain/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- WEB-OPS-06 实现和测试
- `apps/web/src/app/containers/page.tsx`
- API container lifecycle、corrections container controller/service、inventory summary service/DTO
- `apps/api/prisma/schema.prisma` 中 `Container.createdAt`、status indexes
- Web date-time、status-label、i18n 和 URL filter helpers

## 已确认现状

1. `Container` 已有持久化 `createdAt`，不需要新增 schema 或 migration。
2. 当前 `/containers` 借用 `reports/container-summary`，只返回 active inventory 相关柜子，缺少 `createdAt`，并固定按柜号升序。
3. 完全 loaded/adjusted、还没有 active pallets 或只有历史库存的柜子可能不应因为 inventory summary 口径而从柜子索引消失。
4. 页面没有排序控件，也没有可分享/刷新的 sort query state。

## 产品目标

柜子索引新增“创建时间”列，并允许用户按创建时间、柜号字母和状态分别升序/降序。柜子索引必须代表真实柜子记录，
不能继续由“当前是否有 active inventory”决定某个柜子是否可见。

## 列表 API 与数据口径

1. 在 containers domain 提供受 `containers.read` 控制的专用 list contract，或对现有 controller 做等价扩展；
   `/containers` 页面不再依赖 `inventory.read` 才能读取柜子索引。
2. response item 至少包含 `containerId`、`containerNo`、effective `status`、`createdAt` ISO 和当前表格需要的 raw pallet counts。
3. 返回全部符合搜索条件的真实柜子，包括没有 active pallets、全部 loaded、全部 adjusted/cancelled 和历史记录柜子；
   pallet counts 仍按后端数据库状态计算，不能由前端推断。
4. 避免按柜子逐条 N+1 查询；使用 bounded query/aggregation。不得把所有 pallet row 发送给 Web。
5. WEB-OPS-06 suggestion service 与本列表共享规范化/排序 helper 时应复用，但不能耦合库存或 load-job 特定条件。

## 排序规则

1. sort field 只允许 `createdAt`、`containerNo`、`status`，direction 只允许 `asc`、`desc`；非法值回退默认值或返回
   稳定 validation error，不允许直接拼接 SQL。
2. 默认排序为 `createdAt desc`，让最近创建的柜子优先出现。
3. 柜号排序使用不区分大小写的稳定 ASCII/alphanumeric 口径；同值依次以 `createdAt`、`containerId` 打破平局。
4. 状态排序不能按翻译后的显示文本排序。使用稳定业务生命周期顺序：
   `IMPORTED -> PARSED -> CORRECTED -> REPORT_GENERATED -> LABELS_GENERATED -> UNLOADED ->
   LOADING_IN_PROGRESS -> LOADED -> ERROR`；降序完整反转，平局再按柜号和 ID。
5. status 必须使用与页面 badge 相同的 effective container status，不能一边显示 effective status、一边按数据库旧 status 排序。

## Web UI

1. 柜子索引新增创建时间列，使用现有 locale/timezone formatter；中文与英文按各自 locale 格式显示，ISO 只用于
   `<time dateTime>` 和 API，不直接作为主显示。
2. 提供明确的排序字段控件和升/降序控制。使用 select/segmented control 与熟悉的上下箭头图标；图标按钮必须有
   tooltip 和本地化 `aria-label`，不能只靠箭头颜色表达当前状态。
3. sort state 写入 URL；refresh、前进后退、WEB-OPS-06 搜索打开详情再返回、locale/theme 切换后保持。
4. table header 可以显示当前排序状态，但不得让长英文标题挤压柜号、状态或操作列；宽表只允许自身横向滚动。
5. loading、empty、API error、invalid URL fallback 都要保持原有可操作入口，不显示代码或 API 说明。

## 严格 i18n 硬门禁

1. 创建时间、排序字段、升序、降序、tooltip、aria、empty/error 和结果数量全部使用 typed catalogs。
2. status 继续通过 stable enum -> localized status helper；不得在中文显示 `LABELS_GENERATED`，也不得在 English
   同屏显示中文。
3. 日期格式由 locale formatter 负责，不能用硬编码英文月份或中文后缀拼接。
4. sort URL 使用 stable English machine values，但这些值不得作为可见 label。
5. 中文 SSR、hydration、refresh 和 client navigation 首帧均为中文；English 同理，无双语 fallback。

## 验收标准

1. 柜子索引显示持久化创建时间，并包含无 active inventory 的柜子。
2. 三个字段六种方向均按上述稳定规则工作；同值结果不会在刷新或翻页前后随机跳动。
3. 默认最近创建优先，URL 可分享且刷新/语言/主题切换保持。
4. `/containers` 的读取只要求 `containers.read`；库存权限变化不会让合法柜子索引消失。
5. pallet counts 和 effective status 与柜子详情/库存 source of truth 一致，无 N+1。
6. 双语、主题、窄屏、长英文、200% zoom 和键盘操作无重叠、裁剪、混语或页面级 overflow。

## 必须增加或执行的测试

- API unit/E2E：全部柜子口径、createdAt ISO、effective status、六种排序、tie-break、非法 query、RBAC、query count。
- Web unit：URL normalize/serialize、默认值、日期 formatter、status rank/label、sort toggle。
- Docker Chromium：按夹具证明时间/柜号/status asc/desc 顺序，刷新与 locale/theme 后保持，搜索返回链路正确。
- 先运行 focused tests；源码稳定后只执行一次完整 Docker API/Web lint、typecheck、test/build、healthcheck 和
  `git diff --check`。

## 完成输出

- 列出 list endpoint、权限、全部柜子口径和无 N+1 证据。
- 给出六种排序的 fixture 顺序、URL、createdAt/date-time 和 effective status 证据。
- 列出 i18n/视觉/可访问性结果。
- 更新 Task、任务索引和完成度报告；不得自动执行 WEB-OPS-08。

## 完成记录（2026-07-15）

状态：已完成。

- 新增 `GET /api/containers` 专用 list contract，只要求 `containers.read`。一条参数化 PostgreSQL
  `containers LEFT JOIN destinations LEFT JOIN pallets + GROUP BY` 查询返回全部真实柜子、ISO `createdAt`、
  effective status 和 raw pallet counts；query-count 固定为 1，无 N+1，也不把 pallet rows 发送给 Web。
- query 只接受 `createdAt|containerNo|status` 与 `asc|desc`。默认 `createdAt desc`；柜号使用共享的
  case-insensitive ASCII/alphanumeric helper 和 createdAt/id tie-break；状态使用固定生命周期 rank，并在排序前计算
  与 badge 相同的 effective status。非法 API query 返回 400，非法 Web URL 安全回退默认值。
- `/containers` 不再请求 inventory summary。页面显示 locale/timezone created time，URL 保存 search/sort/direction，
  refresh、前进后退、搜索进入详情再返回、locale/theme 均保持。select、上下箭头 segmented control、tooltip、
  localized aria-label、`aria-current` 和表头 `aria-sort` 已实现；loading/empty/error/result count 均使用 typed catalogs。
- 真实 Docker Chromium fixture 覆盖 active、全 loaded、全 adjusted、全 cancelled、无 pallet 五种柜子，证明
  createdAt/containerNo/status 六种顺序、默认顺序、createdAt ISO、effective status、刷新/返回/语言/主题保持、
  390/1366/1920 与真实 200% zoom。5 张最终 PNG 原分辨率复核无混语、重叠或页面级 overflow，夹具和临时账号残留为 0。
- Docker 验证：API lint/task-file no-fix lint/typecheck、31 suites / 240 unit、focused container-index E2E 1 suite / 4 tests、build；
  Web lint/typecheck、218 unit、production build；focused Chromium 1/1、full-stack healthcheck、`git diff --check` 均通过。
  既有 `Container.createdAt/status` indexes 已足够，没有 schema/migration 或外部验收项。
- 双轴审查后统一了 `common/container-lifecycle` 的 aggregate effective status（包含 `loadedAt` 信号），并补充 status desc
  完整反转 tie-break 测试。Chromium loaded fixture 现通过真实 load-job scan transaction 构造并断言 `LOADED` pallet
  event，setup 失败也会清理唯一前缀夹具。
- 完整 contract、fixture 顺序、截图和手工复核记录见
  `docs/reports/web-ops-07-container-index-verification.md`。本 Task 未启动 WEB-OPS-08。
