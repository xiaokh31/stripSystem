# 执行 WEB-OPS-08：Inventory Pagination Sorting and Adaptive Workspace

## 优先级与前置任务

- 优先级：P0 库存页高频操作布局与可扩展列表。
- 前置任务：`WEB-OPS-06Shared Container Fuzzy Search and Suggestion Contract.md`、
  `WEB-OPS-07Container Index Created Time and Stable Sorting.md`。
- 后续任务：`WEB-OPS-09Container Inventory I18n Accessibility Visual Exit Gate.md`。

## 必须读取与使用

- `AGENTS.md`、`CONTEXT.md`、`prompts/agents/business-logic-agent.md`
- `.codex/skills/frontend-design/SKILL.md`
- `.codex/skills/nextjs-pwa-ui/SKILL.md`
- `.codex/skills/nestjs-prisma-api/SKILL.md`
- `.codex/skills/bestar-domain/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- WEB-OPS-03、06、07 的任务、实现和 tests
- `apps/web/src/app/inventory/page.tsx`
- `apps/web/src/components/reports/inventory-report-flow.ts`
- `apps/web/src/components/containers/container-inventory-adjustment-*`
- `apps/web/src/app/globals.css`
- API inventory reports controller/service/DTO/tests、Prisma pallet/container indexes

## 已确认现状

1. 左侧 Container summary 当前返回全部匹配 items，没有分页 metadata，也没有 page-size 选择。
2. container summary API 会加载全部 containers/destinations/pallets 后在 Node 内存过滤和聚合。
3. inventory grid 默认 stretch；左侧无限增长的柜子表会把同一 grid row 拉高，用户需要滚动很远才看到后面的
   Destination summary。右侧 selected container 与 adjustment workspace 也缺少针对短/长内容的高度策略。
4. 页面顶端 metrics 当前从当前 `containers` 数组求和；直接对 items 分页会错误地把“全部筛选结果”变成“当前页”。

## 产品目标

库存页左侧柜子汇总支持服务端分页和与柜子索引一致的稳定排序；每页可选 5、10、20、50，默认 10。右侧选中
柜子和目的仓库存按实际内容自然占高，不再被左侧列表强制拉伸；短内容应尽早让用户看到目的仓库存，长内容才进入
受控的局部滚动或折叠。

## 分页与排序 API

1. 扩展 inventory container summary query：`page >= 1`、`pageSize in [5,10,20,50]`、
   `sortBy in [createdAt,containerNo,status]`、`sortDirection in [asc,desc]`。
2. response 在保留 `items` 的基础上返回 `page`、`pageSize`、`totalItems`、`totalPages` 和全部筛选结果的 `totals`；
   `items` 只代表当前页。
3. filtering、effective status、排序和分页发生在后端；不得先把所有 pallet rows 传到浏览器再分页。
4. 实现不得对每个柜子或目的仓产生 N+1。可使用数据库 aggregation/bounded two-step query，但必须用测试或 query
   instrumentation 证明请求规模不随 page 外柜子数线性展开全部 pallet records。
5. top metrics 使用 response `totalItems/totals`，Destination summary 继续代表完整筛选集合，不得随当前页变化。
6. WEB-OPS-07 的 status lifecycle order、containerNo order、createdAt order 和 tie-break 是唯一排序规则，不复制第二套。
7. selected `containerId` 的 detail 独立于当前页：翻页或排序后仍保留准确选中柜子，除非用户清除 selection 或权限失效。

## URL 与分页行为

1. URL 使用稳定 query 保存 filter、selected container、page、pageSize、sortBy、sortDirection；旧书签缺少新参数时应用默认值。
2. 改变搜索条件、pageSize 或 sortBy 时回到第 1 页；只切换 asc/desc 也回到第 1 页，避免落入不存在的页。
3. 删除数据或过滤导致当前 page 超过 totalPages 时规范化到最后有效页，不显示空白假页。
4. 提供上一页、下一页、当前页/总页数、总条数和 page-size select；边界按钮 disabled，键盘和 screen reader 可识别。
5. 选择柜子、人工消库存成功后的后端刷新、跨标签同步、locale/theme 切换不得重置用户 page/sort/filter。

## 自适应布局

1. desktop 保持左侧柜子汇总、右侧选中柜子工作区；grid 明确 `align-items: start`，两侧不得互相 stretch 高度。
2. 左侧每页只有 5/10/20/50 条，table 高度随 page-size 和实际行数自然变化，不设置为填满右侧或 viewport 的固定高度。
3. 右侧 Selected container summary 改为紧凑、内容驱动的高度；短内容不保留大块空白，metrics 使用稳定 dense grid。
4. 目的仓库存/调整区域紧邻 selected summary。目的仓少时全部自然展开；目的仓或历史很多时，仅长列表区域使用有标题、
   focus 可达的 bounded internal scroll 或现有折叠交互，不能把整个页面锁在 nested scroll 中。
5. 全局 Destination summary 位于 operation grid 后，左侧默认 10 行和右侧短内容时应尽早出现；不得因为 grid stretch
   产生空白占位。E2E 必须用 bounding boxes 证明右侧短内容高度小于较高左表且后续 section 紧随 grid content。
6. 390/768px 改为单列自然文档流，顺序为筛选/汇总 -> 柜子分页表 -> 选中柜子/目的仓操作 -> 全局目的仓汇总；
   table 可局部横向滚动，页面本身不能横向溢出。
7. 不使用 card-inside-card，不显示 API、query、permission、React 或数据库等技术提示。

## 库存业务约束

1. remaining/loaded/adjusted/cancelled 仍以数据库 Pallet 状态为 source of truth。
2. 人工消库存继续使用现有稳定 `containerDestinationId` 和 `ADJUSTED_OUT` transaction/audit；分页和排序不能改变 mutation identity。
3. 选中柜子在当前页之外时仍可查看和操作；只读角色仍只读，无 `inventory.read` 仍拒绝整页和 API。
4. polling/跨标签刷新不应在每 15 秒把 pagination focus、combobox 输入或正在填写的 adjustment draft 清空。

## 严格 i18n 硬门禁

1. page size、每页、上一页/下一页、当前页/总页、总条数、排序、selected-outside-page、normalized-page、empty/error、
   tooltip 和 aria 文案全部进入 typed `en` / `zh-CN` catalogs。
2. URL machine values、raw status、permission、reason code 和 API error 不得作为可见文案。
3. 英文长 pagination labels 和中文状态都必须在 390px、200% zoom 下完整，不通过缩错翻译或双语拼接适配。
4. SSR、hydration、refresh、polling refresh 和 locale 切换保持单语，无英文闪现、missing key 或 dynamic parameter mismatch。
5. 日期、数字和 status 分别使用 locale formatter 和 stable label helpers；业务柜号/目的仓代码可原样显示。

## 验收标准

1. 5/10/20/50 四种 page-size、前后翻页、总数/总页数和越界规范化全部正确，默认 10。
2. 三字段六方向与柜子索引使用完全相同顺序；filter/page/sort/selection URL 可刷新和分享。
3. top metrics 与全局 Destination summary 在翻页时数值不变，代表完整筛选集合；当前页 items 正确变化。
4. 短内容下右侧区域不被左侧拉高，目的仓区域无需穿过空白大块；长内容有可访问的局部约束且无 nested-scroll 陷阱。
5. selected container、adjustment draft、成功刷新、并发/审计和只读权限无回归。
6. API 不再把全库 pallet records 水合后交给 Web 分页，无 N+1；有 50+ 柜子 fixture 的性能/查询形态回归。
7. en/zh-CN、light/dark、390/768/1366/1920/2560、125%/200% zoom 无混语、裁剪、重叠或页面 overflow。

## 必须增加或执行的测试

- API unit/E2E：分页 metadata、四种 page size、越界、六种排序、filters、global totals、selected detail、RBAC、query shape。
- Web unit：URL state、page reset/normalize、totals、selection preservation、polling/draft preservation、i18n parity。
- Docker Chromium：至少 23 个隔离柜子，验证 5/10/20/50、翻页、排序、fuzzy selection、短/长目的仓自适应几何、
  人工消库存和精确清理。
- 源码稳定后一次执行完整 Docker API/Web lint、typecheck、unit/E2E、production build、healthcheck 和
  `git diff --check`；先 focused 后 full，不在每个小修复后重建全部镜像。

## 完成输出

- 列出分页 response contract、query/aggregation 策略、global totals 口径和 query-count 证据。
- 给出 23+ 柜子 fixture 的分页/排序/selection/adjustment 前后值和精确清理结果。
- 给出 desktop/mobile adaptive-height bounding-box 证据和截图。
- 列出 i18n、RBAC、可访问性结果，更新 Task、索引和完成度报告；不得自动执行 WEB-OPS-09。
