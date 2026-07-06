执行 UNLOAD-WAGE-06：Temporary Unloader Directory API。

必须读取：
- AGENTS.md
- prompts/agents/business-logic-agent.md
- docs/product/02-work-hours-and-unloading-wage-settlement.md
- docs/architecture/09-account-role-permission-management.md
- prompts/tasks/UNLOAD-WAGE-05Unloader Directory + Worker Selector.md
- CONTEXT.md
- .codex/skills/bestar-domain/SKILL.md
- .codex/skills/auth-rbac/SKILL.md
- .codex/skills/nestjs-prisma-api/SKILL.md
- apps/api/prisma/schema.prisma
- apps/api/src/unloading-wage/
- apps/api/src/auth/

前置任务：
- UNLOAD-WAGE-01
- UNLOAD-WAGE-03
- WAGE-P2-03
- UNLOAD-WAGE-05 已作废，仅作为迁移背景读取

任务范围：
1. 将拆柜工人来源从系统用户账号改为独立的临时工人目录。
2. 增加或调整 Prisma schema / migration，用于保存 temporary unloading workers。
3. 增加临时工目录 API：列表、创建、更新、停用。
4. 调整保存柜子拆柜人的 API，使新请求使用临时工目录 id，而不是 `workerUserId`。
5. 保留旧数据兼容：已保存的 `workerUserId` / worker name snapshot 不能丢失，旧结算仍可读取和下载。
6. 不改海柜 / 美转加计价规则。
7. 不做 Web UI。

业务要求：
1. 拆柜工人大多是临时工，不要求拥有员工账号。
2. 可选拆柜人必须来自真实持久化目录，不允许前端硬编码或 mock list。
3. `WAREHOUSE_MANAGER` 和 `ADMIN` 可以维护临时工目录。
4. 临时工目录最少字段：
   - `id`
   - `displayName`
   - `workerCode` 或后端生成的稳定编号
   - `isActive`
   - `phone` 或 contact note（可选）
   - `note`（可选）
5. 停用临时工后，不再出现在新 assignment selector 中，但历史 assignment / settlement 仍显示保存时 snapshot。
6. 保存拆柜人时提交 `unloadingWorkerId` 或等效目录 id。
7. `PUT /api/containers/:id/unloaders` 后端根据目录 id 快照 worker code / worker name。
8. 同一条海柜或同一组美转加不能重复选择同一个目录 worker id。
9. 如果当前数据库已有 user-account-backed assignment：
   - 读取柜子详情时仍能显示旧 worker name/code。
   - 月结仍能使用旧 snapshot。
   - 新保存不再要求 `workerUserId`。
   - 如需要迁移，可以从旧 snapshot 建立临时工目录记录并回填目录 id，但不得丢失历史审计。
10. 目录创建、更新、停用，以及柜子拆柜人 assignment 修改必须有审计记录或可追溯字段。

建议 API：
- `GET /api/unloading-wage/workers`
  - 权限：`unloading_wage.read`
  - 默认只返回 active 临时工，支持可选 includeInactive 查询参数
- `POST /api/unloading-wage/workers`
  - 权限：`unloading_wage.complete` 或更细的 worker manage 权限
  - 创建临时工目录记录
- `PATCH /api/unloading-wage/workers/:workerId`
  - 权限：`unloading_wage.complete` 或更细的 worker manage 权限
  - 更新姓名、编号、联系方式、备注、active 状态
- `PUT /api/containers/:id/unloaders`
  - 新主路径：`unloadingWorkerId`
  - 旧字段 `workerUserId` 仅用于兼容读取/迁移，不作为新主路径

验收标准：
1. 不创建系统用户账号，也能创建一个可选拆柜临时工。
2. `GET /api/unloading-wage/workers` 返回临时工目录，不再依赖 active `WAREHOUSE` 用户。
3. 柜子详情保存拆柜人时使用临时工目录 id，并快照 worker code / worker name。
4. 重复选择同一临时工目录 id 返回明确 400。
5. 停用临时工后不能用于新 assignment，但历史柜子和历史结算仍显示 snapshot。
6. `HR_MANAGER`、普通 `OFFICE`、普通 `WAREHOUSE` 默认不能维护临时工目录或保存拆柜工资 assignment。
7. 已有 user-account-backed 旧数据不被破坏。
8. API unit/e2e 测试覆盖新目录、兼容旧数据、权限和重复校验。

测试命令：
pnpm --filter api lint
pnpm --filter api typecheck
pnpm --filter api test
pnpm --filter api test:e2e
