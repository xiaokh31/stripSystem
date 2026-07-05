执行 WAGE-P2-03：Wage Manager Roles and Permission UX。

必须读取：
- AGENTS.md
- prompts/agents/business-logic-agent.md
- docs/product/02-work-hours-and-unloading-wage-settlement.md
- docs/architecture/09-account-role-permission-management.md
- prompts/tasks/WAGE-P2-02Work Hours Navigation Permissions I18n.md
- prompts/tasks/UNLOAD-WAGE-02Container Detail Unloading Wage UI.md
- prompts/tasks/UNLOAD-WAGE-04Monthly Unloading Wage Settlement UI.md
- CONTEXT.md
- .codex/skills/auth-rbac/SKILL.md
- .codex/skills/nestjs-prisma-api/SKILL.md
- .codex/skills/nextjs-pwa-ui/SKILL.md
- apps/api/prisma/schema.prisma
- apps/api/src/auth/default-rbac.ts
- apps/api/src/auth/permissions.ts
- apps/api/src/auth/route-permissions.ts
- apps/web/src/lib/permissions.ts

前置任务：
- WAGE-P2-02
- UNLOAD-WAGE-02
- UNLOAD-WAGE-04

任务范围：
1. 新增两个默认 RBAC 业务角色：
   - `HR_MANAGER`：人事经理
   - `WAREHOUSE_MANAGER`：仓管经理
2. 调整默认角色权限，让工资结算权限从普通 `OFFICE` / `WAREHOUSE` 中分离出来。
3. 补齐 API 权限测试，证明两个经理角色分别只能管理自己的结算模块。
4. 补齐 Web 导航和动作权限控制，避免无权限用户看到可执行 wage 动作。
5. 不改工资计算规则。
6. 不引入 mock 用户或 mock business data。

RBAC 要求：
1. `HR_MANAGER` 默认拥有：
   - `attendance.read`
   - `attendance.create`
   - `attendance.parse`
   - `attendance.generate`
   - 必要的只读设置权限可按现有模式保留，例如 `settings.read`
2. `HR_MANAGER` 默认不拥有：
   - `unloading_wage.read`
   - `unloading_wage.classify`
   - `unloading_wage.complete`
   - `unloading_wage.settle`
3. `WAREHOUSE_MANAGER` 默认拥有：
   - `containers.read`
   - `corrections.create`
   - `unloading_wage.read`
   - `unloading_wage.classify`
   - `unloading_wage.complete`
   - `unloading_wage.settle`
   - 必要的只读设置权限可按现有模式保留，例如 `settings.read`
4. `WAREHOUSE_MANAGER` 默认不拥有：
   - `attendance.read`
   - `attendance.create`
   - `attendance.parse`
   - `attendance.generate`
5. `ADMIN` 保持全部权限。
6. `OFFICE` 默认不再拥有 `attendance.*` 或 `unloading_wage.*`。
7. `WAREHOUSE` 默认不再拥有 `unloading_wage.*`。
8. 如果一个用户被分配多个角色，有效权限按所有 active roles 的 union 计算。
9. 如果实现需要兼容 legacy `users.role` enum，要明确兼容策略；不要把新授权只写在前端。

API 验收：
1. 默认角色 seed/upsert 会创建 `HR_MANAGER` 和 `WAREHOUSE_MANAGER` role records。
2. 默认权限映射满足上面的 RBAC 要求。
3. `HR_MANAGER` 可以调用 attendance upload/list/parse/generate/download API。
4. `HR_MANAGER` 调用 unloading wage classify/complete/settle API 返回 403。
5. `WAREHOUSE_MANAGER` 可以调用 container detail unloading wage 和 monthly settlement API。
6. `WAREHOUSE_MANAGER` 调用 attendance upload/parse/generate API 返回 403。
7. 普通 `OFFICE` 用户默认不能调用 attendance wage API 和 unloading wage API。
8. 普通 `WAREHOUSE` 用户默认不能调用 unloading wage API。
9. API e2e 覆盖 route permission，不依赖 Web 隐藏按钮。

Web 验收：
1. `HR_MANAGER` 和 `ADMIN` 可以从导航或 Reports 进入 `/work-hours`。
2. `WAREHOUSE_MANAGER` 默认看不到 `/work-hours` 的可执行入口；直接访问时不能执行 action。
3. `WAREHOUSE_MANAGER` 和 `ADMIN` 可以进入 `/unloading-wage`。
4. `HR_MANAGER` 默认看不到 `/unloading-wage` 的可执行入口；直接访问时不能生成结算。
5. `/containers/[id]` 的拆柜工资编辑区只有 `WAREHOUSE_MANAGER` / `ADMIN` 可编辑。
6. 无 wage 权限但有 container read 权限的用户可以继续看普通柜子详情，不应看到可执行拆柜工资按钮。
7. 页面权限状态与 API 权限一致；隐藏 UI 不能替代 API 403。

测试命令：
pnpm --filter api lint
pnpm --filter api typecheck
pnpm --filter api test
pnpm --filter api test:e2e
pnpm --filter web lint
pnpm --filter web typecheck
pnpm --filter web test
pnpm --filter web build
