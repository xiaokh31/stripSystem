# 执行 WAGE-HOURS-07：Attendance Import Audited Deletion

## 优先级与执行边界

- 优先级：P1，HR 工时结算导入批次可审计撤销。
- 前置任务：`WAGE-HOURS-01` 至 `WAGE-HOURS-06` 均已达到监督终态 `DONE`；保留其工时计算、工作簿保真、
  employee-day 行删除、办公室文件可见性和回归证据，不得重跑或推翻。
- 本 Task 是数据库、API、异步任务、Web、RBAC、审计和 strict i18n 的完整 vertical slice；不得只增加前端按钮，
  也不得只把 import 从列表中过滤。
- 当前工作区包含 PUBLIC-DEPLOY-01/02 的未提交安全和浏览器会话成果。必须阅读 `git status`、保留并适配现有修改，
  不得 reset、checkout、覆盖或回退 HttpOnly session、CSRF、public-mode 和 Tunnel contract。
- 只执行本 Task。完成后更新产品规范、Task Index、完成度报告、回归 runbook 和 `HANDOFF.md`，不得自行启动下一个 Task。

## 对应用户原始需求

“工时页面中，增加一个功能，可删除导入的考勤记录。”

产品口径：这里删除的是一次完整的 `AttendanceImport`，不是 WAGE-HOURS-04 已实现的某位员工某一天
`AttendanceRow` 删除。删除后，该导入从正常工时结算列表、汇总、解析、生成和下载流程退出；但按照
`AGENTS.md` 的强制规则，原始上传 `.xls`、SHA-256、解析行、行删除历史、生成文件记录/字节和异步任务证据必须保留。
因此本功能是带删除人、时间、原因和不可变事件的软删除，不是物理清理。

## 必须读取与使用

- `AGENTS.md`、`HANDOFF.md`、`CONTEXT.md`
- `prompts/agents/business-logic-agent.md`
- `docs/product/02-work-hours-and-unloading-wage-settlement.md`
- `docs/architecture/02-data-model.md`
- `docs/architecture/04-api-contracts.md`
- `docs/architecture/09-account-role-permission-management.md`
- `docs/runbooks/work-hours-settlement-regression.md`
- `prompts/tasks/WAGE-HOURS-04Attendance Row Audited Deletion and History.md`
- `prompts/tasks/WAGE-HOURS-06Office Wage File Download Visibility.md`
- `prompts/tasks/IMPORT-DELETE-01Cascade Storage File Cleanup.md`，只用于识别范围差异；不得复制其物理清理语义
- `.codex/skills/bestar-handoff/SKILL.md`
- `.codex/skills/auth-rbac/SKILL.md`
- `.codex/skills/nestjs-prisma-api/SKILL.md`
- `.codex/skills/nextjs-pwa-ui/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- `apps/api/prisma/schema.prisma` 和当前全部 migration
- `apps/api/src/attendance/**`、`apps/api/src/async-jobs/**`、dashboard attendance aggregates、RBAC 和 API tests
- `apps/web/src/app/work-hours/**`、`apps/web/src/components/wage/**`、API client、typed i18n catalogs、Web tests 和
  `apps/web/e2e/work-hours.spec.ts`

## 已确认现状与风险

1. `AttendanceImport` 当前没有 import-level `deletedAt`、删除人、原因或不可变删除事件。
2. `fileSha256` 当前是全表唯一；若只增加 tombstone，同一文件在删除后仍会被 duplicate 检测永久阻止，用户无法重新导入。
3. 正常 list/get/parse/generate/files/download、异步 job submit/processor 和 Dashboard aggregate 当前都没有 deleted-import
   scope，单纯隐藏列表仍可通过旧 URL 或 job 继续操作。
4. 同步 Parse/Generate 与异步 Parse/Generate 都存在。删除与已开始的 Worker 调用发生竞态时，不能让迟到结果重新写成
   current rows/files。
5. `WAGE-HOURS-04` 的 employee-day 行 tombstone、row audit history 和 generated-file supersede 语义必须继续保留；
   import 删除不能 cascade 清除这些证据。
6. `IMPORT-DELETE-01` 针对卸柜清单删除，会清理上传和生成文件；该行为与本 Task 的原始考勤文件强制留存规则相反，
   不得复用成 attendance import 的实现。

## 权威业务语义

1. 删除单位是一次完整 attendance import。删除后它不再属于 active work-hours settlement，但不是数据库 hard delete。
2. 原始 `.xls` 必须永久保留在受控 storage 中，文件字节、SHA-256、原始文件名和 provenance 不得删除、覆盖或篡改。
3. 保留该 import 下的 parsed rows、employee-day tombstones、row audit events、generated-file records/bytes、
   async job records 和 correction/audit references。不得通过 relation cascade 或 storage cleanup 删除。
4. 删除必须提交 trim 后非空的原因，建议长度 `5..500`；删除 actor 只取当前 authenticated user，不接受 body/query
   提供的 user id。
5. 保存 `deletedAt`、`deletedById`、耐久的删除人显示快照和删除原因，并写入一个 append-only import deletion event。
   用户后来改名、停用、删除账号或改变角色，不得使“谁删除的”丢失。
6. 删除事件至少快照：import id、原始文件名、SHA-256、状态、结算月份/起止日期、employee/day、active/deleted row
   counts、warning/error counts、各 generated-file id/type/原状态/新状态、actor id/display snapshot、reason 和 occurredAt。
   用户界面不得显示内部 storage path、token、session、密码或其他 secret。
7. 删除事务将 import 的 `dataRevision` 增加一次，并把该 import 下当前 `GENERATED` 工件统一改为
   `SUPERSEDED`；只改状态，不改历史 SHA、生成者、时间、文件字节或路径。既有 `FAILED` / `SUPERSEDED` 保持原样。
8. 重复删除是幂等操作：返回 first deletion 的 actor/time/reason/event，不覆盖原值、不重复 event、不重复增加 revision。
9. active list、active count、Dashboard attendance aggregates 和 normal work-hours selection 默认只包含 `deletedAt IS NULL`。
   删除记录只通过明确的 deletion-history API/UI 查看，不能把 deleted item 混入 active list 后让 Web 自行过滤。
10. 已删除 import 的旧 URL 不得继续 Parse、reparse、Generate、submit job、列出普通文件或下载文件。返回稳定
    `ATTENDANCE_IMPORT_DELETED` 或等价 code；Web 显示本地化提示并回退到有效 active import。
11. 正常 active duplicate 检测仍按 SHA-256 拒绝。若同一 SHA 只存在于 deleted import，则再次上传会创建新的 active
    import id，不恢复、不复用、不修改旧 import/event。新旧记录可以安全引用相同 content-addressed 原始字节，但任何一方
    都不得删除该字节。
12. 同一 SHA 的并发上传只能产生一个 active import；数据库约束是最终防线，不能只依赖先查后写。
13. 不提供 restore。用户要重新处理同一文件时使用重新上传，形成新的 active import 和独立审计链。

## 数据库与迁移要求

1. 为 `AttendanceImport` 增加软删除字段和索引，至少包括 `deletedAt`、`deletedById`、`deletionReason`；删除人关系采用
   不破坏历史的 `SetNull` 策略，显示快照保存在不可变事件中。
2. 新增专用 append-only import audit event 模型（例如 `AttendanceImportAuditEvent`，event code `DELETED`）或等价
   深度模型。事件不得依赖会被更新覆盖的 import 当前字段，也不得在误 hard delete 时静默 cascade 消失。
3. 删除、事件、`dataRevision` 和 generated-file status transition 必须在同一 PostgreSQL transaction 中提交或回滚。
4. 将当前全表 `file_sha256` unique 改成 active-only 唯一约束，例如 PostgreSQL partial unique index：
   `UNIQUE (file_sha256) WHERE deleted_at IS NULL`。Prisma schema、手写 migration、查询和已存在数据必须一致；
   migration 同时在当前数据库与空数据库全量 deploy/status 通过。
5. 增加适合 active list、deletion history、actor 和时间排序的索引。不要手改 generated Prisma client。
6. Migration 不得 hard delete、回填虚构 actor/reason，或改变已有 import、row、file 的业务内容。

## API、权限与并发要求

### 权限

1. 新增 dedicated permission `attendance.imports.delete`，默认只授予 `ADMIN` 和 `HR_MANAGER`。
2. 不从 `attendance.read/create/parse/generate` 或 `attendance.rows.delete` 隐式推导 import delete；不给 `SYSTEM`、
   `WAREHOUSE_MANAGER`、`OFFICE`、`WAREHOUSE`。
3. deletion history 可使用 `attendance.read`；删除影响预览和 mutation 使用 `attendance.imports.delete`。
4. 同步 permission catalog、seed/default-RBAC、route matrix、account/role runbook 和跨角色 tests。

### API contract

建议提供以下稳定 contract；若按现有架构调整路径，行为和权限不得改变：

- `GET /api/attendance-imports/:id/deletion-impact`
  - 返回文件名、期间、active/deleted row counts、employee/day counts、generated-file count/type/status summary；
  - 不返回 storage path 或文件内容。
- `DELETE /api/attendance-imports/:id`
  - body：`{ "reason": "..." }`；
  - 返回 stable code、deleted/alreadyDeleted、first deletion snapshot、受影响 file ids/status 和 active-list 回退所需摘要。
- `GET /api/attendance-imports/deletion-history?limit=&offset=`
  - newest-first bounded pagination；
  - 返回不可变 deletion snapshots，不提供 restore 或普通 download action。

若静态 `deletion-history` 路由与 `:id` 位于同一 Controller，必须在动态路由前声明或使用不会被 `:id` 吞掉的明确路径，
并加入 routing regression。

### 并发与状态

1. 删除前锁定 attendance import，并检查 `parseStatus=PARSING` 或关联 `ATTENDANCE_PARSE` /
   `WAGE_RECORD_GENERATION` job 为 `QUEUED` / `RUNNING`。有活动工作时用稳定 conflict code 拒绝，用户稍后重试；
   不返回假成功，不无限等待，也不静默取消 job。
2. 所有 job submit 路径必须在入队前确认 import 仍 active；processor 在执行前和提交结果前再次确认。
3. 同步 Parse/Generate 在 Worker 调用前记录 revision，写 rows/files 前在 transaction/row lock 下重新检查
   `deletedAt` 和 revision。删除已成功后，迟到结果不得恢复 active rows、更新 active aggregates，或产生
   `GENERATED` current artifact。
4. Worker 已产生但尚未记录的迟到字节不得成为正常下载；若为了审计记录其 metadata，状态必须是
   `SUPERSEDED`/失败且不能绕过 deleted-import gate。
5. 已删除 import 的 list/get/parse-result/row-delete/row-history/generate/files/download/job-submit contract 要有一致、
   明确的 active/deleted 边界。Deletion history 本身仍可读。
6. Dashboard 中 attendance imports needing parse/with errors 等统计只计算 active imports。
7. API 只返回 stable code/enum/raw values。不要依赖 API English `message` 作为 Web 文案，也不要泄漏本地绝对路径。

## Web 交互要求

1. 在 `/work-hours` 的每条 active import 和当前选中 import 的合理操作区提供删除命令，仅
   `attendance.imports.delete` 用户可见/可执行。使用现有 icon library 的 trash icon、tooltip 和本地化 aria-label；
   不用大块说明文字占据正常工作区。
2. 使用可访问 modal/dialog，不使用 `window.confirm`。打开时调用 deletion-impact，并显示：
   - 原始文件名和结算月份/期间；
   - active/deleted employee-day 行数、员工/天数和 generated file 数量；
   - 本地化说明：该批次会退出当前结算及下载，但原始文件和审计证据会保留。
3. 原因必填并显示长度校验。提交期间禁用重复操作，支持 Cancel；Cancel 不调用 mutation。
4. 成功删除当前选中 import 后，清除失效的 `attendanceImportId` / `employeeKey` 参数并导航到第一条剩余 active import；
   没有剩余记录时显示现有本地化空状态。删除非选中 import 时保持当前 import/employee selection。
5. 用户刷新、使用收藏的 deleted id 或并发中被其他用户删除时，页面不得崩溃或反复请求；显示本地化提示并按同一
   fallback 规则恢复。
6. 增加“已删除导入记录”历史区域或按需面板，newest-first 显示文件名、月份/期间、删除人快照、时间、原因、
   row/file counts。它与 active imports 视觉分离，不提供恢复、解析、生成或下载按钮。
7. 继续执行 WAGE-HOURS-06：正常 Work Hours 页面只显示 active import 的 `WAGE_RECORD_XLS` 历史，技术工件不进入
   SSR/DOM/辅助功能树；deleted import history 也不得重新暴露技术文件下载。
8. 320/390 mobile、768 tablet、1366/1920 desktop、200% zoom、light/dark 下无控件遮挡、文本溢出或页面级横向滚动；
   dialog 和 history 使用 bounded scrolling。

## I18n 100% 硬门禁

1. 删除按钮、tooltip/aria、影响预览、确认说明、reason label/validation、Cancel/Submit、loading/success/error、
   active-job conflict、deleted stale URL、history headings/columns、empty state 和 live status 全部进入 typed
   `en` / `zh-CN` catalogs。
2. API 返回 stable code、enum、number、timestamp 和 raw business data；Web 使用窄范围 typed mapping，不显示 raw key、
   raw enum、API English sentence 或 fallback 技术文案。
3. 文件名、SHA、员工姓名、删除人显示快照和用户输入原因是 raw business data，不翻译；其标签和句式必须翻译。
4. English 页面不得显示中文 UI，中文页面不得显示 English fallback 或双语拼接。SSR first frame、hydration、refresh、
   modal open/submit、history pagination、deleted-id fallback 和 locale switch 全程保持目标单语，不得先闪 English。
5. 不新增 DOM translation walker、MutationObserver 翻译、CSS 隐藏首帧、宽泛 i18n 豁免或硬编码双语 JSX。
6. 更新 i18n catalog parity、unmanaged-string AST gate、API code mapping tests；任务不得以“没有新增很多文字”为由跳过。

## 测试与证据

### API、数据库和并发

1. Migration 在现有数据库 apply/status 和空数据库全量 deploy 通过；证明已有 active SHA 唯一、deleted SHA 可重传、
   两个并发同 SHA 上传只产生一个 active import。
2. API unit/E2E 覆盖 `ADMIN` / `HR_MANAGER` 成功，attendance read-only、`OFFICE`、`WAREHOUSE_MANAGER`、
   `WAREHOUSE` 403；JWT actor、required reason、长度边界、not found、幂等重复和 transaction rollback。
3. 删除后 active list/get/parse/parse-job/parse-result/row mutation/generate/generate-job/files/download 均不能继续操作；
   deletion history 仍可读，Dashboard active counts 排除 deleted。
4. 删除前后计算原始 `.xls` SHA 和字节，证明 unchanged；parsed rows、row events、async jobs、generated DB records 和
   storage bytes 均保留，原 `GENERATED` 工件变 `SUPERSEDED`。
5. 删除事件保存 first actor/time/reason 和完整快照；用户改名/停用后历史仍可读；重复删除不覆盖、不增 event/revision。
6. active duplicate 仍拒绝；删除后同 SHA 上传得到新 id，旧 import/event 不变化；新 import 可独立 Parse/Generate。
7. 覆盖 queued/running async job conflict、submit/delete race、processor pre/post check、同步 Parse/Delete 和
   Generate/Delete race；删除成功后不得出现 active rows/current file resurrection。

### Web、i18n 和视觉

1. Web unit/render tests 覆盖 permission gate、impact fetch、reason validation、Cancel、double-submit、API code mapping、
   selected/non-selected deletion fallback、stale URL、history ordering/pagination 和 WAGE-HOURS-06 allowlist。
2. Docker Chromium 经真实 nginx/API 执行 upload -> parse -> generate -> delete -> history -> refresh -> same-SHA reupload；
   覆盖 `ADMIN`、`HR_MANAGER`、read-only/forbidden roles。
3. 覆盖 en/zh-CN、light/dark、320/390/768/1366/1920、真实 200% zoom、中文 refresh 和 locale switch；unexpected
   failed request、pageerror、console/hydration/missing-translation、mixed-language 和 page overflow 为 0。
4. 保存少量高信号截图并逐张原分辨率检查：删除 dialog、删除后 active fallback、删除历史，至少覆盖双语、mobile、
   desktop 和 200% zoom。
5. 回归 public browser HttpOnly session/CSRF mutation contract、工时行删除、工资表生成/代理下载和 active import
   duplicate behavior；不得因本 Task 回退当前 PUBLIC-DEPLOY 安全成果。
6. 精确清理测试创建的用户/角色、DB rows 和 disposable generated directories，不修改 `samples/wage`，不删除当前
   `storage/attendance_original_files` 中既有原始证据。记录测试前后业务数据和残留检查。

## Docker 验证基线

所有依赖、Prisma、lint、typecheck、test、build 和 Playwright 必须在 Docker 中运行。业务 Agent 应按当前真实
package scripts 调整参数，但不能改为宿主 Jest/pnpm/uv 或跳过检查。

```bash
docker compose -f infra/docker/compose.local.yml up -d --build
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api lint
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api typecheck
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api test --runInBand
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api test:e2e --runInBand
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api prisma migrate status
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web lint
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web typecheck
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web test
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web build
docker compose -f infra/docker/compose.local.yml exec -T worker-python uv run pytest
docker compose -f infra/docker/compose.local.yml --profile e2e build e2e-web
docker compose -f infra/docker/compose.local.yml --profile e2e run --rm e2e-web e2e/work-hours.spec.ts --project=chromium
scripts/healthcheck.sh
git diff --check
```

## 验收标准

1. `ADMIN` / `HR_MANAGER` 可从 Work Hours 删除一次完整 active attendance import；其他默认角色不能执行或看到命令。
2. 删除需要原因并记录 authenticated actor、耐久显示快照、时间和不可变事件；重复删除幂等。
3. 删除后 active list、Dashboard、Parse/Generate/job/files/download 均不再使用该 import；页面安全回退且历史可读。
4. 原始 `.xls`、SHA、parsed rows、row audit、generated records/bytes 和 jobs 未物理删除；current files 原子变为
   `SUPERSEDED`。
5. 同一 SHA 在 active 时仍拒绝重复；旧 import 删除后可创建一个新的 active import，并发上传仍只有一个 active。
6. queued/running 与同步 Worker race 不产生假成功、rows resurrection 或错误 current artifact。
7. strict en/zh-CN、SSR/hydration/no-flash、RBAC、accessibility、light/dark、responsive/200% zoom 和 public auth/CSRF
   回归全部通过。
8. Migration、API/Web/Worker Docker checks、focused Chromium、healthcheck、数据清理和 diff check 全部通过。
9. 产品文档、架构/API/RBAC 文档、Task Index、completion report、回归 runbook 和 `HANDOFF.md` 同步真实终态。

## 非目标

- 不物理删除 attendance import、原始 `.xls`、parsed rows、row/import audit events、generated files 或 async jobs。
- 不提供 restore、bulk delete、自动过期清理或保留期策略。
- 不改变 WAGE-HOURS-04 employee-day 行删除语义、odd/even/lunch 计算、工资模板格式或 WAGE-HOURS-06 文件可见性规则。
- 不复用 `IMPORT-DELETE-01` 的卸柜清单 storage cleanup，也不修改卸柜导入、柜子、库存、扫码或拆柜工资。
- 不新增工资税、加班、假期、员工账号绑定或 payroll compliance。

## 完成输出

- 列出 schema/migration、partial active SHA uniqueness、import event、permission/routes/codes、job/race guard、Web UI、
  i18n 和精确 changed files。
- 列出实际 Docker test counts、migration、原始/生成文件 SHA、same-SHA 重传、并发、RBAC、浏览器/视觉和清理证据。
- 明确 remaining implementation、external verification 和 blockers；无剩余时返回 `DONE`。
- 更新 `HANDOFF.md`，下一步只能由最新 Task Index 决定；本 Session 不得自行执行下一 Task。

## 执行结果（2026-07-23 MDT）

`Task-Status: DONE`

- PostgreSQL 已增加 import tombstone、删除 actor/reason、不可变 `AttendanceImportAuditEvent` 和 active-only SHA partial
  unique index；现有数据库与空数据库均部署全部 36 个 migration，active duplicate 被拒绝，旧批次删除后同 SHA
  可建立独立新 import，并发上传仍只有一个 active winner。
- API 已交付 deletion impact、幂等 DELETE、newest-first deletion history、稳定
  `ATTENDANCE_IMPORT_DELETED` / active-job conflict contract，以及 list/get/parse/generate/files/download/row/job 和
  Dashboard 的 active scope。删除、revision、event 和 GENERATED -> SUPERSEDED 在同一锁定事务中提交；同步及异步
  parse/generate 均有执行前和提交前 deleted/revision 防线。
- `attendance.imports.delete` 仅默认授予 ADMIN/HR_MANAGER；Web 使用可访问的双语 impact dialog、必填原因、
  double-submit guard、当前/非当前批次回退和独立只读删除历史，继续保持 WAGE-HOURS-06 的工资表可见性 allowlist。
- Docker API 46 suites / 359 unit、21 suites / 126 E2E，Web 271 unit、Worker 183 pytest、API/Web lint、
  typecheck、生产 build、migration status 和完整 Chromium Work Hours 6/6 均通过。真实浏览器覆盖 upload -> parse ->
  generate -> delete -> history -> refresh -> same-SHA reupload、角色边界、actor 改名/停用快照、并发 SHA、
  en/zh-CN、light/dark、mobile/desktop 和真实 200% zoom。
- 四张高信号截图位于 gitignored `test-results/wage-hours-07/browser/`，均已按原分辨率检查。删除前后原始/生成文件
  字节与 SHA、parsed rows、事件、jobs 和 generated records 留存语义已由 API/E2E 验证。
- 精确清理后，本 Task 创建的 import、attendance rows、import audit events、generated-file records、async jobs 和
  专用浏览器用户均为 0；仅删除对应 import-scoped disposable directories，既有
  `storage/attendance_original_files`、fixtures 和早于本 Task 的目录未修改。
- 无剩余仓库实现或当前环境验证；下一步只由最新 Task Index 决定，本 Session 未启动其他 Task。
