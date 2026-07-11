执行 WEB-DASHBOARD-01：Operations Dashboard Data API。

必须读取：
- AGENTS.md
- prompts/agents/business-logic-agent.md
- prompts/tasks/WEB-DASHBOARD-00Back Office Visual Direction.md
- .codex/skills/frontend-design/SKILL.md
- .codex/skills/bestar-domain/SKILL.md
- .codex/skills/nestjs-prisma-api/SKILL.md
- docs/architecture/01-system-overview.md
- docs/architecture/02-data-model.md
- docs/architecture/05-web-and-scan-ui.md
- apps/api/prisma/schema.prisma
- apps/api/src/reports/inventory-reports.service.ts
- apps/api/src/imports/
- apps/api/src/corrections/
- apps/api/src/load-jobs/
- apps/api/src/unloading-summary/
- apps/api/src/unloading-wage/
- apps/api/src/attendance/
- apps/api/src/auth/

前置任务：
- WEB-DASHBOARD-00

目标：
为新的后台 dashboard 提供一个真实、可测试、按权限裁剪的运营汇总 API。前端不得通过拉多个列表后自行拼业务真相。

建议 API：
- `GET /api/dashboard/operations`
- Query：
  - `range=today|7d|30d`，默认 `today`
  - `month=YYYY-MM`，用于月度拆柜汇总和工资相关摘要，默认最近可用业务月份或当前月份
- Auth：
  - 不标记 Public。
  - 允许任意已登录用户访问。
  - 服务层根据当前用户权限返回可见 sections。
  - 没权限的 section 不返回业务数据，只在 `hiddenSections` 中说明 code。

响应建议：
```ts
interface OperationsDashboardResponse {
  generatedAt: string;
  timeZone: string;
  range: "today" | "7d" | "30d";
  month: string;
  hiddenSections: Array<{ code: string; requiredPermissions: string[] }>;
  health: {
    apiStatus: string;
    databaseStatus: string;
    version: string;
  };
  workQueue: {
    totalActions: number;
    items: Array<{
      code: string;
      labelKey: string;
      count: number;
      severity: "normal" | "attention" | "blocked";
      href: string;
    }>;
  };
  containerLifecycle: {
    totalContainers: number;
    stages: Array<{
      code: string;
      labelKey: string;
      count: number;
      href: string;
      severity: "normal" | "attention" | "blocked";
    }>;
  };
  inventory: {
    totalPallets: number;
    loadedPallets: number;
    remainingPallets: number;
    topDestinations: Array<{
      destinationCode: string;
      totalPallets: number;
      loadedPallets: number;
      remainingPallets: number;
    }>;
  } | null;
  loadJobs: {
    openCount: number;
    inProgressCount: number;
    dueTodayCount: number;
    activeJobs: Array<{
      id: string;
      loadNumber: string;
      status: string;
      truckNo: string | null;
      scheduledDepartureAt: string | null;
      totalPallets: number;
      loadedPallets: number;
      remainingPallets: number;
      href: string;
    }>;
  } | null;
  exceptionQueue: Array<{
    code: string;
    labelKey: string;
    count: number;
    severity: "attention" | "blocked";
    href: string;
  }>;
  monthlySummary: {
    month: string;
    completedContainerCount: number;
    rowCount: number;
    reviewWarningCount: number;
    href: string;
  } | null;
  wageAndAttendance: {
    attendanceImportsNeedingParse: number;
    attendanceImportsWithErrors: number;
    wageSettlementsNeedingReview: number;
    hrefs: Record<string, string>;
  } | null;
  recentActivity: Array<{
    id: string;
    kind: "IMPORT" | "CONTAINER" | "LOAD_JOB" | "GENERATED_FILE" | "CORRECTION";
    label: string;
    status: string;
    occurredAt: string;
    href: string;
  }>;
}
```

数据口径：
1. Inventory：
   - 必须从 backend/database state 统计。
   - 可复用 `InventoryReportsService` 的统计逻辑，避免前端重复计算 remaining pallets。
2. Container lifecycle：
   - 至少覆盖 `UPLOADED`、`PARSED`、`REPORT_GENERATED`、`LABELS_GENERATED`、`UNLOADED`、`LOADING_IN_PROGRESS`、`LOADED`。
   - `LOADED` 仍代表已送库，不要改成已拆完。
3. Work queue：
   - imports awaiting parse
   - imports parse failed
   - containers missing generated report
   - containers missing labels
   - completed status missing unloading completion date
   - open/in-progress load jobs
   - monthly summary review warnings
   - attendance imports needing parse when user has attendance permission
4. Exception queue：
   - parser errors
   - destination/carton/volume warnings
   - zero volume with cartons
   - failed generated files
   - failed async jobs if available in schema
5. Recent activity：
   - Use real timestamps.
   - Keep list small, e.g. latest 8-12 items.
   - Do not expose internal storage paths.
6. Permission裁剪：
   - 用户无 `inventory.read` 时 `inventory=null`。
   - 用户无 `load_jobs.read` 时 `loadJobs=null`。
   - 用户无 `unloading_summary.read` 时 `monthlySummary=null`。
   - 用户无 `attendance.read` / `unloading_wage.read` 时对应 wage/attendance 数字不返回。
   - `ADMIN` 可见全部。

I18n 数据边界：
1. API 不负责 dashboard 可见文案翻译。
2. API response 中的 `labelKey` 必须是稳定语义 key，例如：
   - `dashboard.workQueue.importsAwaitingParse`
   - `dashboard.lifecycle.labelsGenerated`
   - `dashboard.exceptions.zeroVolumeWithCartons`
3. API 可以返回 raw business data：
   - container number
   - destination code
   - user name
   - worker name snapshot
   - import filename
   - load number
   - status enum
   - permission code
4. API 不得返回以下内容作为用户可见字段：
   - 中文 UI 文案
   - 英文 UI 文案
   - 中英混排 display string
   - 已格式化的本地化日期句子
5. 前端负责：
   - 用 `labelKey` 查 i18n catalog。
   - 用 locale-aware status label helpers 显示 status。
   - 用当前 locale 格式化日期、range、month、count 文案。
6. API tests 需要断言 dashboard response 包含 stable keys/codes，而不是硬编码英文/中文 label。

不做：
1. 不做 Web UI，UI 由 WEB-DASHBOARD-03 执行。
2. 不新增 mock data。
3. 不改变现有业务状态流转。
4. 不把 dashboard 统计写入持久表，先做实时聚合；性能不足再另开任务。

验收标准：
1. `GET /api/dashboard/operations` 返回 dashboard 所需全部 sections。
2. 每个数字都能追溯到 DB 查询或现有 service 计算。
3. 普通用户只能看到自己权限允许的 section。
4. 无权限 section 不泄露业务数据。
5. Inventory remaining pallets 不在前端计算。
6. API 对空数据返回 0 和空数组，不抛 500。
7. API response 只返回稳定 `code` / `labelKey` / enum / raw source data，不返回本地化 UI 文案。
8. API unit/e2e 覆盖：
   - ADMIN 全量可见
   - OFFICE 可见 imports/container/monthly summary
   - WAREHOUSE 可见 inventory/load jobs/mobile relevant section
   - HR_MANAGER 可见 attendance section
   - 无相关权限用户得到 hiddenSections 和空业务 section
   - empty DB 返回稳定空 dashboard
   - `labelKey` 稳定且无中文/英文 UI sentence 泄露

测试命令：
pnpm --filter api lint
pnpm --filter api typecheck
pnpm --filter api test -- dashboard
pnpm --filter api test:e2e -- dashboard

完成输出：
1. changed files
2. tests run
3. API response example with real or test DB data
4. known limitations
5. next recommended task：WEB-DASHBOARD-02
