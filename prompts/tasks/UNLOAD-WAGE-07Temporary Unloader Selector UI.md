执行 UNLOAD-WAGE-07：Temporary Unloader Selector UI。

必须读取：
- AGENTS.md
- prompts/agents/business-logic-agent.md
- docs/product/02-work-hours-and-unloading-wage-settlement.md
- prompts/tasks/UNLOAD-WAGE-06Temporary Unloader Directory API.md
- prompts/tasks/UNLOAD-WAGE-02Container Detail Unloading Wage UI.md
- CONTEXT.md
- .codex/skills/bestar-domain/SKILL.md
- .codex/skills/auth-rbac/SKILL.md
- .codex/skills/nextjs-pwa-ui/SKILL.md
- apps/web/src/app/containers/[id]/page.tsx
- apps/web/src/components/containers/container-unloading-wage-panel.tsx
- apps/web/src/components/containers/container-unloading-wage-flow.ts
- apps/web/src/lib/api-client.ts

前置任务：
- UNLOAD-WAGE-06

任务范围：
1. 将柜子详情拆柜人 selector 改为读取临时工目录。
2. 支持仓管经理手动录入临时拆柜工人。
3. 在“增加拆柜人”后仍然使用 worker selector 选择目录人员。
4. 移除“拆柜工人必须是系统用户账号”的 UI 假设。
5. 不改月结算法。

业务要求：
1. 拆柜工人是临时工，可以没有员工账号、邮箱、密码或登录权限。
2. `WAREHOUSE_MANAGER` 和 `ADMIN` 可以从柜子详情或相邻管理入口创建临时工目录记录。
3. selector 只显示 active 临时工。
4. 新增临时工成功后，可以自动选中或立即出现在 selector 中。
5. 每行拆柜人保存目录 id，不保存一次性自由文本作为主路径。
6. 旧的 user-backed assignment 或只有 worker name snapshot 的历史记录必须能显示。
7. 历史记录如果缺少目录 id，页面应提示这是 legacy snapshot；用户重新保存时应选择一个目录 worker。
8. 同一柜或同一美转加组重复选择同一临时工，前端保存前提示，API 仍做最终校验。
9. 错误状态显示 API code/message。

页面要求：
1. `/containers/[id]` 加载 `GET /api/unloading-wage/workers` 的临时工目录。
2. 拆柜人列使用 select / combobox。
3. 提供新增临时工入口，最少可录入：
   - name
   - worker code（如果后端自动生成，可不填）
   - phone/contact note（可选）
   - note（可选）
4. 停用的临时工不出现在新 selector 中。
5. 已保存但停用的历史人员仍显示 snapshot，并提示不再可用于新选择。
6. 保存成功后 refresh from API。
7. 无权限用户不能看到可执行的新增临时工或保存拆柜人动作。

验收标准：
1. 仓管经理无需创建员工账号，就能新增一个临时拆柜工人。
2. 新增后的临时工可在柜子详情“增加拆柜人”行中选择。
3. 可以给同一条柜选择多名不同临时工。
4. 重复选择同一临时工会被前端和 API 拒绝。
5. 刷新页面后，已选临时工仍显示。
6. 美转加关联柜任一详情页都显示同一临时工列表。
7. 旧 user-backed 或 legacy snapshot 不丢失显示。
8. UI 不使用 mock worker list 或硬编码人员。

测试命令：
pnpm --filter web lint
pnpm --filter web typecheck
pnpm --filter web test
pnpm --filter web build
