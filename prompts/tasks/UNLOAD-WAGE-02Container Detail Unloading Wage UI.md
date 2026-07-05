执行 UNLOAD-WAGE-02：Container Detail Unloading Wage UI。

必须读取：
- AGENTS.md
- prompts/tasks/UNLOAD-WAGE-01Container Detail Unloading Wage API.md
- docs/product/02-work-hours-and-unloading-wage-settlement.md
- CONTEXT.md
- .codex/skills/bestar-domain/SKILL.md
- .codex/skills/nextjs-pwa-ui/SKILL.md

前置任务：
- UNLOAD-WAGE-01

任务范围：
1. 在现有 `/containers/[id]` 柜子详情页增加“拆柜工资信息”区。
2. 调用真实 API 保存和刷新。
3. 不做独立 pay-container 维护页。
4. 不做月度结算页。

页面要求：
1. 柜子标签选择：
   - `海柜`
   - `美转加`
2. 海柜：
   - 不显示或禁用 trailer number
   - 不显示或禁用关联柜号
   - 显示金额规则 CAD 300 / 条
3. 美转加：
   - trailer number 必填
   - 可添加已导入或手工创建的关联柜号
   - 显示关联柜号列表
   - 显示金额规则 CAD 360 / 组
4. 拆柜状态：
   - 至少支持 `已拆完`
   - 未完成状态要清楚显示不会进入月结
5. 拆柜人：
   - 每行一个 worker name 选项
   - 有“增加拆柜人”动作
   - 同一条柜或同一组美转加关联柜不能重复选择同一人
6. 保存后必须重新从 API 读取数据。
7. API validation 错误必须显示给用户。
8. 美转加关联后的相关柜子详情都能看到一致的 trailer number、关联柜号、拆柜状态和拆柜人。

验收标准：
1. 海柜详情可选择标签、标记已拆完、添加多个拆柜人并保存。
2. 美转加详情可填写 trailer number、关联多个柜号、标记已拆完、添加多个拆柜人并保存。
3. 缺少 trailer number、重复拆柜人、无效关联柜号都有清楚错误。
4. 页面刷新后数据仍在。
5. UI 不使用 mock business data。
6. 测试通过。

测试命令：
pnpm --filter web lint
pnpm --filter web typecheck
pnpm --filter web test
