# 执行 WEB-DASHBOARD-07：Dashboard Drilldown Navigation and Target Filters

## 优先级与执行边界

- 优先级：P0，已交付 Dashboard 的现场导航回归。
- 前置任务：`WEB-DASHBOARD-00` 至 `WEB-DASHBOARD-06`、`WEB-OPS-01` 至
  `WEB-OPS-09` 均保持 `DONE`；不得重做现有视觉系统、2048px 工作区、Dock Lane
  Strip、企业品牌或库存事务。
- 本 Task 是 Dashboard 聚合口径、目标列表筛选、URL 状态、RBAC、Web 交互和
  strict i18n 的完整 vertical slice。不得只替换几个 `href`，也不得只让 URL
  看起来变化。
- 当前工作树包含 WAGE-HOURS-07 和 PUBLIC-DEPLOY 的未提交成果。开始前必须读取
  `git status` 并保留现有修改；不得 reset、checkout、覆盖或回退其他任务。
- 只执行本 Task。达到终态后更新本 Task、Task Index、完成度报告和 `HANDOFF.md`，
  不得在同一 Session 自动执行 WEB-DASHBOARD-08。

## 对应用户原始反馈

“仪表盘中点击各个跳转，并不能真正跳转到对应，查看不了对应的显示，请检查是否完善仪表盘功能。”

产品口径：Dashboard 上的聚合数字不是普通菜单入口。用户点击某个数字或状态后，
目标页面必须展示构成该数字的对应业务记录；点击一条具体记录后，必须打开或明确
选中该记录。只跳到未筛选的 `/imports`、`/containers`、`/load-jobs` 等总列表，
不算完成。

## 必须读取与使用

- `AGENTS.md`、`HANDOFF.md`
- `prompts/agents/business-logic-agent.md`
- `prompts/tasks/WEB-DASHBOARD-00Back Office Visual Direction.md`
- `prompts/tasks/WEB-DASHBOARD-01Operations Dashboard Data API.md`
- `prompts/tasks/WEB-DASHBOARD-03Operations Dashboard UI.md`
- `prompts/tasks/WEB-DASHBOARD-04Dashboard QA I18n Regression.md`
- `prompts/tasks/WEB-DASHBOARD-06Dock Lane Strip English Layout Visual E2E Regression.md`
- `.codex/skills/bestar-handoff/SKILL.md`
- `.codex/skills/frontend-design/SKILL.md`
- `.codex/skills/nextjs-pwa-ui/SKILL.md`
- `.codex/skills/nestjs-prisma-api/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- `.codex/skills/bestar-domain/SKILL.md`
- `apps/api/src/dashboard/**`
- Dashboard 指向的 imports、containers、reports/inventory、load-jobs、
  attendance、unloading-summary、unloading-wage API/controller/service/DTO
- `apps/web/src/app/page.tsx`
- `apps/web/src/components/dashboard/**`
- `apps/web/src/app/imports/page.tsx`
- `apps/web/src/app/containers/page.tsx`
- `apps/web/src/app/inventory/page.tsx`
- `apps/web/src/app/load-jobs/**`
- `apps/web/src/app/work-hours/page.tsx`
- `apps/web/src/app/unloading-summary/page.tsx`
- `apps/web/src/app/unloading-wage/page.tsx`
- `apps/web/src/lib/api-client.ts`、permissions 和 typed i18n catalogs
- Dashboard API/Web unit tests 与 `apps/web/e2e/dashboard.spec.ts`

## 已确认的缺陷

1. Work Queue 多个不同统计项分别跳到同一个未筛选页面；目标页不能辨认用户点击的
   是待解析、解析失败、缺报告、缺面单还是其他队列。
2. Lifecycle 除 `LOADED` 外大多只跳到 `/containers`；`UNLOADED` 跳月度汇总，
   `LOADING_IN_PROGRESS` 跳装车总页，均没有保持该 lane 的精确状态口径。
3. Inventory 的 active 与 remaining 都跳未筛选 `/inventory`；Top destinations
   当前完全不可点击。
4. Load Jobs 的 open、in-progress、due-today 和每条 active job 都跳同一个
   `/load-jobs`，没有状态、日期或具体 job 选择。
5. Exception Queue 的 parser、字段缺失、零体积、生成失败、扫码异常和异步任务失败
   只打开通用页面，无法看到构成异常数字的记录。
6. Monthly Summary 三个指标共用同一链接；其中 review warning 还是全局缺失完成日期
   数字，却伪装成所选月份内的普通汇总入口。
7. Attendance needing-parse / errors 共用未筛选 Work Hours 页面；
   unloading-wage review 也没有 review filter。
8. Recent Activity 的 load job 不定位具体 job；generated file/correction 的 fallback
   可能只打开 `/reports` 或 `/containers`，不能定位具体记录。
9. 现有 Playwright 只验证一个 lifecycle lane 的 `href` 导航和页面 URL，未断言目标页
   出现匹配记录、排除不匹配记录，因此旧 QA 会在功能仍错误时通过。
10. Container lifecycle Dashboard 直接按 stored status 聚合，而柜子索引会计算
    effective status；若两边不共享口径，即使增加 query 仍可能出现“数字为 N，结果不是 N”。

## 交互类型定义

1. **Open-all action**：section 标题旁的“打开全部柜子/库存/装车任务”等普通菜单命令，
   可以进入未筛选业务页，但文案必须明确是打开全部。
2. **Aggregate drilldown**：带 count、比例或压力值的 tile/lane/exception/destination。
   必须进入同一后端谓词的筛选结果。
3. **Record drilldown**：active job 或 recent activity 中的一条具体记录。必须打开详情，
   或在没有详情路由时通过稳定 id 在目标列表中选中、展开、聚焦和高亮该记录。
4. count 为 0 的 aggregate 仍可点击，但只能展示该筛选条件下的本地化空结果；不得自动
   降级成未筛选总列表。

## 统一 Drilldown Contract

1. 为 Dashboard response 建立 typed drilldown contract，至少包含稳定 code 和安全的
   target/href；不得在 `page.tsx` 中继续散落手写字符串。
2. 所有 query key、scope、review code 和 status 必须来自 allowlist/enum，并由 API DTO
   和 Web normalizer 验证。未知值回退到本地化错误/空状态，不能拼接任意 route。
3. API 只返回 stable code、labelKey、enum、id、number、timestamp、raw business data
   和 route/query contract；不返回本地化句子。
4. 聚合 count 与目标结果必须共享同一个可测试的 predicate/query builder/service。
   不允许 Dashboard 一套条件、目标列表再手写另一套近似条件。
5. 优先在现有业务页实现 server-side URL filters。对于当前没有任何可审阅列表的
   `FAILED_GENERATED_FILES`、`FAILED_ASYNC_JOBS`、`SCAN_EXCEPTIONS`、
   `UNLOADING_COMPLETION_DATE_MISSING` 等，可新增一个克制的只读运营复核页
   （建议 `/operations/review?code=...`）及分页 API；该页必须列出精确记录并提供进入
   真实业务记录的 action，不能成为第二个 Dashboard。
6. 目标页显示一个紧凑、本地化的“来自运营中控台”筛选上下文、当前条件和“清除筛选/
   查看全部”命令。不要用大说明卡占据业务工作区。
7. 筛选必须保存在 URL。refresh、SSR、browser back/forward、pagination、sorting、
   locale/theme 切换后条件仍保持；清除筛选才返回全部。
8. 数据在点击后可能因并发操作变化。此时显示当前真实结果和本地化空状态，不伪造旧 count，
   不把不匹配数据补足到旧数字。

## 必须覆盖的跳转矩阵

### Work Queue

| Dashboard code | 目标口径 |
| --- | --- |
| `IMPORTS_AWAITING_PARSE` | active import，`importStatus=UPLOADED` 且 `parseStatus=NOT_PARSED` |
| `IMPORTS_PARSE_FAILED` | active import，`parseStatus=ERROR` |
| `CONTAINERS_MISSING_REPORT` | 非 ERROR 柜子，且不存在当前 GENERATED Excel report |
| `CONTAINERS_MISSING_LABELS` | eligible 柜子，且不存在当前 GENERATED pallet-label PDF |
| `OPEN_LOAD_JOBS` | `PLANNED` 或 `IN_PROGRESS`；Dashboard 和目标页对“open”使用同一含义 |
| `UNLOADING_COMPLETION_DATE_MISSING` | 已拆完口径柜子，但没有可用 pay-container `completedAt` |
| `ATTENDANCE_IMPORTS_NEED_PARSE` | active attendance import，`parseStatus=NOT_PARSED` |

### Container Lifecycle

1. `UPLOADED` 进入 active imports 的 `UPLOADED + NOT_PARSED` 结果。
2. `PARSED`、`REPORT_GENERATED`、`LABELS_GENERATED`、`UNLOADED`、
   `LOADING_IN_PROGRESS`、`LOADED` 全部进入相同 lifecycle status 口径的柜子结果。
3. Dashboard count、柜子筛选和柜子列表显示统一使用 canonical effective lifecycle
   语义；不得一边 stored status、一边 effective status。
4. 保留 `UNLOADED=已拆完`、`LOADED=已送库` 的现有业务含义。

### Inventory Pressure

1. Active pallets：非 `CANCELLED`、非 `ADJUSTED_OUT`。
2. Loaded pallets：`LOADED`。
3. Remaining pallets：非 `LOADED`、非 `CANCELLED`、非 `ADJUSTED_OUT`。
4. 每个 Top destination 行变成完整可访问的 drilldown，至少保持
   `destinationCode + remaining scope`；目的仓 code 是 raw business data。
5. Active/remaining 是组合 scope，不能错误伪装成单个 pallet status。

### Load Jobs

1. Open：`PLANNED + IN_PROGRESS`。
2. In progress：只含 `IN_PROGRESS`。
3. Due today：使用系统 operational timezone 的当天范围并排除 `CANCELLED`，
   与 Dashboard count 完全一致。
4. Active job card 使用 `loadJobId` 精确选中记录。若保持单页列表，选中项需要自动
   滚入可视区、可聚焦并有非颜色唯一的选中标记；不得只按可能为空或不唯一的显示文本定位。

### Exception Queue

| Dashboard code | 目标口径 |
| --- | --- |
| `PARSER_ERRORS` | active unloading imports，`parseStatus=ERROR` |
| `DESTINATION_CARTON_VOLUME_MISSING` | 缺 destination/cartons/volume 的具体 container line，并能进入所属柜子 |
| `ZERO_VOLUME_WITH_CARTONS` | `cartons > 0 && volume = 0` 的具体 line |
| `FAILED_GENERATED_FILES` | failed generated file 与 failed wage generated file，显示来源类型并进入所属记录 |
| `SCAN_EXCEPTIONS` | `INVALID_SCAN` 或 `DUPLICATE_SCAN` 的具体 pallet event，并显示 load job/pallet 入口 |
| `FAILED_ASYNC_JOBS` | failed async job，不限于 import job；显示 job type、关联 target 和可用业务入口 |

### Monthly / Wage / Attendance

1. Completed containers 和 Summary rows 使用 Dashboard 已选择的 `month`，进入对应
   月份汇总并聚焦对应 section。
2. Review warning 不得继续假装成该月普通 rows。若保持全局 missing-completion-date
   口径，使用明确本地化名称并进入该精确复核结果；若改成月度口径，则 count 与结果都必须
   同时改成同一月份，不能只改文案。
3. Attendance needing parse 使用 `parseStatus=NOT_PARSED`；attendance errors 使用
   `parseStatus=ERROR`。
4. Wage settlements needing review 只显示 `warningCount > 0 || errorCount > 0` 的
   settlement；若 Dashboard count 是跨月，目标页也必须支持跨月 review 结果。

### Recent Activity

1. Import 和 container 保持精确 detail route。
2. Load job 必须用 id 精确选中。
3. Generated file 必须定位到具体 file 或其所属 import/container 的具体文件区域；
   使用 anchor/query 时必须稳定且 refresh 后仍定位。
4. Correction 必须定位到具体 correction 或所属记录的 correction history；不得退回
   未筛选 `/containers`。
5. 无直接 parent 的 record 必须进入只读运营复核详情，不得使用无上下文 `/reports` fallback。

## 目标页与 API 要求

1. Imports 和 Attendance list 增加受 DTO 验证的 server filters，active/deleted 边界保持
   WAGE-HOURS-07 与 IMPORT-DELETE-01 现有语义。
2. Container index 增加 lifecycle status 与 review filters；sort/search 必须可组合，
   effective status 筛选、显示和 Dashboard 聚合一致。
3. Inventory 增加 typed `scope=ACTIVE|LOADED|REMAINING` 或等价 contract；与现有
   `status`、destination、container、pagination、sort 可组合。全局 totals 与当前筛选
   summary 的标签必须清楚，不能混淆。
4. Load job list/history 增加 open/due-today 与 exact id selection；日期统一使用现有
   operational timezone helper，不用浏览器本地日期自行推算。
5. Work Hours、Unloading Wage、Unloading Summary 增加上述 URL filter/focus，
   继续保留现有权限、删除、文件可见性、工资和导出语义。
6. 任何新增运营复核 API 必须 bounded pagination、稳定排序、精确 RBAC 和 stable code，
   不返回 storage path、内部 exception stack、token 或 secret。
7. 无 schema 需求时不得增加 migration；如果实现确实修改 schema，必须提供可回滚的
   Prisma migration，并通过现有/空库验证。

## Web 与可访问性

1. Aggregate tile/lane/row 的整个既有点击区域保持可点击；link 使用键盘 Enter，
   button 类控件使用 Enter/Space，且 focus-visible 明确；不要添加嵌套 interactive element。
2. Top destination 新增链接后保持当前紧凑 pressure row，不改成卡片套卡片。
3. Selected/filter context 使用现有 Manifest Control Room tokens；在
   390/768/1366/1920 和 200% zoom 下不挤压表格或操作按钮。
4. 目标结果必须有稳定 locator，例如 `data-drilldown-code`、record id data attribute；
   技术 code 不得作为普通可见文案。
5. 匹配记录可进入真实 detail/action；不匹配 sentinel 不得出现在筛选结果。
6. 权限不足时保持现有 permission boundary。Dashboard 不生成用户无法访问的 target；
   直接访问 URL/API 仍必须 403 或显示本地化 permission state，不能只靠隐藏链接。

## I18n 100% 硬门禁

1. Drilldown context、active filter、scope/review labels、清除筛选、selected record、
   filtered empty/error/loading、pagination、aria/title/tooltip 和新增表头全部进入 typed
   `en` / `zh-CN` catalogs。
2. API 的 code/status/type 不直接显示。Web 使用窄范围 typed mapping 和既有
   status-label helper；未知值显示本地化通用 fallback，并在技术诊断位置保留 raw code。
3. 柜号、目的仓、文件名、load number、员工/工人姓名是 raw business data，不翻译；
   它们周围的标签和句式必须翻译。
4. English 页面不得出现中文 UI；中文页面不得出现 English fallback、raw labelKey、
   raw enum 或双语拼接。SSR first frame、hydration、refresh、client navigation 和
   back/forward 全程保持目标单语，不得先闪 English。
5. 不新增 DOM translator、MutationObserver、CSS 隐藏首帧、宽泛
   `data-i18n-ignore` 或硬编码双语 JSX。
6. 更新 catalog parity、unmanaged-string AST、dynamic mapping 和 locale refresh tests。

## 测试要求

1. API unit：每个 Dashboard drilldown code 的 count predicate 与 list predicate 共用
   contract；有效/无效 filter、有效状态、effective lifecycle、timezone date boundary。
2. API E2E：为每个类别创建 matching 与 non-matching sentinel，断言 Dashboard count、
   drilldown/list total、返回 ids 和 RBAC 一致。
3. Web unit/render：URL normalize/build、组合 filter、clear-filter、pagination/sort
   preservation、exact selection、unknown code、zero result、typed i18n mapping。
4. Focused Playwright：至少完成一条 imports、一条 lifecycle、一条 inventory
   destination、一条 load job exact selection、一条 exception、一条 attendance/wage 和
   一条 recent activity 的真实点击到结果断言；完整矩阵由 WEB-DASHBOARD-08 关闭。
5. 回归 Dashboard range/month、Dock Lane Strip layout、库存 adjustment、工时导入删除、
   public browser HttpOnly session/CSRF 和所有目标页原有未筛选入口。
6. 测试数据使用专用前缀并精确清理，不删除已有业务数据、`storage/` 证据或样本。

## Docker 验证基线

所有 Node、Prisma、test、build 和 Playwright 都必须通过 Docker Compose 执行；不得在
宿主运行 pnpm/Jest/Prisma。

```bash
docker compose -f infra/docker/compose.local.yml up -d --build
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api lint
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api typecheck
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api test --runInBand
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api test:e2e --runInBand
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web lint
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web typecheck
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web test
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web build
docker compose -f infra/docker/compose.local.yml --profile e2e build e2e-web
docker compose -f infra/docker/compose.local.yml --profile e2e run --rm e2e-web e2e/dashboard.spec.ts --project=chromium
scripts/healthcheck.sh
git diff --check
```

## 验收标准

1. Dashboard 所有 aggregate drilldown 都展示构成该数字的精确记录，不再落到无筛选总列表。
2. 所有 record drilldown 都打开或精确选中对应 id；不存在通用 `/reports`、
   `/containers`、`/load-jobs` fallback 冒充详情。
3. count/list 共用 canonical predicate；matching ids、total 和 Dashboard count 在稳定
   fixture 下完全一致，effective lifecycle 和 operational timezone 无口径漂移。
4. URL 可复制、刷新、返回、翻页、排序和切换 locale/theme，筛选/选择不丢失。
5. zero result、并发变化、unknown filter 和 permission denied 都有正确、本地化、非泄漏状态。
6. strict en/zh-CN、SSR/hydration/no-flash、RBAC、keyboard/a11y、responsive/200% zoom
   通过。
7. Docker API/Web checks、focused Playwright、healthcheck、精确数据清理和
   `git diff --check` 全部通过。
8. Task Index、完成度报告和 `HANDOFF.md` 同步真实终态；下一步只能是
   WEB-DASHBOARD-08。

## 非目标

- 不改变柜子、托盘、扫码、工资或考勤的业务状态。
- 不在前端重新计算 Dashboard count 或 remaining inventory。
- 不重做 Dashboard 视觉、Dock Lane Strip、Shell、2048px workspace 或企业 logo。
- 不引入重型 chart library、mock business data、客户端全量过滤或第二套权限模型。
- 不为方便测试暴露 storage path、secret、内部 exception 或未授权记录。

## 完成输出

1. 根因、canonical drilldown map 和 count/list predicate 复用方式。
2. 修改文件、API/query/filter contract、RBAC、i18n 和目标页交互。
3. 实际 Docker test counts、focused browser 路径、数据清理和 healthcheck 结果。
4. remaining implementation、external verification 和 blocker；无剩余时返回 `DONE`。
5. 更新 `HANDOFF.md`，明确下一 Task 是 WEB-DASHBOARD-08，但本 Session 不执行它。

## 执行结果（2026-07-23 MDT）

`Task-Status: DONE`

- Dashboard aggregate 与目标列表现通过共享 canonical predicate 对齐：imports、attendance、effective container
  lifecycle/review、inventory composite scope、load job operational-day scope 和 wage review 均使用受 DTO 验证的
  server filters；Dashboard 返回 typed URL，目标页保留复制、刷新、翻页、排序、locale 和 exact selection 状态。
- 所有 aggregate/record drilldown 已覆盖 Work Queue、七条 lifecycle lane、inventory totals/top destinations、load
  jobs、exception queue、monthly/wage/attendance 和 recent activity。无直接 parent 的异常进入 bounded、稳定排序、
  精确 RBAC 的 `/api/dashboard/review` 与 `/operations/review`，响应不暴露 storage path、token、secret 或 stack。
- Web 已增加统一 filter context、clear-filter、selected-record focus/scroll、稳定 `data-drilldown-code` /
  `data-record-id` locator 和严格 typed en/zh-CN 文案；完整点击区域、键盘链接语义和既有 Manifest Control Room
  layout 保持不变。无 schema 变更，因此本 Task 未增加 migration。
- Docker API lint、typecheck、48 suites / 370 unit、21 suites / 128 E2E，Web lint、typecheck、276 unit、
  production build，Worker 183 pytest 和 E2E image build 全部通过。完整 Chromium `dashboard.spec.ts` 5/5
  通过，覆盖角色裁剪、双语刷新、matching/non-matching sentinel、七类真实 drilldown、390/768/1366/1920 与
  lifecycle light/dark 视觉矩阵。
- `scripts/healthcheck.sh` 与 `git diff --check` 通过。专用浏览器管理员、27 个 session、14 条认证审计及角色关系
  已精确清理；`DASH07-%` fixture 残留为 0，未删除既有业务数据、样本或 `storage/` 证据。
- 全量浏览器首轮曾因在运行中的 Web 容器内执行 production build 后未重启，导致 SSR manifest 与磁盘 chunk
  hash 错配；重启 Web 后静态资源 healthcheck 和完整 5/5 浏览器门禁均通过。后续验证必须在 build 后重启 Web。
- 当前环境无剩余实现、外部验证或 blocker。下一 Task 只能由 fresh supervisor Session 执行
  `WEB-DASHBOARD-08`；本 Session 未启动该 Task。
