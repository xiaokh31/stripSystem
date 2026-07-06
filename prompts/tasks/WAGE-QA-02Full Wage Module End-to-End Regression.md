执行 WAGE-QA-02：Full Wage Module End-to-End Regression。

变更说明：
- 本任务覆盖 `UNLOAD-WAGE-05` 旧版“系统用户/真实人员选项”后的全量回归。
- 业务已确认拆柜工人多为临时工，不应要求员工账号。
- `UNLOAD-WAGE-05` 已作废；完成临时工目录变更后，最终验收应执行
  `prompts/tasks/WAGE-QA-03Temporary Unloader Directory Regression.md`。

必须读取：
- AGENTS.md
- prompts/agents/business-logic-agent.md
- docs/product/02-work-hours-and-unloading-wage-settlement.md
- docs/architecture/09-account-role-permission-management.md
- docs/runbooks/work-hours-settlement-regression.md
- prompts/tasks/WAGE-QA-01Work Hours End-to-End Regression.md
- prompts/tasks/WAGE-P2-03Wage Manager Roles + Permission UX.md
- prompts/tasks/UNLOAD-WAGE-01Container Detail Unloading Wage API.md
- prompts/tasks/UNLOAD-WAGE-02Container Detail Unloading Wage UI.md
- prompts/tasks/UNLOAD-WAGE-03Monthly Unloading Wage Settlement API.md
- prompts/tasks/UNLOAD-WAGE-04Monthly Unloading Wage Settlement UI.md
- prompts/tasks/UNLOAD-WAGE-05Unloader Directory + Worker Selector.md
- CONTEXT.md
- .codex/skills/qa-regression/SKILL.md
- .codex/skills/auth-rbac/SKILL.md
- .codex/skills/bestar-domain/SKILL.md
- .codex/skills/nestjs-prisma-api/SKILL.md
- .codex/skills/nextjs-pwa-ui/SKILL.md

前置任务：
- WAGE-QA-01
- WAGE-P2-03
- UNLOAD-WAGE-01
- UNLOAD-WAGE-02
- UNLOAD-WAGE-03
- UNLOAD-WAGE-04
- UNLOAD-WAGE-05
- Docker full-stack smoke 已完成

任务范围：
1. 对完整 wage 模块做最终回归，不新增业务功能。
2. 覆盖人事工时结算、拆柜工资结算、两个经理角色、拆柜人真实选项、生成文件、下载、审计和 Docker 全栈路径。
3. 如发现缺口，优先修复小缺陷；如果是新业务规则不明确，记录为 blocker 并停止扩大实现。
4. 不引入 mock business data。
5. 不绕过 API 权限，只允许用真实角色/权限完成验证。

必须验证的人事工时链路：
1. `HR_MANAGER` 可以进入 `/work-hours`。
2. `HR_MANAGER` 可以上传 `samples/wage/workAttendanceRecordForm_June.xls`。
3. 重复上传按 SHA-256 拒绝或清晰返回已有记录。
4. 可以解析 attendance import，并显示员工日记录、warnings/errors。
5. parser errors 时不能生成正式 wage record。
6. warnings only 时可生成 wage record。
7. 生成的 wage record `.xls` 和 task report 均有 generated file 记录和下载链接。
8. `WAREHOUSE_MANAGER` 默认不能上传、解析或生成 attendance wage record。

必须验证的拆柜工资链路：
1. `WAREHOUSE_MANAGER` 可以进入一个真实或手工创建的 `/containers/[id]`。
2. 海柜可选择 `海柜`，不需要 trailer number，金额规则 CAD 300 / 柜。
3. 美转加可选择 `美转加`，必须填写 trailer number，可关联多个柜号，合计 CAD 360 / 组。
4. 拆柜人来自真实人员选项，不是前端硬编码或自由文本主路径。
5. 可增加多个拆柜人，每行一个人员选项。
6. 同一条柜或同一组美转加不能重复选择同一拆柜人。
7. 标记 `已拆完` 后记录进入月结候选；未拆完记录不进入月结。
8. 关联后的任一相关柜子详情都显示一致 trailer number、关联柜号、拆柜状态和拆柜人。
9. `/unloading-wage` 可按月份生成结算。
10. 月结显示每个人工资和当月拆了哪些柜子。
11. 海柜按 CAD 300 / 柜计算，美转加按 CAD 360 / 组计算，不能按关联柜号重复计费。
12. 多拆柜人默认均分，或按已实现的手工金额/比例规则计算。
13. 生成结算 JSON 和 HTML task report 均有 generated file 记录和下载链接。
14. 修改已结算拆柜数据后，旧结算被标记为 needs review、superseded 或等效不可直接使用状态。
15. `HR_MANAGER` 默认不能编辑拆柜工资，也不能生成 unloading wage settlement。

角色和权限验收：
1. `ADMIN` 拥有全部 wage 权限。
2. `HR_MANAGER` 只拥有 attendance wage 权限，不拥有 unloading wage 权限。
3. `WAREHOUSE_MANAGER` 只拥有 unloading wage 权限，不拥有 attendance wage 权限。
4. 普通 `OFFICE` 默认不拥有 `attendance.*` 或 `unloading_wage.*`。
5. 普通 `WAREHOUSE` 默认不拥有 `unloading_wage.*`。
6. API 403 覆盖不能只靠前端隐藏按钮。
7. Web 导航和页面动作与 API 权限一致。

Docker full-stack 验收：
1. 使用 `docs/runbooks/local-deployment.md` 的 nginx 路径验证：
   - Web: `http://127.0.0.1/`
   - API: `http://127.0.0.1/api`
2. 不以 host `pnpm --filter api dev` 或 `pnpm --filter web dev` 作为默认验收路径。
3. Docker API 容器内 migrations 已应用。
4. 浏览器下载链接走 Web 代理路径，不暴露内部 storage path。
5. 测试或 smoke 生成的 storage 文件如果不是正式样例，完成后需要清理或明确记录为 runtime artifact。

自动化测试要求：
1. 跑全量或最小完整相关自动化：
   - worker wage / unloading wage tests
   - API unit + e2e
   - Web unit/type/build
   - 已有 Playwright/e2e wage smoke（如存在）
2. 如果已有测试缺少上述业务点，需要补测试。
3. 若测试会生成 storage runtime 文件，测试结束后不要把 runtime 文件提交。

建议命令：
cd apps/worker-python && uv run pytest
pnpm --filter api lint
pnpm --filter api typecheck
pnpm --filter api test
pnpm --filter api test:e2e
pnpm --filter web lint
pnpm --filter web typecheck
pnpm --filter web test
pnpm --filter web build
docker compose -f infra/docker/compose.local.yml ps

验收输出：
1. 列出改动文件。
2. 列出测试命令和结果。
3. 列出手工 Docker full-stack 验证步骤和结果。
4. 列出已清理或保留的 runtime artifact。
5. 明确结论：
   - `wage module complete`
   - 或列出 blocker / remaining task。
