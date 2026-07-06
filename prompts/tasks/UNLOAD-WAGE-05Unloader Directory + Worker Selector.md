执行 UNLOAD-WAGE-05：Unloader Directory and Worker Selector。

状态：已作废，不再执行。

作废原因：
- 旧任务把拆柜工人选项建模为系统用户或可复用系统用户。
- 业务已确认：拆柜工人大多是临时工，不一定拥有员工账号、邮箱、密码或登录权限。
- 后续实现不得要求每个拆柜工人都有 `users` 表账号或 `WAREHOUSE` 角色。

替代任务：
- `prompts/tasks/UNLOAD-WAGE-06Temporary Unloader Directory API.md`
- `prompts/tasks/UNLOAD-WAGE-07Temporary Unloader Selector UI.md`
- `prompts/tasks/WAGE-QA-03Temporary Unloader Directory Regression.md`

旧任务中应删除的要求：
1. 拆柜人选项来源于 active `WAREHOUSE` / `WAREHOUSE_MANAGER` 用户。
2. 保存拆柜人必须提交 `workerUserId`。
3. 后端必须通过 `workerUserId` 解析 worker name / worker code。
4. 历史无 `workerUserId` 的拆柜人必须重新选择系统用户。

保留的业务方向：
1. 柜子详情仍然使用 worker selector，不回退到一次性自由文本保存。
2. 拆柜人必须来自真实、持久化的人员目录，不能是前端硬编码或 mock list。
3. 仓管经理可以增加多个拆柜人，每行一个人员选择。
4. 同一条海柜或同一组美转加不能重复选择同一拆柜人。
5. 月结继续使用保存时的 worker code / worker name snapshot，历史结算不能被后续改名静默改变。
