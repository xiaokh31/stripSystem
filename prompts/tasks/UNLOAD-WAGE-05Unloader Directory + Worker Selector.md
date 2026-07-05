执行 UNLOAD-WAGE-05：Unloader Directory and Worker Selector。

必须读取：
- AGENTS.md
- prompts/agents/business-logic-agent.md
- docs/product/02-work-hours-and-unloading-wage-settlement.md
- docs/architecture/09-account-role-permission-management.md
- prompts/tasks/UNLOAD-WAGE-01Container Detail Unloading Wage API.md
- prompts/tasks/UNLOAD-WAGE-02Container Detail Unloading Wage UI.md
- prompts/tasks/UNLOAD-WAGE-03Monthly Unloading Wage Settlement API.md
- prompts/tasks/UNLOAD-WAGE-04Monthly Unloading Wage Settlement UI.md
- prompts/tasks/WAGE-P2-03Wage Manager Roles + Permission UX.md
- CONTEXT.md
- .codex/skills/auth-rbac/SKILL.md
- .codex/skills/nestjs-prisma-api/SKILL.md
- .codex/skills/nextjs-pwa-ui/SKILL.md
- apps/api/prisma/schema.prisma
- apps/api/src/unloading-wage/
- apps/api/src/users/
- apps/web/src/app/containers/[id]/page.tsx
- apps/web/src/components/containers/container-unloading-wage-panel.tsx
- apps/web/src/components/containers/container-unloading-wage-flow.ts
- apps/web/src/lib/api-client.ts

前置任务：
- UNLOAD-WAGE-01
- UNLOAD-WAGE-02
- UNLOAD-WAGE-03
- UNLOAD-WAGE-04
- WAGE-P2-03

任务范围：
1. 将柜子详情“拆柜人”从自由文本输入改为人员选项选择。
2. 增加可供 `WAREHOUSE_MANAGER` 读取的拆柜人员目录 API，或复用现有用户 API 时确保权限和返回字段适合业务使用。
3. 保存拆柜人时优先提交 `workerUserId`，由后端解析并快照 worker code / worker name。
4. 保留历史兼容：已有旧记录如果只有 worker name、没有 workerUserId，页面必须能显示，并给出明确的重新选择方式。
5. 不改海柜 / 美转加计价规则。
6. 不引入 mock worker list 或前端硬编码人员。

业务要求：
1. 拆柜人选项来源必须是真实系统用户或真实人员目录。
2. 默认可选人员应为 active 用户，优先包含 `WAREHOUSE`、`WAREHOUSE_MANAGER` 等仓库相关角色；如果实现选择其他规则，必须在代码和测试中体现。
3. 每一行拆柜人只能选择一个人名。
4. “增加拆柜人”会增加一行新的人员选择控件。
5. 同一条海柜或同一组美转加关联柜不能重复选择同一拆柜人。
6. 保存后每个相关柜子详情都能看到相同拆柜人列表。
7. 月度结算继续使用保存时快照的 worker code / worker name，历史结算不能被用户改名静默改变。
8. `WAREHOUSE_MANAGER` 和 `ADMIN` 可读取人员选项并保存拆柜人；无权限用户不能读取或保存。

建议 API：
- `GET /api/unloading-wage/workers`
  - 权限：`unloading_wage.read`
  - 返回 active 可选拆柜人员：
    - `id`
    - `displayName`
    - `workerCode`
    - `email`（可选）
    - `roles`（可选，便于调试）
- `PUT /api/containers/:id/unloaders`
  - 支持 `workerUserId`
  - 后端根据 `workerUserId` 解析 worker name/code
  - 对 inactive user、不可选 user、重复 user 返回明确 400

Web 要求：
1. `/containers/[id]` 加载真实人员选项。
2. 拆柜人列使用 select / combobox，不再使用自由文本输入作为主路径。
3. 现有 `workerUserId` 能正确预选。
4. 历史无 `workerUserId` 的拆柜人显示为 legacy/needs review 状态，用户保存前需要选择真实人员。
5. duplicate selection 在前端保存前提示，同时 API 仍做最终校验。
6. 保存成功后 refresh from API。
7. 错误状态显示 API code/message。

验收标准：
1. 仓管经理在柜子详情可以从人员选项中选择拆柜人并保存。
2. 可以增加多名拆柜人，每行一个人员选项。
3. 重复选择同一个人员会被前端和 API 拒绝。
4. 已保存记录刷新后仍显示已选人员。
5. 美转加关联柜任一详情页都显示同一拆柜人选择结果。
6. 月结明细继续显示正确 worker name、worker code、金额。
7. 没有 `unloading_wage.read` / `unloading_wage.complete` 权限的用户不能读取人员选项或保存拆柜人。
8. 不出现硬编码人员、mock 人员、仅前端状态保存人员。

测试命令：
pnpm --filter api lint
pnpm --filter api typecheck
pnpm --filter api test
pnpm --filter api test:e2e
pnpm --filter web lint
pnpm --filter web typecheck
pnpm --filter web test
pnpm --filter web build
