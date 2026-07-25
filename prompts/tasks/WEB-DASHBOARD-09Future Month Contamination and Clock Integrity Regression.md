# 执行 WEB-DASHBOARD-09：Future Month Contamination and Clock Integrity Regression

## 优先级与执行状态

- 优先级：P0，Dashboard 显示 2099 年的现场阻塞缺陷。
- 当前状态：DONE（2026-07-24 MDT）。
- 前置任务：`WEB-DASHBOARD-00` 至 `08`、`WEB-OPS-04` 均保持 `DONE`。
- 本 Task 是新的日期完整性回归，不得重开或重做既有 Dashboard 导航、视觉系统、
  Dock Lane Strip、2048px 工作区、品牌或库存事务。
- 只执行本 Task。达到终态后更新本文件、Task Index、完成度报告和 `HANDOFF.md`，
  不得在同一 Session 自动选择另一个 Task。

## 对应用户原始反馈

“仪表盘的时间怎么变成2099年了，制定修复任务。”

产品结论：现场看到的 2099 年不能只用显示格式掩盖。系统必须同时修复污染来源、
自动月份选择、未来完成日期写入边界和页眉运营时钟来源，确保测试数据、错误的浏览器
系统时间或异常业务时间戳都不能再把正常 Dashboard 带到未来年份。

## 必须读取与使用

- `AGENTS.md`、`HANDOFF.md`
- `prompts/agents/business-logic-agent.md`
- `prompts/tasks/WEB-DASHBOARD-01Operations Dashboard Data API.md`
- `prompts/tasks/WEB-DASHBOARD-03Operations Dashboard UI.md`
- `prompts/tasks/WEB-DASHBOARD-08Dashboard Drilldown Full Stack I18n Visual Exit Gate.md`
- `prompts/tasks/WEB-OPS-04Efficient Live Operational Clock.md`
- `prompts/tasks/UNLOAD-WAGE-12Monthly Unloading Summary Blank Export Regression.md`
- `.codex/skills/bestar-handoff/SKILL.md`
- `.codex/skills/bestar-domain/SKILL.md`
- `.codex/skills/nestjs-prisma-api/SKILL.md`
- `.codex/skills/nextjs-pwa-ui/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- `apps/api/src/dashboard/**`
- `apps/api/src/unloading-summary/**`
- `apps/api/src/unloading-wage/**`
- `apps/web/src/components/layout/office-shell.tsx`
- `apps/web/src/components/layout/operational-clock.tsx`
- `apps/web/src/lib/operational-clock-scheduler.ts`
- `apps/web/e2e/unloading-wage.spec.ts`
- Dashboard、运营时钟、unloading wage/summary 的 API/Web/E2E tests
- `scripts/run-dashboard-exit-gate-e2e.sh` 及其精确 fixture cleanup 模式

## 已确认的现场证据与根因

2026-07-24 MDT 已进行只读诊断，未在本次策划 Session 删除或修改业务数据：

1. Host、API container 和 Web container 时间均为 `2026-07-24`，不是服务器或
   Docker 容器系统时间被改成 2099。
2. `dashboard.generatedAt` 使用 API `new Date()`，当前服务端生成时间正常。
3. 本地 PostgreSQL 中存在且只存在一条 `completed_at >= 2030-01-01` 的
   pay-container：
   - id：`cmrwzd3bt02os1xpnwpu4lh4a`
   - pay container：`PC-TRAILER-TR-E2E-1048122`
   - source containers：`ZCSU1048122A`、`TGBU1048122B`
   - status：`SETTLED`
   - `completed_at`：`2099-06-18T20:30:00Z`
   - `created_at`：`2026-07-23`
4. 上述记录具有 `TR-E2E`、`Bestar E2E`、Playwright smoke 等合成测试标记。
   `apps/web/e2e/unloading-wage.spec.ts` 又明确硬编码：
   - `settlementMonth = "2099-06"`
   - `completedAt = "2099-06-18T20:30:00.000Z"`
   该 spec 没有失败安全的 teardown，因此测试数据留在持久化本地业务库。
5. `DashboardService.defaultMonth()` 当前直接按
   `payContainer.completedAt desc` 取全库最大值，所以这条测试记录把 Dashboard
   自动月份推到 `2099-06`。
6. `UnloadingSummaryService.availableSummaryMonths()` 也会无条件收集所有非空
   `completedAt`，异常未来月份可能继续进入可用月份快捷入口。
7. 页眉 `OperationalClock` 虽用服务端 ISO 做 SSR 初值，但 mount 后立即改用
   浏览器 `Date.now()`。本次事故的直接来源是数据库默认月份；但如果办公室电脑的
   系统时间错误，页眉仍可独立显示 2099，因此也必须在本 Task 一并加固。

## 统一业务时间规则

### 服务端权威时间

1. 业务当前时间、运营月份和完成时间合法性统一以服务端时间为准。
2. 运营日期和月份继续使用 `America/Edmonton` 及动态 DST；不得用浏览器 timezone
   或 UTC 月份直接替代运营月份。
3. Dashboard `generatedAt`、页眉运营时钟基线、月份上限和完成时间校验必须来自同一
   可测试的 server clock abstraction；tests 可注入固定 clock，生产代码不得硬编码年份。

### Dashboard 自动月份

1. 无显式 `month` 时：
   - 查找最新的、符合现有已拆完/汇总资格且 `completedAt <= serverNow + tolerance`
     的业务完成月份；
   - 该月份不得晚于 Edmonton 运营当前月；
   - 没有有效历史月份时使用 Edmonton 运营当前月。
2. `month=YYYY-MM` 显式查询继续允许当前月和历史月，必须保持 refresh、URL 和
   Dashboard drilldown 语义。
3. 显式未来月份不得静默回退、截断或伪装成当前月；API/Web 使用稳定错误码
   `DASHBOARD_MONTH_IN_FUTURE` 或等价 typed code，并显示当前 locale 的可操作提示。
4. 未来异常记录不得参与正常 Dashboard monthly summary、wage queue 或默认月份，
   但必须能通过受权限保护的运营复核入口被发现。

### 拆柜完成日期

1. “已拆完”是已经发生的业务事件。以下两个公开写入入口都必须拒绝明显未来时间：
   - container detail `completeContainerUnloading`
   - pay-container `completePayContainer`
2. 允许 Edmonton 当前时间之后最多 5 分钟的传输/时钟容差；超过上限返回稳定
   `UNLOADING_COMPLETION_DATE_IN_FUTURE`，不得写 pay-container、柜子状态、库存、
   correction feedback 或 settlement side effects。
3. 历史日期和合法 backfill 继续允许，并沿用现有 actor、reason、note 和
   correction feedback 审计；不得为了修复未来时间而禁止补录历史拆柜记录。
4. Web 完成表单默认时间改用 server-provided baseline，不直接用错误的浏览器年份
   生成默认值。客户端可做即时提示，但后端校验必须是最终权威。
5. 已存在的未来时间属于数据质量异常，不得在普通读取中静默改写或删除。新增/复用
   operations review code，例如 `UNLOADING_COMPLETION_DATE_IN_FUTURE`，显示记录、
   原完成时间、关联柜号和进入真实柜子详情的动作，由有权限人员修正。

### 月度拆柜汇总与工资

1. `availableMonths`、无显式月份的默认选择、工资结算月份入口和 Dashboard 月份必须
   共用未来日期上限，不得各写一套近似判断。
2. 正常可用月份列表排除未来异常月份；异常数量进入 operations review。
3. 不改变 CAD 300 海柜、CAD 360 美转加、多人分配、已拆完状态集合或已送库语义。
4. 不用 `createdAt`、`updatedAt`、扫描时间或当前月替换合法的历史 `completedAt`。

## 现有 2099 测试残留的安全清理

1. 先做 dry-run provenance report，列出拟清理的 pay-container、source container、
   destination/pallet、temporary unloader、settlement、settlement line、correction、
   generated-file metadata 和 storage artifact 的 id/count。
2. 自动清理必须同时满足多项测试标记，例如：
   - pay container/trailer 使用 `PC-TRAILER-TR-E2E-*` / `TR-E2E-*`；
   - source container 的 company、reason/note 或编号符合该 spec 的合成 fixture；
   - temporary worker 使用 `TEMP-E2E-*`；
   - 关联记录只指向同一 E2E fixture。
3. 不能只凭“年份大于当前年份”删除。任何无法证明为该 E2E fixture、与非测试记录
   交叉关联或 provenance 不完整的记录必须停止自动清理并进入人工复核。
4. 在 PostgreSQL transaction 中按外键安全顺序清理已证明的 E2E 数据；storage 文件
   必须先验证位于允许的 storage root 和该 fixture 路径内。不存在的文件记录为
   warning，不得扩大删除范围。
5. 清理后重复查询：
   - 已确认的 2099 E2E pay-container 和所有关联测试记录为 0；
   - 对应 E2E storage artifact 为 0；
   - 非 E2E 业务记录的 id/count/关键时间戳与清理前一致。
6. 把脱敏 before/after counts、判定条件和结果写入简短验证报告；不得记录数据库
   密码、token、真实客户数据或未脱敏人员信息。

## E2E 数据隔离与失败安全

1. `unloading-wage.spec.ts` 不得再使用 2099 或其他未来月份规避冲突，也不得依赖
   持久化本地业务数据恰好为空。
2. 优先在 disposable Docker E2E database/schema 中运行会生成 settlement 的测试。
   如果本 Task 沿用共享 local stack，则必须提供与
   `scripts/run-dashboard-exit-gate-e2e.sh` 同等级的 runner：
   - 每次运行唯一前缀和随机临时账号；
   - preflight 清理同前缀 stale fixture；
   - shell `trap` + Playwright `try/finally` 双层 teardown；
   - Playwright 失败、断言失败和普通进程中断时仍执行清理；
   - 独立清理 generated storage artifacts；
   - 退出前执行 machine-readable residual audit，非 0 即整个命令失败。
3. 使用 Edmonton 当前月或唯一的合法历史月。若测试结算会接触同月其他数据，必须
   使用 disposable database，或在写入前证明该专用历史月份没有非 fixture 数据；
   不得 supersede、结算或改写真实业务工资记录。
4. 所有创建的 users/roles、temporary unloaders、containers、pay containers、
   settlements、generated files、corrections 和 storage files 都必须由 fixture registry
   跟踪并按 id 清理，不能只删顶层 container。
5. 新增 stale-fixture audit，扫描已知 E2E marker。未来任何相关 E2E 完成后残留大于
   0 都必须失败，不能只打印 warning。
6. 不得新增可在 production 暴露的 test-only HTTP cleanup/seed endpoint。

## 页眉运营时钟完整性

1. 保留 `OperationalClock` 最小 Client leaf、单 timer、formatter cache、
   hidden/narrow pause 和 `WEB-OPS-04` 的性能边界。
2. 首个 HTML 继续使用服务端 ISO。mount 后用该 server epoch 加单调 elapsed time
   推进显示，不得在每秒 tick 直接把浏览器 wall clock 当成权威时间。
3. 页面从 hidden/sleep 恢复时，以有界低频方式重新取得服务端时间基线。可以复用
   已有受保护的轻量 response/server timestamp，或增加克制的 clock sync contract；
   禁止每秒 API polling、WebSocket、SSE 或整页刷新。
4. client wall clock 只用于漂移诊断。与 server baseline 相差超过 5 分钟时，继续显示
   server-authoritative time，并显示紧凑、可关闭或状态型的本地化“设备时间不同步”
   提示；不得显示 raw exception 或技术说明占据大量空间。
5. locale/theme/route 切换、React Strict Mode、visibility/breakpoint 变化后仍只能有
   一个 timer 和一个有界 sync lifecycle；unmount 后 timer/listener/request 全部清理。
6. Dashboard filter month、`generatedAt` 和运营时钟是三个明确字段：
   - `month` 是业务统计月份；
   - `generatedAt` 是 API 生成时间；
   - Operational time 是 server-authoritative live clock。
   UI 和测试不得把三者互相替代。

## Strict i18n 硬门禁

1. 新增的未来月份、未来完成日期、设备时钟漂移、异常复核、空状态、错误、按钮、
   tooltip、aria/title 和 cleanup-facing operator copy 全部进入 typed `en` /
   `zh-CN` catalog。
2. API 只返回 stable code、enum、timestamp、id/count、labelKey 和 raw business data，
   不返回给普通 UI 直接显示的英文句子。
3. Web 必须通过 explicit translator 和 typed code mapping 显示；禁止 raw
   `DASHBOARD_MONTH_IN_FUTURE`、`UNLOADING_COMPLETION_DATE_IN_FUTURE`、status enum
   或 API English message 进入普通 UI。
4. English 页面只显示英文 UI，中文页面只显示中文 UI；不得双语拼接。
5. 中文 direct refresh/no-JS SSR 首帧必须是中文，hydration 后不得先闪英文再翻译；
   English 同理不得闪中文。
6. 日期时间按当前 locale 格式化，但 container number、destination、trailer 和原始
   timestamp 属于业务数据，不得翻译或改写。
7. catalog parity、unmanaged-string AST、dynamic code mapping、unknown-code fallback
   和 no-flash E2E 全部通过；不得恢复 DOM translator、MutationObserver 或首帧隐藏。

## API、Web 与数据实现要求

1. 抽出可复用的 server clock/future-date policy，避免 Dashboard、unloading wage 和
   unloading summary 分别比较 `new Date()`。
2. 时间比较使用真实 instant；月份边界使用 Edmonton timezone helper。覆盖月末、
   年末、UTC/MDT/MST 跨日和 DST 边界。
3. 默认月份查询必须在数据库谓词中排除未来记录，不能先把全库记录拉到 Node 再过滤。
4. operations review 查询使用 bounded pagination、稳定排序、精确 RBAC；不得泄漏
   storage path、内部 stack、token 或 secret。
5. 正常 Dashboard 聚合仍由单一 operations endpoint 提供，不为每个 tile 增加请求。
6. 无 schema 需求时不得新增 migration。若确实需要 schema，必须解释必要性、提供
   可回滚 Prisma migration，并验证现有库和空库。
7. 不修改工资费率、托盘计算、柜子 lifecycle、库存同步、扫码或 loading transaction。

## 必须新增的自动化

### API unit / integration

1. 固定 server clock 为 `2026-07-24`：
   - 只有未来完成记录 -> 自动月份为 `2026-07`；
   - 同时有 `2026-06` 和 `2099-06` -> 自动月份为 `2026-06`；
   - 没有完成记录 -> 自动月份为 `2026-07`；
   - 显式 `2026-06` 保持；
   - 显式 `2099-06` 返回稳定 future-month error。
2. `serverNow + 5 minutes` 合法，超过 tolerance 非法；两个 completion endpoint 都
   无 DB/库存/status/audit side effects。
3. historical backfill 仍成功并保留 actor/reason/correction audit。
4. `availableMonths` 排除未来异常月份，future review count/list 正确。
5. Edmonton 月末、年末、MST/MDT 和 DST 边界。
6. 查询 instrumentation 证明 default/available month 没有全表读入或 N+1。

### Web unit

1. server initial epoch + monotonic elapsed，不受 mount 时 `Date.now()=2099` 影响。
2. hidden/narrow pause、resume bounded resync、unmount cleanup、Strict Mode 单 timer。
3. client/server drift warning 的 en/zh-CN、unknown code fallback 和 a11y。
4. future month/completion error mapping、completion form server baseline 和
   `generatedAt`/month/clock 字段不混用。

### 真实 Docker PostgreSQL / Chromium

1. 在隔离 fixture 中同时创建一个合法历史完成记录和一个 2099 异常记录；访问 `/`
   后 Dashboard 自动月份只能是合法历史月或当前月，不能是 2099。
2. operations review 能看到 2099 异常并进入正确柜子；普通 monthly summary 和
   available month shortcut 不显示 2099。
3. 通过 init script 模拟浏览器 wall clock 为 2099，页眉 `<time>` 仍与 server
   baseline 在容差内，并显示当前 locale 的 drift state；不得把业务月份改成 2099。
4. English 与 `zh-CN` 分别执行 direct load -> hydration -> refresh -> locale switch；
   验证无双语、无 raw code、无英文闪现。
5. 1366x768 desktop、390x844 mobile、light/dark 至少保留 6 张高信号截图，覆盖
   Dashboard、future-date review、完成时间错误和 client clock drift。逐张按原始分辨率
   查看，确认无错位、裁切、覆盖或页面级横向溢出。
6. console error、pageerror、hydration mismatch、missing translation、unexpected
   4xx/5xx 和 failed resource 为 0；预期 400 必须由明确测试步骤隔离断言。
7. spec 成功和故意失败探针后都执行 cleanup，fixture/user/storage residual 为 0，
   且非 fixture 数据前后不变。

## Docker-only 验证

所有 Node、Prisma、Worker、build、test 和 Playwright 命令必须在 Docker 中运行；
不得在宿主安装或修复 `node_modules`、Jest、pnpm 或 Python venv。

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
scripts/run-dashboard-clock-integrity-e2e.sh
scripts/healthcheck.sh
git diff --check
```

若实现采用不同 runner 文件名，按实际文件调整命令；不得直接运行旧
`unloading-wage.spec.ts` 绕过 cleanup supervisor。

## 手工验证

1. 记录 host/API/Web container 当前时间，确认同为真实当前日期。
2. 使用 ADMIN 或有 Dashboard/operations review 权限的账号打开 `/`，不带 `month`。
3. 确认月份不再为 `2099-06`，页眉运营时间为当前 Edmonton 时间。
4. 打开未来日期复核项，确认能看到异常记录和真实柜子入口，但普通月度汇总不把
   2099 当成可用月份。
5. 在拆柜完成表单输入明显未来时间，确认保存被拒绝、文案按当前 locale 显示，柜子
   状态、库存、工资和审计记录均未改变。
6. 输入合法历史完成时间，确认保存和审计仍正常。
7. 将浏览器/Playwright wall clock 模拟为 2099，确认页眉继续显示 server-authoritative
   当前时间，并出现单语 drift state。
8. 运行 unloading wage E2E 的成功与失败清理探针，确认 PostgreSQL 和 storage 零残留。

## 验收标准

1. 已确认的 2099 E2E fixture 在严格 provenance 校验后被精确清理，非测试数据不变。
2. `unloading-wage.spec.ts` 不再硬编码未来月份，成功/失败后 DB、账号和 storage
   residual 都为 0。
3. Dashboard 自动月份、unloading summary available months 和 wage month 入口不会被
   未来完成记录控制；合法历史月份仍正常。
4. 两个拆柜完成入口拒绝超过 5 分钟容差的未来日期，且无部分 side effects；历史
   backfill 和审计不回归。
5. 页眉运营时钟以 server baseline + monotonic elapsed 推进；浏览器 wall clock 为
   2099 时仍显示真实 server time，并保留 WEB-OPS-04 单 timer/内存/性能约束。
6. 未来异常记录可通过受权限保护的 operations review 审阅，不被静默删除或隐藏。
7. Strict en/zh-CN、SSR no-flash、theme、responsive、a11y 和 6 张逐图视觉门禁通过。
8. Docker API/Web/Worker 全量 checks、真实 PostgreSQL/Chromium、healthcheck、日志、
   精确清理、非 fixture 数据不变和 `git diff --check` 全部通过。

## 不得关闭任务的情况

- 只把 `2099` 替换为 `2026`、只改格式化或只删当前一条数据库记录。
- 默认月份仍按全库最大 `completedAt`，只是 Web 临时隐藏未来年份。
- 只在前端校验未来日期，API 仍可写入。
- 自动删除所有未来日期记录，或无法证明当前删除对象是 E2E fixture。
- E2E 仍写共享业务库且没有失败安全 cleanup、storage cleanup 和 residual audit。
- 页眉仍每秒信任客户端 `Date.now()`，或新增每秒 API polling。
- 中文 refresh 闪英文、出现 raw code/enum、双语混排或未翻译属性。
- 只跑 unit，不跑真实 Docker PostgreSQL/nginx/Chromium；截图生成但未逐张查看。

## 完成输出

1. 根因修复摘要和 server clock/month/future-date policy。
2. 当前 2099 fixture 的脱敏 dry-run、清理前后 counts 和非 fixture 不变证据。
3. E2E isolation/cleanup 结构、故意失败探针和零残留结果。
4. 修改文件、migration 状态、Docker test counts、日志/health/diff 结果。
5. 6 张高信号截图绝对路径及逐图结论。
6. known limitations；没有则明确“无已知 2099 Dashboard 时间/月 regressions”。
7. 更新 Task Index、完成度报告和 `HANDOFF.md`；全部门禁通过时返回 `DONE`。

## 执行结果（2026-07-24 MDT）

### 根因与修复

- 已确认 host、API、Web 的系统时间均为 2026-07-24；现场 2099 的直接根因是旧
  `unloading-wage.spec.ts` 在共享 PostgreSQL 留下 `2099-06` 完成记录，而 Dashboard
  默认月份采用全库最大 `completedAt`。页眉时钟另有 mount 后信任浏览器
  `Date.now()` 的独立完整性风险。
- 新增可注入 `ServerClock` / `BusinessTimeService`，统一 Edmonton 运营月份、月范围、
  `serverNow + 5 minutes` 完成时间容差和稳定错误码。Dashboard、拆柜月报、拆柜工资、
  operations review、health 与 Web 表单基线共用该政策；无 schema 变化、无 migration。
- Dashboard 默认月份和正常月度读取在 Prisma 查询谓词中排除未来异常；显式未来月份
  返回 typed error，不静默回退。未来完成记录仍可由有权限人员在 operations review
  分页、稳定排序并进入真实柜子详情复核。
- 两个拆柜完成写入口均在 transaction 及所有状态、库存、工资、correction/audit
  side effects 前执行相同的未来日期校验；历史 backfill 和既有审计语义保持。
- 页眉使用服务端 epoch 加 `performance.now()` 单调 elapsed 推进；保留单 timer、
  hidden/narrow pause、恢复后的有界 health resync、unmount/abort 清理。浏览器 wall
  clock 仅用于超过 5 分钟的本地化 drift 状态，不再驱动显示时间或业务月份。

### 2099 fixture 精确清理

- `scripts/cleanup-web-dashboard-09-fixture.sh` dry-run 同时验证目标 id、pay-container /
  trailer 前缀、source container 合成标记、temporary worker、关联归属、时间戳和
  storage root；任一 provenance 或非目标交叉关联不符即停止。
- 清理前：pay container `1`、source containers `2`、destinations/pallets `2/2`、
  temporary unloaders/assignments `2/2`、settlements/worker summaries/lines
  `2/4/4`、corrections `13`、generated-file metadata/storage artifacts `4/4`。
- 数据库删除在单一 transaction 中完成；4 个 artifact 仅在验证其位于精确允许路径后
  删除。两个被旧 fixture 共享的合成 actor 未越权删除。
- 清理后：目标 pay container、source containers、temporary unloaders、settlements、
  metadata、artifact 均为 `0`；`completed_at >= 2030-01-01` 为 `0`；非 fixture
  pay-container count 与有序 id/status/completion fingerprint 不变。最终重复审计
  `futurePayContainers=0`、`targetPayContainer=0`、`dedicatedMonthRecords=0`。
- 脱敏报告：
  `docs/reports/web-dashboard-09-e2e-cleanup-2026-07-24.md`。

### E2E 隔离与浏览器验收

- 工资 E2E 改用预检为空的合法历史专用月 `2001-01`、每次唯一前缀/账号/worker/
  trailer，fixture registry 追踪所有 id；Playwright `try/finally` 与 shell `trap`
  双层清理 DB、账号和 storage。
- `scripts/run-web-dashboard-09-e2e.sh` 的故意失败探针按预期非零退出且完成清理；
  随后 Chromium 成功组 `2 passed`。最终 machine-readable audit：
  `fixtureRecords=0`、`clockFixtureRecords=0`、`dedicatedMonthRecords=0`。
- runner 的 shell `EXIT` trap 另行调用 cleanup-only Chromium 入口并 `1 passed`，
  独立重复删除成功/失败/clock 三类前缀；这与 spec `try/finally` 形成双层 teardown，
  同时保留原始命令退出状态。
- PostgreSQL/Chromium 覆盖合法历史记录与 2099 异常共存、默认月份、future review
  真实详情入口、summary shortcut 排除未来月份、浏览器 wall clock=2099、完成时间
  拒绝、en/zh-CN direct load/hydration/refresh/locale、RBAC、console/page error 与
  cleanup。

### 自动化与运行状态

- Docker API production build、lint、typecheck 通过；API unit：
  `49 suites / 381 tests passed`。
- Docker API targeted E2E：`2 suites / 9 tests passed`；完整 E2E：
  `21 suites / 128 tests passed`。
- Docker Web production build、E2E image build、lint、typecheck 通过；Web unit：
  `280 tests passed`。
- Docker Worker：`183 passed`。
- `scripts/healthcheck.sh` 通过；PostgreSQL、Redis、API、Web、nginx、Worker 均健康，
  API health、首页、Next.js static assets 和 storage writability 均通过。
- Prisma `36 migrations found`、database schema up to date；本 Task 无新增 migration。
- host/API/Web UTC 分别为 `2026-07-24T17:58:49Z` /
  `2026-07-24T17:58:50Z` / `2026-07-24T17:58:50Z`。
- 最终服务日志扫描没有 Task 引入的 unexpected 4xx/5xx、exception、hydration、
  translation 或 resource failure；`git diff --check` 通过。

### 视觉证据（均已按原始分辨率逐张查看）

1. `/Volumes/xfl/logistics/stripSystem/test-results/web-dashboard-09/01-dashboard-en-light-1366x768.png`
   — 英文浅色 Dashboard 月份/服务端时间正确，无 2099、错位或页面级横向溢出。
2. `/Volumes/xfl/logistics/stripSystem/test-results/web-dashboard-09/02-clock-drift-en-dark-1366x768.png`
   — 英文深色页眉继续显示服务端时间，设备时间漂移状态紧凑可见，无 raw code。
3. `/Volumes/xfl/logistics/stripSystem/test-results/web-dashboard-09/03-future-review-en-light-1366x768.png`
   — 英文未来日期复核记录、原时间与真实柜子动作完整可见，无 storage/internal 泄漏。
4. `/Volumes/xfl/logistics/stripSystem/test-results/web-dashboard-09/04-completion-error-en-dark-1366x768.png`
   — 明显未来完成时间被拒绝并显示单语可操作文案，无技术错误码或布局覆盖。
5. `/Volumes/xfl/logistics/stripSystem/test-results/web-dashboard-09/05-dashboard-zh-light-390x844.png`
   — 中文浅色 mobile direct load/hydration 后单语、月份与运营时间正确，无页面级溢出。
6. `/Volumes/xfl/logistics/stripSystem/test-results/web-dashboard-09/06-future-review-zh-dark-390x844.png`
   — 中文深色 mobile 复核表在窄屏换行后时间与动作仍完整可见，无裁切或英文闪现。

### Known limitations

无已知 2099 Dashboard 时间/月 regressions。历史库仍保留被其他旧 fixture 共享的
合成 actor 账号；它们不含未来完成记录且不属于本次可证明的精确删除目标，故未自动
扩大清理范围。
