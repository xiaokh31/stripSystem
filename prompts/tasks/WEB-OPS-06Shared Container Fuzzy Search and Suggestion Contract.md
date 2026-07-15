# 执行 WEB-OPS-06：Shared Container Fuzzy Search and Suggestion Contract

## 优先级与前置任务

- 优先级：P0 办公室柜子检索效率。
- 前置任务：`WEB-OPS-05I18n Visual and Performance Exit Gate.md` 已完成。
- 后续任务：`WEB-OPS-07Container Index Created Time and Stable Sorting.md`、
  `WEB-OPS-08Inventory Pagination Sorting and Adaptive Workspace.md`。

## 必须读取与使用

- `AGENTS.md`、`CONTEXT.md`
- `prompts/agents/business-logic-agent.md`
- `.codex/skills/frontend-design/SKILL.md`
- `.codex/skills/nextjs-pwa-ui/SKILL.md`
- `.codex/skills/nestjs-prisma-api/SKILL.md`
- `.codex/skills/bestar-domain/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- `apps/web/src/app/containers/page.tsx`
- `apps/web/src/app/inventory/page.tsx`
- `apps/web/src/components/reports/inventory-report-flow.ts`
- `apps/web/src/lib/api-client.ts`、typed i18n catalogs、permission helpers
- API containers/reports/auth controller、service、DTO 和 tests
- 现有 load-job container suggestions 只能作为交互参考，不能直接复用其业务筛选或权限

## 已确认现状

1. `/containers` 没有搜索输入框；页面直接读取完整 container summary。
2. `/inventory` 的柜号过滤器是普通 search input，只有提交表单后才执行 contains filter，没有输入联想或直接选择。
3. 现有 inventory service 会把柜子及 pallets 全量读入内存后再过滤，不适合作为高频 typeahead 查询。
4. `GET /load-jobs/container-suggestions` 受 `loadJobs.create` 权限、目的仓和剩余托盘条件约束，不能作为办公室柜子
   索引或库存筛选的通用数据源。
5. 当前 permission guard 对多个 permission 使用 AND；不能把 `containers.read` 和 `inventory.read` 同时写在一个
   route 上冒充 OR 权限。

## 产品目标

在柜子页面和库存筛选中提供一致的柜号模糊联想。用户输入第一个非空字符后出现匹配下拉框，可用鼠标或键盘
直接选择准确柜子；选择结果必须携带稳定 `containerId`，不能把模糊文本当成后续业务操作 identity。

## 搜索匹配规则

1. 对 query 执行 trim，柜号比较不区分大小写；空 query 不发送请求、不显示下拉框。
2. “模糊查找”本任务定义为柜号子串匹配，不做会产生不可解释结果的拼写纠错或编辑距离猜测。
3. 排名固定为：完整匹配 -> 前缀匹配 -> 其他子串匹配；同级按柜号升序、`containerId` 升序稳定排序。
4. 默认最多返回 10 条，API 对 `limit` 做 `1..20` 边界校验，对 query 长度做合理上限校验。
5. 无匹配、加载中、请求失败和重新输入都必须有清晰但不占据固定大空间的状态。

## API 与权限设计

1. 新增一个共享 suggestion query service，只查询联想需要的最小字段，必须在数据库执行 case-insensitive
   contains/prefix candidate query；不得读取所有 destinations/pallets 后在 Node 内存筛选。
2. 通过两个薄 controller contract 暴露相同查询逻辑：
   - 柜子页 endpoint 受 `containers.read` 控制；
   - 库存页 endpoint 受 `inventory.read` 控制。
3. 不修改 permission guard 为全局 OR，不扩大角色权限，不要求库存只读用户额外获得 `containers.read`。
4. response 只返回 stable raw data，例如 `containerId`、`containerNo`；如 UI 确需状态或创建时间，只返回 raw enum/ISO，
   由 Web 本地化。API 不返回中英文 UI 句子。
5. 柜号唯一约束继续生效；suggestion 只读，不写 correction/audit，不影响库存、扫码、工资或生命周期状态。

## Web 交互

1. 抽取一个可复用的 Client `ContainerCombobox`，两个页面共享键盘、debounce、race handling、loading/error/empty
   状态，但各自传入符合当前页面权限的 loader 和 select handler。
2. 输入采用约 250ms debounce；新请求开始时取消旧请求或以 request sequence 保证最后一次输入胜出，旧响应不能覆盖新结果。
3. 实现标准 combobox/listbox 语义：`aria-expanded`、`aria-controls`、`aria-activedescendant`、option selected state；
   支持 ArrowUp/ArrowDown、Enter、Escape、Tab、鼠标点击和输入框外关闭。
4. `/containers` 选择 suggestion 后直接进入 `/containers/{containerId}`，达到快速打开柜子详情的目的；保留无 JS 的
   普通提交/列表使用能力。
5. `/inventory` 选择 suggestion 后把准确 `containerId` 与规范柜号写入 URL，加载右侧选中柜子；用户再次修改文本时
   必须清除旧 selection，不能让界面显示新文本却继续操作旧柜子。
6. 未选择下拉项时，库存筛选表单仍允许用输入文本执行原有 contains filter；不能强迫用户一定点击 suggestion。
7. 页面刷新、locale/theme 切换和浏览器前进后退应恢复 URL 中的筛选与准确 selection，不自动重复请求 mutation。

## 严格 i18n 硬门禁

1. 搜索 label、placeholder、loading、no results、error、结果数量、keyboard/aria 文案全部进入 typed `en` / `zh-CN`
   catalogs，key 和插值参数完全一致。
2. English 只显示 English，中文只显示中文；柜号是业务数据，可原样显示，但不得展示 raw status、permission、error code
   或 labelKey 作为主 UI。
3. API stable error code 通过 Web helper 映射为当前 locale 文案，不显示后端英文 `message`。
4. SSR 首帧输入值、hydration、输入联想、locale 切换均不得闪现另一语言、双语同屏或 hydration mismatch。
5. 长英文 empty/error 文案在 390px、200% zoom 下不能遮挡 input、option 或相邻操作。

## 验收标准

1. 两个页面从第一个非空字符开始显示按确定规则排序的柜号建议；空值不请求，最多 10 条。
2. 键盘和鼠标均能选择；柜子页准确进入详情，库存页保存准确 `containerId` 并加载对应目的仓库存。
3. 快速连续输入时只有最新 query 能更新下拉框；取消、失败、无匹配后可继续输入恢复。
4. `containers.read` 与 `inventory.read` 各自权限独立工作；无权限请求返回 403，不能复用 load-job 权限绕过。
5. suggestion 查询不全量加载 pallets，具有 service/controller contract 和 query-count/shape regression test。
6. en/zh-CN、light/dark、keyboard/screen-reader semantics、390/768/1366/1920、200% zoom 通过 focused regression。

## 必须增加或执行的测试

- API unit：trim/case-insensitive、exact/prefix/contains ranking、limit、空值、稳定 tie-break、权限。
- API E2E：两条 permission boundary、无权限 403、返回最小 raw contract。
- Web unit：debounce、stale response、清除旧 selection、URL 保留、键盘状态机、localized states。
- Docker Chromium：两个页面各完成输入、下拉、键盘选择、鼠标选择、无结果和快速输入 race。
- 源码稳定后一次性执行 Docker API/Web lint、typecheck、相关 unit/E2E、production build、healthcheck 和
  `git diff --check`；不得为每次小改动重复 full build。

## 完成输出

- 列出 endpoint、permission、query plan/字段和共享 service/component 决定。
- 给出 ranking、race、keyboard、直接导航和库存准确 selection 的测试证据。
- 列出新增 i18n keys、双语截图和无混语结论。
- 更新 Task、任务索引和完成度报告；不得自动进入 WEB-OPS-07。

## 完成记录（2026-07-15）

状态：已完成。

- API 新增共享 `ContainerSuggestionsService`，由
  `GET /api/containers/suggestions`（`containers.read`）和
  `GET /api/inventory/container-suggestions`（`inventory.read`）两个薄 controller 独立暴露。
  查询只读取 `Container.id/container_no`，在 PostgreSQL 内完成 escaped、case-insensitive
  substring candidate query，并按 exact → prefix → contains、`container_no`、`id` 稳定排序；空白
  query 不访问数据库，默认 10 条，`limit` 限制为 1..20，query trim 后最多 64 字符。
- Web 新增共享 `ContainerCombobox` 与纯逻辑 coordinator。250ms debounce、AbortController 与 sequence
  共同保证 latest-query-wins；支持 loading/empty/localized error recovery、ArrowUp/ArrowDown、Enter、
  Escape、Tab、鼠标和点击外关闭，并提供完整 combobox/listbox/option ARIA identity。
- `/containers` 选择后使用稳定 `containerId` 进入详情，同时保留 no-JS query 提交及列表过滤；`/inventory`
  把规范柜号和 `containerId` 写入 URL，用户再次编辑立即移除旧 identity/workspace/action，未选择 suggestion
  时仍可提交原有 contains filter。
- typed en/zh-CN catalog 已加入 search label、placeholder、loading、empty、failure、permission、keyboard 指引及
  result-count 文案；API code 只经本地 helper 映射，不呈现 raw message/code。双语、light/dark、四种 viewport
  和真实 Chromium 200% zoom 共 40 张最终 PNG 无混语、遮挡或 document overflow。
- Docker 验证：API lint/typecheck、28 suites / 225 unit、focused E2E 2/2；Web lint/typecheck、213 unit、
  production build、focused Chromium 1/1；Prisma 22 migrations up to date、full-stack healthcheck 与
  `git diff --check` 均通过。浏览器夹具精确清理后临时 user/container 残留为 0；没有 schema/migration 变更。
- 完整契约、命令和人工复核记录见
  `docs/reports/web-ops-06-container-suggestion-verification.md`。本 Task 不启动 WEB-OPS-07。
