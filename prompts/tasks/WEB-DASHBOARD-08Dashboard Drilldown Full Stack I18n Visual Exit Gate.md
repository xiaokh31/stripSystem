# 执行 WEB-DASHBOARD-08：Dashboard Drilldown Full Stack I18n Visual Exit Gate

## 优先级与执行边界

- 优先级：P0，WEB-DASHBOARD-07 的最终功能退出门禁。
- 前置任务：`WEB-DASHBOARD-07Dashboard Drilldown Navigation and Target Filters.md`
  必须先达到 `DONE`。若 07 未完成，本 Task 不得用测试绕过缺失实现。
- 本 Task 以真实 Docker full stack、真实 PostgreSQL fixture 和真实 Chromium 逐项证明
  Dashboard 点击结果正确；允许修复发现的直接相关缺陷，但不得重做其他业务模块。
- 只执行本 Task。结束时同步本 Task、Task Index、完成度报告和 `HANDOFF.md`。

## 目标

建立一套不会再次把“链接存在”误判为“跳转功能完整”的自动化门禁。每个 Dashboard
聚合项都必须经过：

`源统计 -> 点击 -> URL/筛选上下文 -> 目标 API 结果 -> 可见匹配记录 -> 排除不匹配记录`

每条具体 activity/job 则必须经过：

`源记录 id -> 点击 -> 目标 route -> 同 id 被打开或选中`

## 必须读取

- `AGENTS.md`、`HANDOFF.md`
- `prompts/agents/business-logic-agent.md`
- `prompts/tasks/WEB-DASHBOARD-07Dashboard Drilldown Navigation and Target Filters.md`
- `prompts/tasks/WEB-DASHBOARD-04Dashboard QA I18n Regression.md`
- `prompts/tasks/WEB-DASHBOARD-06Dock Lane Strip English Layout Visual E2E Regression.md`
- `.codex/skills/bestar-handoff/SKILL.md`
- `.codex/skills/frontend-design/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- `.codex/skills/nextjs-pwa-ui/SKILL.md`
- `.codex/skills/nestjs-prisma-api/SKILL.md`
- Dashboard API/Web implementation、目标业务页、API unit/E2E、Web unit 和
  `apps/web/e2e/dashboard.spec.ts`

## 强制契约审计

1. 建立一份 machine-readable 或 table-driven click-surface inventory，覆盖：
   - Work Queue 全部 code；
   - 7 个 lifecycle lanes；
   - inventory active/loaded/remaining 和每个 top destination；
   - load-job open/in-progress/due-today 和 active job records；
   - Exception Queue 全部 code；
   - monthly completed/rows/review；
   - attendance needing-parse/errors 和 wage review；
   - Recent Activity 的 import/container/load-job/generated-file/correction；
   - section open-all actions、workflow shortcuts 和 empty/unavailable actions。
2. 测试必须区分 aggregate、record 和 open-all 三类。open-all 可以打开总列表；
   aggregate 和 record 不允许降级成总列表。
3. 每次 API 新增 Dashboard code、metric 或 clickable record 时，测试 inventory 必须
   因未登记而失败，防止未来漏测。

## 数据夹具与口径验证

1. 使用专用 E2E 前缀创建最小但完整的 matching/non-matching 数据；不得依赖当前业务库
   恰好存在某状态。
2. 每个 aggregate 至少有一个 matching record 和一个易混淆但不匹配的 sentinel。
3. 覆盖 stored/effective container status 差异、active/remaining composite pallet scope、
   cancelled/adjusted-out exclusion、operational timezone 当天边界、active/deleted import
   边界和跨月 wage review。
4. 测试先读取 Dashboard API 的 count/code/target，再点击 UI；目标页返回 total/ids 必须
   与同一 fixture 的预期一致。并发变化测试可单独验证 count 变为 0 的诚实空状态。
5. 测试不得通过前端 DOM count 反向制造期望值，也不得只断言目标页 heading 存在。
6. fixture、测试账号、roles、events、files 和可清理 storage 目录全部使用唯一前缀；
   finally/afterAll 精确清理并证明零残留，不碰既有业务记录和样本。

## 浏览器功能矩阵

### Aggregate drilldowns

对 WEB-DASHBOARD-07 列出的每个稳定 code 执行以下断言：

1. link 的 URL 含 typed filter/scope/review code，不是无条件通用 route。
2. mouse click 和 keyboard Enter 均能导航；focus-visible 保持。
3. 目标页显示当前 locale 下的 drilldown context 和 clear/show-all command。
4. matching record id/业务标识可见，不匹配 sentinel 不可见。
5. refresh 后筛选仍在；browser back 返回 Dashboard，forward 再次恢复目标结果。
6. 翻页、排序、柜号搜索或目标页已有筛选与 drilldown 条件组合时不丢条件。
7. 清除筛选后才显示总列表，URL 同步清除 drilldown 参数。
8. count 为 0 时显示筛选后的本地化空状态，不自动显示其他记录。

### Record drilldowns

1. Active load job 和 recent load-job 通过稳定 id 选中同一 job，并自动滚入可视区域。
2. Import/container 打开同 id detail。
3. Generated file/correction 打开同 id、稳定 anchor 或运营复核详情；刷新后定位仍保持。
4. 不允许 generic `/reports`、`/containers`、`/load-jobs` fallback 在没有选中记录时通过。

### Open-all 与权限

1. Section open-all 和 workflow shortcuts 继续打开完整业务页，不被 aggregate filter 污染。
2. ADMIN 完整矩阵通过；OFFICE、WAREHOUSE、HR_MANAGER、WAREHOUSE_MANAGER 按真实
   permission 只看到并访问允许的 drilldown。
3. 隐藏链接不是权限证明。对未授权 target API/URL 直接访问必须返回 403 或本地化
   permission state，响应不得泄漏 total、ids 或业务字段。

## I18n 硬门禁

1. English 与 `zh-CN` 分别执行 Dashboard -> target -> refresh -> back/forward ->
   clear filter 流程；页面全程只能显示当前语言。
2. 覆盖 filter context、scope/review labels、selected state、empty/error、clear/show-all、
   pagination、aria/title/tooltip 和 permission state。
3. 禁止 raw labelKey、raw Dashboard code、raw status enum、API English message 和
   `English / 中文` 双语拼接进入普通 UI。
4. 中文 direct refresh 的 no-JS SSR 首帧必须已是中文；hydration 后文本不能从 English
   变中文。English 同理不得出现中文首帧。
5. catalog parity、unmanaged-string AST、dynamic code mapping 和 unknown-code fallback
   全部通过；不得增加 DOM translator、MutationObserver 或首帧隐藏。

## 视觉与可访问性门禁

1. 功能全矩阵以 1366x768 desktop 完成；再选择高信号页面覆盖：
   - 390x844 mobile；
   - 768x1024 tablet；
   - 1366x768 desktop；
   - 1920x1080 desktop；
   - English 1366x768 真实 200% browser zoom；
   - light 和 dark；
   - en 和 zh-CN。
2. 不要求重复 WEB-DASHBOARD-06 的 44 张 Dock Lane 截图。保留 8-12 张高信号截图，
   至少覆盖 Dashboard、filtered container/import、inventory destination、selected
   load job、exception review、work-hours/wage 和 zero result。
3. 截图必须以原始分辨率逐张查看。记录 filter context、表格/列表、selected item、
   clear action、long English/Chinese text、无覆盖和无页面级横向溢出结论。
4. 自动断言可见文本不裁剪、interactive element 不重叠、focus 可见、mobile 触控目标
   可用、200% zoom 无水平页面溢出；业务表格只允许自身容器滚动。
5. console error、pageerror、hydration mismatch、missing translation、unexpected 4xx/5xx
   和 failed resource 为 0；预期 403 必须由明确测试步骤隔离记录。

## 性能与回归

1. Dashboard 初始请求不得为每个 tile 追加一个浏览器请求；聚合仍由单一 operations
   endpoint 提供。
2. Drilldown 页使用 bounded server pagination，不把全库拉到浏览器过滤；测试一个
   超过首屏 page size 的 fixture。
3. 不引入明显 N+1；API focused test 或 query instrumentation 证明记录数增长不会线性
   增加数据库查询次数。
4. 回归 Dashboard range/month、Dock Lane Strip、Shell/brand、theme/locale、inventory
   adjustment、load scan、attendance import/row deletion、wage files、public browser
   session/CSRF 和目标页普通未筛选入口。

## 自动化文件建议

- 扩展 `apps/api/src/dashboard/dashboard.service.spec.ts`
- 扩展 `apps/api/test/dashboard.e2e-spec.ts`
- 更新目标 list/filter service tests
- 扩展 `apps/web/tests/operations-dashboard-flow.test.ts`
- 增加/扩展目标页 filter helper tests
- 扩展 `apps/web/e2e/dashboard.spec.ts`，或新增
  `apps/web/e2e/dashboard-drilldown.spec.ts`
- 将 click-surface inventory 作为 shared typed test fixture，避免 API/Web/E2E 三份
  无约束字符串副本

## Docker 验证

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
docker compose -f infra/docker/compose.local.yml exec -T worker-python uv run pytest
docker compose -f infra/docker/compose.local.yml --profile e2e build e2e-web
docker compose -f infra/docker/compose.local.yml --profile e2e run --rm e2e-web e2e/dashboard.spec.ts e2e/dashboard-drilldown.spec.ts --project=chromium
scripts/healthcheck.sh
git diff --check
```

若最终没有单独的 `dashboard-drilldown.spec.ts`，按实际 spec 调整命令，但不得省略完整
click-surface matrix。

## 验收标准

1. Machine-readable inventory 覆盖全部 Dashboard click surfaces，新增未登记链接会让测试失败。
2. 每个 aggregate 真实点击后显示同一 predicate 的 matching records 并排除 sentinel；
   每个 record click 打开/选中相同 id。
3. open-all 与 aggregate 行为明确分离；不再用“URL 变化”代替结果验证。
4. Dashboard count、目标 total/ids、effective lifecycle、inventory composite scope、
   timezone、active/deleted 和跨月口径全部一致。
5. ADMIN 与四个业务角色 RBAC、直接 URL/API 负向、strict en/zh-CN、SSR no-flash、
   theme、keyboard、responsive、200% zoom 全部通过。
6. 8-12 张高信号截图已逐张原分辨率检查，console/page/hydration/network/overflow 门禁通过。
7. Docker API/Web/Worker 全量 checks、完整 Chromium click matrix、healthcheck、数据清理和
   `git diff --check` 通过。
8. 只有上述条件全部满足，Dashboard navigation remediation 才能在 Task Index 和完成度
   报告中恢复为 `DONE`。

## 不得关闭任务的情况

- 只断言 `href`、route heading 或 `toHaveURL`。
- 只测试一个 lifecycle lane 或几个人工挑选的 happy paths。
- 目标页仍展示未筛选总列表，或只在客户端隐藏不匹配记录。
- aggregate count 与 list predicate 分别实现且没有一致性测试。
- 只跑 unit/render，不跑真实 nginx/API/PostgreSQL/Chromium。
- 中文 refresh 闪 English、出现 raw code/enum、双语混排或未翻译属性。
- 截图生成但未查看，fixture 未清理，或存在 console/page/hydration 错误。

## 完成输出

1. Click-surface inventory 和逐类通过结果。
2. API count/list consistency、RBAC、i18n/no-flash、浏览器 navigation 证据。
3. 修改文件、Docker test counts、截图绝对路径和逐图结论。
4. fixture 前后数据与零残留检查。
5. known limitations；没有则明确“无已知 Dashboard drilldown navigation 限制”。
6. 更新 `HANDOFF.md`；全部门禁通过时返回 `DONE`。

## 执行结果（2026-07-23 MDT）

`Task-Status: DONE`

- 已建立 shared typed click-surface inventory，完整登记 Work Queue、7 条 lifecycle lane、
  inventory totals/top destinations、load-job aggregates/records、Exception Queue、monthly、
  attendance/wage、五类 Recent Activity、open-all、workflow shortcut 和空/错误动作；Web unit
  会对真实首页链接集合与 inventory 做双向一致性检查，新增未登记链接会失败。
- 专用真实 PostgreSQL fixture 为每个 aggregate 创建 matching 与易混淆 sentinel，覆盖 stored/effective
  lifecycle、active/remaining composite pallet scope、cancelled/adjusted-out exclusion、operational
  timezone 当日边界、active/deleted import 和跨月 wage review。Chromium 先读取 Dashboard count/code/target，
  再验证目标 API total/ids 与可见记录，且 refresh、back/forward、clear、分页、排序、搜索、组合筛选和 zero
  result 均保持同一 predicate。fixture 与五类临时角色账号最终残留均为 0。
- Aggregate、record 与 open-all 行为已明确分离；import/container detail 和 load-job selection 使用稳定
  record id。Inventory top destination 仅对 Dashboard drilldown 使用 `destinationMatch=EXACT`，普通 inventory
  search 继续使用 contains。Load-job list 响应补齐 server-pagination `totalItems`，目标页不在浏览器拉取全库过滤。
- ADMIN 完整矩阵和 OFFICE、WAREHOUSE、HR_MANAGER、WAREHOUSE_MANAGER 直接 API/URL 负向门禁通过：
  未授权 API 返回 403，页面显示当前 locale 的 permission state，不泄漏 total、ids 或业务字段。
- Strict English/zh-CN、no-JS SSR 首帧、hydration no-flash、theme、keyboard/focus、390/768/1366/1920
  responsive、真实 Chrome 200% zoom、可见文本裁剪、交互覆盖和页面级 overflow 门禁全部通过；console error、
  pageerror、hydration mismatch、missing translation、unexpected 4xx/5xx 和 failed resource 均为 0。
- 最终 11 张高信号截图位于
  `/Volumes/xfl/logistics/stripSystem/test-results/web-dashboard-08/`，已逐张按原分辨率检查：
  1. `01-dashboard-en-light-1920x1080.png`：完整英文首页、筛选、tiles/lifecycle 清晰且无覆盖；
  2. `02-dashboard-zh-dark-390x844.png`：中文深色移动首页，长用户名完整换行且无横向溢出；
  3. `03-imports-filtered-en-light-1366x768.png`：筛选上下文、clear action、长文件名和表格完整；
  4. `04-containers-filtered-zh-dark-768x1024.png`：中文深色 tablet 上下文与柜子结果可读；
  5. `05-inventory-destination-en-dark-1366x768.png`：目的仓 exact context、total 与结果清晰；
  6. `06-load-job-selected-zh-light-1920x1080.png`：同 id 装车单选中态、字段和操作区完整；
  7. `07-exception-review-en-light-768x1024.png`：运营复核筛选与目标记录正确；
  8. `08-work-hours-filtered-zh-dark-1366x768.png`：工时筛选与自定义文件选择器完全中文；
  9. `09-wage-filtered-en-light-390x844.png`：工资复核移动布局、上下文与动作无重叠；
  10. `10-zero-result-zh-dark-1366x768.png`：中文筛选空状态、0 totals 与 clear action 诚实一致；
  11. `11-load-job-selected-en-dark-1366x768-zoom-200.png`：真实 200% zoom 下选中记录可用且无页面级横向溢出。
- 性能门禁证明 Dashboard 浏览器初始数据仍只来自单一 operations endpoint；超过首屏大小的 fixture 通过
  server pagination；API focused instrumentation 将 recent records 从 1 增至 75 时，Prisma 与
  container-index 查询调用数保持恒定，recent activity 输出仍 bounded 为 10。
- Docker API production build、lint、typecheck、48 suites / 371 unit、21 suites / 128 E2E；Web
  production build、lint、typecheck、279 unit；Worker 183 pytest；E2E image build和完整 Chromium
  `dashboard.spec.ts` + `dashboard-drilldown.spec.ts` 11/11 全部通过。`scripts/healthcheck.sh`、六服务
  healthy、静态资源、storage 可写、测试后 error/fatal/5xx 日志过滤、零残留和 `git diff --check` 均通过。
- 本 Task 无 schema 变更，因此无 migration；无剩余实现、外部验证或 blocker；无已知 Dashboard drilldown
  navigation 限制。
