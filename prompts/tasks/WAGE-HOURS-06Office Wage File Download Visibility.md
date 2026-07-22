# 执行 WAGE-HOURS-06：Office Wage File Download Visibility

## 优先级与前置任务

- 优先级：P1 工时结算办公室交付面精简。
- 前置任务：`WAGE-HOURS-01` 至 `WAGE-HOURS-05` 均已达到监督终态 `DONE`，不得重跑或改写其历史证据。
- 本 Task 是新的 Web 可见性需求，不表示 WAGE-HOURS-05 存在未关闭缺陷。
- 一个 fresh supervisor Session 只执行本 Task，不得顺带修改其他 generated-file 页面。

## 对应用户原始需求

“当工时功能完善无 bug 后，在生成文件中，不显示任务报告、解析文件等文件下载，因为这些对办公室人员无用。”

产品口径：`/work-hours` 的办公室生成文件区域只展示工资表文件。解析 JSON、HTML 任务报告及未来技术诊断工件继续由
Worker/API 生成、存储并记录审计，但不得出现在该页面的可见内容、辅助技术可访问内容或下载入口中。

## 必须读取与使用

- `AGENTS.md`、`HANDOFF.md`、`CONTEXT.md`
- `prompts/agents/business-logic-agent.md`
- `docs/product/02-work-hours-and-unloading-wage-settlement.md`
- `docs/runbooks/work-hours-settlement-regression.md`
- `prompts/tasks/WAGE-HOURS-05Full Stack Workbook Visual Exit Gate.md` 的 DONE 证据
- `.codex/skills/bestar-handoff/SKILL.md`
- `.codex/skills/nextjs-pwa-ui/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- `apps/web/src/app/work-hours/page.tsx`
- `apps/web/src/components/wage/attendance-flow.ts`
- `apps/web/src/lib/api-client.ts`
- `apps/web/src/lib/i18n/status-labels.ts`
- typed `en` / `zh-CN` catalogs、Web wage/unit/i18n tests 和 `apps/web/e2e/work-hours.spec.ts`

## 已确认现状

1. `GET /api/attendance-imports/:id/files` 返回完整审计集合，包含 `ATTENDANCE_PARSED_JSON`、`TASK_REPORT_HTML`、
   `WAGE_RECORD_XLS` 及其历史状态；该完整 API 口径必须保留。
2. `/work-hours` 当前直接对 `files` 全量 `map(GeneratedFileLink)`，因此技术工件会显示卡片、SHA/MIME/size 和 Download。
3. 现有 Chromium 测试明确断言 `Task report` 在页面可见；本 Task 必须将断言改成“API 存在、UI 不可见”，不能简单删掉审计测试。
4. WAGE-HOURS-04/05 依赖 superseded wage workbook 历史；筛选技术工件时不得把旧工资表或失败工资表一起隐藏。

## 权威业务规则

1. 办公室可见文件类型采用 typed、default-deny allowlist，当前唯一允许值为 `WAGE_RECORD_XLS`。
2. `ATTENDANCE_PARSED_JSON`、`TASK_REPORT_HTML` 以及任何未知/未来技术 file type 均不渲染：
   - 不显示文件卡片、类型名、时间、status、SHA、MIME、size 或错误详情；
   - 不生成普通、隐藏、screen-reader-only 或不可聚焦但仍存在的下载链接；
   - 不在 SSR HTML 中出现后再于 hydration 隐藏。
3. 保留全部 `WAGE_RECORD_XLS` 历史卡片，包括 `GENERATED`、`SUPERSEDED`、`FAILED` 和后端未来支持的状态。
   是否显示 Download 继续服从现有后端/页面 status contract，不得把 superseded/failed 伪装为可下载。
4. 保持技术工件的 Worker 生成、数据库记录、storage 文件、SHA、generatedBy、状态、API list/download 行为及自动化证据。
   本 Task 不删除文件、不停止 task report/parsed JSON 生成、不修改 API RBAC，也不伪造“未生成”。
5. 页面空状态以过滤后的工资表集合判断：API 即使已有技术工件但尚无 `WAGE_RECORD_XLS`，仍显示“尚未生成工资表”。
6. 该规则适用于 operational `/work-hours` 的所有查看者，包括 `ADMIN`、`HR_MANAGER` 和 attendance read-only user。
   本 Task 不新增管理员技术工件浏览页；支持人员仍可使用现有受保护 API/审计证据。
7. “解析员工工时行”和“删除历史”仍正常显示；隐藏的是生成文件下载卡片，不是解析结果业务数据。

## 实现要求

1. 在窄范围 wage helper 中增加可单测的 office-visible file predicate/filter；不得按本地化 label、文件名、扩展名或 MIME 猜测。
2. `WorkHoursDetail` 在选择 empty state 和渲染前使用过滤后的集合；未知 file type 默认隐藏。
3. 将区域标题和空状态改成准确的“工资表文件 / Wage record files”语义，避免界面继续暗示会列出所有后台工件。
4. 继续复用 `GeneratedFileLink` 的 wage card/audit/status/download 行为；不要复制一套不一致的下载 URL 或状态逻辑。
5. 不把完整技术文件集合放入 Client Component props、data attributes、serialized JSON、title/aria-label 或其他 DOM 可观察位置。
6. 保持选中 import/employee、Parse、Generate、Delete/history、refresh 和 generated-file polling 行为不变。

## I18n 100% 硬门禁

1. 新标题、工资表空状态及相关 aria/live/error 文案全部进入 typed `en` / `zh-CN` catalogs。
2. English 页面只显示 English；中文页面只显示中文，不得显示 raw `WAGE_RECORD_XLS`、`TASK_REPORT_HTML`、
   `ATTENDANCE_PARSED_JSON`、catalog key 或双语拼接。
3. 旧的通用 generated-file type labels 可因其他模块或 API 测试继续保留；不得为本 Task 删除共享 i18n key 导致回归。
4. SSR first frame、hydration、refresh、generation polling、locale switch 和 client navigation 全程不得闪现技术文件卡片或英文 fallback。
5. 不新增宽泛 i18n 豁免、DOM 翻译 walker、通过 CSS 隐藏技术内容或硬编码中文 JSX。

## 测试要求

1. Helper unit tests 覆盖：
   - `WAGE_RECORD_XLS` 在 GENERATED/SUPERSEDED/FAILED 下均保留；
   - `ATTENDANCE_PARSED_JSON`、`TASK_REPORT_HTML`、未知类型和空类型全部隐藏；
   - 输入顺序和原对象不被修改。
2. 页面/render tests 证明 empty state 使用过滤后集合，并且隐藏技术工件不会生成卡片、metadata 或 download anchor。
3. 更新 `apps/web/e2e/work-hours.spec.ts`：
   - 真实 API list 仍包含 parsed JSON/task report 并有审计 metadata；
   - `/work-hours` DOM 只出现 `WAGE_RECORD_XLS` 对应的工资表卡片；
   - 页面中 `Task report` / `任务报告`、`Parsed attendance data` / `已解析考勤数据` 及对应技术 file-id download href 为 0；
   - deletion 后 superseded baseline wage card 与新 current wage card仍按现有状态规则显示；
   -工资表下载经浏览器代理仍成功且 SHA 与 API 记录一致。
4. Chromium 覆盖 `en` / `zh-CN`、HR/ADMIN/read-only、390 mobile、1366 desktop、真实 200% zoom、refresh 和 locale switch；
   console、pageerror、hydration、missing translation 和 failed request 为 0。
5. 保留 WAGE-HOURS-05 的后台技术工件和 BIFF/LibreOffice 证据，不需要重跑 Worker 全量或 88 页渲染，除非实现越界修改了
   Worker/API/generator；如发生越界修改，必须恢复窄范围或重跑相应门禁。

## 非目标

- 不停止生成或删除 `ATTENDANCE_PARSED_JSON`、`TASK_REPORT_HTML`。
- 不改变 `/api/attendance-imports/:id/files` 的完整审计响应或既有下载权限。
- 不隐藏 `WAGE_RECORD_XLS` 的 superseded/failed 历史，不只保留最新一份工资表。
- 不修改工资计算、Excel 内容/样式、工时行删除、数据库 schema、Worker、拆柜工资或其他模块的文件列表。
- 不建立新的管理员技术工件页面。

## Docker 验证

```bash
docker compose -f infra/docker/compose.local.yml up -d --build web nginx
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

1. `/work-hours` 在中文和英文下只显示工资表文件历史及其合法下载入口。
2. Parsed JSON、task report 和未知技术类型在 SSR/DOM/accessibility tree/download href 中均不存在，刷新或切换语言不闪现。
3. API/数据库仍保留并返回完整技术工件及其 SHA/status/generatedBy，既有审计和自动化能力无回归。
4. 过滤依据只有 stable file type allowlist；当前/旧/失败工资表不会被错误隐藏，empty state 基于可见工资表集合。
5. HR、ADMIN 和 read-only 页面可见性一致，原 RBAC、Parse/Generate/Delete/history 和工资表下载行为无回归。
6. strict i18n、mobile/desktop/200% zoom、accessibility、Docker Web checks、focused Chromium、healthcheck 和 diff check 全通过。
7. Task Index、completion report、product doc、regression runbook 和 `HANDOFF.md` 更新为真实终态。

## 完成输出

- 列出 allowlist/helper、页面区域/i18n 调整、测试 changed files 和 exact test counts。
- 分别说明“后台仍保留哪些工件”和“办公室页面展示哪些文件”，不得将隐藏误写成删除。
- 无剩余实现时明确下一项由最新 Task Index 决定，不得重跑 WAGE-HOURS-01 至 05。
