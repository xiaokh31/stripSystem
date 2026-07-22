# 执行 WAGE-HOURS-04：Attendance Row Audited Deletion and History

## 优先级与前置任务

- 优先级：P1 HR 工时记录可审计删除。
- 前置任务：`WAGE-HOURS-01`、`WAGE-HOURS-02`、`WAGE-HOURS-03` 均达到受监督终态。
- 本 Task 是 API、数据库、Worker 生成输入和 Web 的完整 vertical slice；不得只增加删除按钮或只物理删数据库行。
- 本 Task 完成后，下一项只能执行 `WAGE-HOURS-05Full Stack Workbook Visual Exit Gate.md`。

## 对应用户原始需求

“记录可删除，不过需要记录删除人。增加历史记录。”

本 Task 将“记录”明确为已解析的单个员工每日工时行（`AttendanceRow`）。删除某一个 punch、恢复删除行、删除整个
attendance import 均不在本 Task 范围。若产品以后需要这些能力，必须另立需求，不能在本 Task 中暗自扩展。

## 必须读取与使用

- `AGENTS.md`、`HANDOFF.md`、`CONTEXT.md`
- `prompts/agents/business-logic-agent.md`
- `docs/product/02-work-hours-and-unloading-wage-settlement.md`
- `docs/architecture/02-data-model.md`
- `docs/architecture/04-api-contracts.md`
- `docs/architecture/09-account-role-permission-management.md`
- `docs/runbooks/work-hours-settlement-regression.md`
- `prompts/tasks/WAGE-HOURS-01Attendance Punch Parity Calculation Contract.md`
- `prompts/tasks/WAGE-HOURS-03Employee Monthly Attendance Review UI.md`
- `.codex/skills/bestar-handoff/SKILL.md`
- `.codex/skills/auth-rbac/SKILL.md`
- `.codex/skills/nestjs-prisma-api/SKILL.md`
- `.codex/skills/nextjs-pwa-ui/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- `apps/api/prisma/schema.prisma`
- `apps/api/src/attendance/**`、attendance auth/default-RBAC 和 API unit/e2e tests
- `apps/worker-python/src/worker_python/wage/**` 和 wage tests
- `apps/web/src/app/work-hours/page.tsx`、`apps/web/src/components/wage/**`、API client、typed i18n catalogs 和
  `apps/web/e2e/work-hours.spec.ts`

## 已确认现状与风险

1. `AttendanceRow` 当前没有 deleted actor/time/reason，也没有 attendance-row event history。
2. `POST /attendance-imports/:id/parse` 当前先 `deleteMany` 全部 rows 再重建；简单增加 `deletedAt` 会在重新 Parse 后复活。
3. `generateWageRecord` 当前让 Worker 从原始 `.xls` 再次解析；只过滤数据库查询不能阻止被删行进入新工资表。
4. attendance 只有 read/create/parse/generate 权限；不能用 read 或 generate 隐式授权删除。
5. 原始 `.xls`、raw row 和历史 generated files 都是审计证据，不能因删除当前结算行而删除或覆盖。

## 权威业务语义

1. 删除是软删除：该行退出当前 active settlement，但数据库行、`rawJson`、punches、calculation method/intervals、
   hours、warnings/errors 和原始上传文件全部保留。
2. 删除必须提交非空 reason；删除人只能取当前 JWT authenticated actor，绝不接受 body/query 中的 user id。
3. 历史事件是 append-only，至少保存 import id、row id/row key、employee id/name/department、work date、punches、
   gross/lunch/net、method/intervals、issues、actor id、actor display snapshot、reason 和 occurredAt。
4. 用户后来改名、停用或失去角色，不得导致历史中“谁删除的”消失。User 外键可保留，但事件必须有耐久显示快照。
5. 同一行重复删除为幂等结果，不得产生第二条 DELETED event；跨 import row id、未知 id 和已不存在 import 不得修改数据。
6. 默认 Parse result、employee summary、active counts 和新工资表只使用未删除 rows；删除历史由独立字段/endpoint 显式读取，
   不得把 deleted rows 混进 active list 后让 Web 自己过滤。
7. 重复 Parse 必须重放 durable tombstones，不得复活已删除行、丢失 actor/reason/history 或把它算回 active totals。
8. 删除前生成的文件保持原 SHA、生成者、时间和下载审计，不做文件清理或原地改写；受影响的 wage workbook/task report
   标记为 `SUPERSEDED` 或等价 stale 状态，并在 UI 清晰显示需要重新生成。
9. 新工资表必须基于服务端持久化 active rows 或等价的 server-controlled deletion overlay。禁止只重解析原始 `.xls` 后忽略 tombstone。
10. queued/running Parse 或 wage generation 与删除必须通过 row lock、job guard、revision/snapshot 或同等事务机制安全串行化；
    不允许删除响应成功但同时生成仍标为 current 的旧数据文件。

## 数据库与迁移要求

1. 增加 Prisma migration，支持当前数据库和空数据库部署；不要手改 generated Prisma client。
2. `AttendanceRow` 增加可快速过滤 active rows 的删除时间/删除人/原因字段或等价 tombstone 关系，并建立 import + deleted state 索引。
3. 增加专用 append-only attendance-row audit event（推荐 `AttendanceRowAuditEvent` + stable `DELETED` event code）或一个
   能完整满足本 Task 不可变快照要求的既有审计模型扩展。不能只依赖可被覆盖的 `updatedAt`。
4. Event/Tombstone 必须能在 Parse rebuild 时保留；不得使用会被 `attendanceRow.deleteMany` cascade 清除的唯一历史来源。
5. 用户删除/停用策略与 actor relation 必须遵守现有 User 审计规则，历史 display snapshot 不随用户资料更新。
6. 删除、event、active aggregates 和 generated-file stale transition 在同一个数据库事务中提交或整体回滚。

## API、生成与权限要求

1. 新增 dedicated permission `attendance.rows.delete`，默认只给 `ADMIN`、`HR_MANAGER`；不给 `SYSTEM`、
   `WAREHOUSE_MANAGER`、`OFFICE`、`WAREHOUSE`，并更新 permission seed/default-RBAC/route matrix/tests。
2. 提供具名、稳定的 API contract，建议：
   - `DELETE /api/attendance-imports/:id/rows/:rowId`，body 含 validated `reason`；
   - `GET /api/attendance-imports/:id/row-history`，使用 `attendance.read`。
3. Delete response 返回 stable code、deleted/alreadyDeleted、activeRowCount、deletedRowCount、受影响 generated file ids/status，
   以及可立即刷新当前 employee/import 的必要数据；不要返回本地 storage path。
4. History response newest-first，支持 bounded pagination，返回稳定 event code/raw values；actor 只返回安全的 id/display label，
   不泄漏 password/session/token/internal metadata。
5. Parse-result 明确返回 active rows 和 active/deleted counts。active employee/day/warning/error summaries必须与后端 active scope 一致。
6. 改造 generation input，使 Worker 写入的是数据库 active rows 或由 API 生成的受控 normalized payload；原始文件仍用于 SHA/provenance，
   但不再能绕过删除结果。Worker/API tests 要证明 deleted row 不出现在 `.xls` 对应员工日期/工时中。
7. 解析失败不得清除现有 tombstone/history；重复 Parse 成功后 event 数量、actor/reason、deleted count 和 active generation 结果不变。
8. 对 running async jobs 使用稳定冲突码和可恢复 UI 文案；不得静默等待无限时间或返回假成功。

## Web 交互要求

1. 在 WAGE-HOURS-03 的 employee monthly rows 中，为有 `attendance.rows.delete` 的用户提供行级删除命令；read-only 用户仍可看历史，
   但看不到可执行删除控件。
2. 删除前使用可访问确认 dialog，明确显示 employee name/id、work date、全部 punches 和将被排除的 calculated hours。
3. Dialog 要求输入删除原因；提交期间防重复点击，展示 success/error/live status，成功后从 API 刷新 rows、summary、counts、history 和 file states。
4. 删除后保持当前 attendance import 和 employee selection；若该员工没有 active rows，显示本地化 empty state，并允许查看其删除历史。
5. 增加“删除历史”视图，newest-first 显示 employee、date、punch snapshot、hours、deleter、time、reason 和 event status；
   deleted data 与 active payable rows 必须视觉上明确分开。
6. stale/superseded 历史工资文件保留在 generated-file history，并显示“数据删除后需重新生成”的状态，不允许被误认为当前版本。
7. 320/390 mobile、768 tablet、1366/1920 desktop、200% zoom 下无遮挡或 page-level overflow；历史表可使用 bounded scroller。

## I18n 100% 硬门禁

1. 删除按钮、确认 dialog、reason label/validation、history columns、empty/loading/success/error、stale file、permission、tooltip、
   title、aria-label 和 live status 全部进入 typed `en` / `zh-CN` catalogs。
2. API event/error/permission/status code 只返回 stable raw code，Web 使用窄范围 mapping；不得显示 raw key、raw enum 或 API English sentence。
3. Employee/name/id/department、punch value、reason 和 actor display 是业务原始数据，不翻译；相邻 UI 文本必须翻译。
4. English 不显示中文 UI；中文不显示 English fallback 或双语拼接。SSR first frame、hydration、refresh、dialog、delete、history
   pagination、locale switch 全程保持目标单语。
5. 不得为通过 i18n gate 添加宽泛例外、DOM translation walker 或隐藏文本。

## 测试要求

1. Prisma migration 从现有数据库和空数据库 deploy/status 通过。
2. API unit/e2e 覆盖：HR/Admin success、read-only/other roles 403、JWT actor、required reason、wrong import/not found、幂等重复、
   transaction rollback、active/deleted counts、immutable snapshot、actor rename/deactivate、history pagination/order。
3. 覆盖 repeated Parse 不复活、不重复 event、不丢 reason；Parse failure 保留 tombstone；queued/running parse/generate race 返回稳定结果。
4. Worker/API integration 使用 fixture 删除一条已知 employee-day row，再生成/download `.xls`，证明该日期/工时被排除，其他员工和 Sheet 不变；
   删除前的 generated file 仍有原 SHA/audit 且标为 stale/superseded。
5. Web unit tests 覆盖 permission gate、reason validation、API code mapping、selected employee stability、active/history separation 和全部 i18n keys。
6. Docker Playwright 用真实 API 执行 delete -> history -> refresh -> reparse -> generate 流程，覆盖 `ADMIN`/`HR_MANAGER`、read-only、
   en/zh-CN、desktop/mobile/200% zoom，无 failed request、pageerror、console/hydration/missing-translation error。
7. 测试创建的用户、import、rows、events、generated DB records 和非证据 storage 必须清理；绝不改动 `samples/wage`。

## 非目标

- 不物理删除 attendance row、原始 `.xls`、raw row 或历史 generated file。
- 不实现单个 punch 的增删改、deleted row restore、attendance import 删除或 bulk delete。
- 不新增薪资税、加班、假期、员工账号绑定或拆柜工资行为。
- 不修改 odd/even/lunch 规则和工资模板格式算法，除非本 Task 发现直接回归并重跑前置门禁。

## Docker 验证

```bash
docker compose -f infra/docker/compose.local.yml up -d --build
docker compose -f infra/docker/compose.local.yml exec -T worker-python uv run pytest
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api lint
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api typecheck
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api test --runInBand
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api test:e2e --runInBand
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api prisma migrate status
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web lint
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web typecheck
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web test
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web build
docker compose -f infra/docker/compose.local.yml --profile e2e build e2e-web
docker compose -f infra/docker/compose.local.yml --profile e2e run --rm e2e-web e2e/work-hours.spec.ts --project=chromium
scripts/healthcheck.sh
git diff --check
```

## 验收标准

1. 授权 HR/Admin 可以删除一个 active employee-day row；数据库行和原始证据未物理删除，新 summary/工资表不再计入。
2. 历史明确显示删了什么、谁删除、何时删除和原因；actor 来自 JWT 且用户资料变化后仍可读。
3. 重复删除幂等；重复 Parse 不复活、不重复历史；并发 Parse/Generate 不产生错误 current output。
4. 删除前 generated files 保留原审计并成为 stale/superseded；删除后新文件只使用 active rows。
5. `attendance.rows.delete` RBAC 前后端一致，history read 与 mutation permission 分离，所有跨角色测试通过。
6. strict i18n、mobile/desktop/200% zoom、accessibility 和真实浏览器流程通过。
7. Migration、Worker/API/Web Docker checks、focused E2E、healthcheck 和 diff check 全部通过。
8. 产品规范、架构文档、Task Index、completion report、regression runbook 和 `HANDOFF.md` 同步真实终态。

## 完成输出

- 列出 schema/migration、API routes/codes、permission mapping、generation source 改造、Web history UI 和精确 changed files。
- 列出实际测试数量、数据库/浏览器证据、临时数据清理和 generated file 前后 SHA/status 证据。
- `HANDOFF.md` 记录 remaining/external/blocker；无剩余项时下一 Task 只能是 WAGE-HOURS-05。

## 2026-07-22 受监督完成证据

- 状态：`DONE`。Prisma migration 新增 active-row tombstone、`data_revision` 和
  `attendance_row_audit_events` 不可变快照；`attendance.rows.delete` 只默认授予 `ADMIN` / `HR_MANAGER`。
- API 已交付 `DELETE /api/attendance-imports/:id/rows/:rowId` 与
  `GET /api/attendance-imports/:id/row-history`。删除、审计事件、active aggregates、旧文件
  `SUPERSEDED` 状态在同一事务提交；重复删除、重 Parse、失败回滚、active job 冲突和 generation revision race
  均有稳定结果。
- Worker generation 改为消费 API 从持久化 active rows 生成的 normalized JSON；真实 fixture 集成测试证明被删
  employee-day 在新 `.xls` 中为四个 `/`，未删除员工和 unsupported driver Sheet 不变。
- Web 已增加 permissioned 行级确认 dialog、必填 reason、active/history 分区、newest-first bounded history、
  stale 文件状态及完整 typed `en` / `zh-CN` 文案。有效输入会即时清除旧 validation error。
- Docker 结果：API 41 suites / 333 unit、21 suites / 122 E2E；Web 262 unit、lint、typecheck、production build；
  Worker 183 pytest、定向 5 pytest 和 Ruff；现有库及全新临时库全部 34 migrations；healthcheck 和
  `git diff --check` 均通过。
- Chromium 完整 `work-hours.spec.ts` 5/5 通过；最终 UI 修正后删除场景再跑 1/1。真实流程验证 HR UI 与
  ADMIN API 删除、read-only 无 mutation、refresh、reparse、generate、download、双语、390px mobile 和真实
  200% zoom。删除后数据库为 388 active / 2 deleted / 2 events，两个 event 分别保留 HR 与 ADMIN actor
  display snapshot；随后精确清理。
- 人工审阅证据：`test-results/wage-hours-04/delete-dialog-en-desktop.png`、
  `history-zh-CN-390x844.png`、`history-en-1366x768-zoom-200.png`。源 fixture SHA 保持
  `4c3a5c0750e04f99cd614da033d54d948b5fd1b72e0ffec4f19a3d35c9f682b3`，工资模板 SHA 保持
  `6f2fb31f54e7cca39e696c11e8891f0a6e36041c28b98f1d287f703f9ecf375a`。
- E2E import、390 rows、2 events、generated DB records、测试 users/roles 与精确 import 生成目录已清理；
  清理后 import/rows/events/files/users/roles 均为 0。原始上传证据与 `samples/wage` 未删除、未修改。
- 无 remaining work、external verification 或 blocker。下一项只能执行
  `WAGE-HOURS-05Full Stack Workbook Visual Exit Gate.md`；本 Session 未启动该 Task。
