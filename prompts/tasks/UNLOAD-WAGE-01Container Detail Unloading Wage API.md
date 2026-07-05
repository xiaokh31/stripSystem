执行 UNLOAD-WAGE-01：Container Detail Unloading Wage API。

必须读取：
- AGENTS.md
- prompts/agents/business-logic-agent.md
- docs/product/02-work-hours-and-unloading-wage-settlement.md
- CONTEXT.md
- .codex/skills/bestar-domain/SKILL.md
- .codex/skills/nestjs-prisma-api/SKILL.md
- apps/api/prisma/schema.prisma

任务范围：
1. 为现有 container detail 提供拆柜工资信息保存 API。
2. 支持柜子标签、trailer number、关联柜号、已拆完、拆柜人。
3. 可以使用内部 pay container / settlement unit 模型，但用户入口必须是 container detail API。
4. 不做 Web UI。
5. 不做月度结算页面。

API 建议：
- `PATCH /api/containers/:id/unloading-wage`
- `PATCH /api/containers/:id/unloading-wage-associations`
- `POST /api/containers/:id/complete-unloading`
- `PUT /api/containers/:id/unloaders`

业务要求：
1. 柜子标签支持：
   - `海柜`
   - `美转加`
2. 海柜规则：
   - 一个柜号算一条柜
   - 默认金额 CAD 300
   - 不需要 trailer number
   - 不需要关联柜号
3. 美转加规则：
   - 必须填写 trailer number
   - 支持关联多个已导入或手工创建柜号
   - 多个关联柜号合计算一条柜
   - 默认金额 CAD 360
4. 拆柜状态必须支持 `已拆完`。
5. `已拆完` 与 pallet loaded / load job completed 是不同概念，不允许复用 pallet `LOADED` 作为拆柜完成。
6. 拆柜人：
   - 一行一个 worker name
   - 支持多人
   - 同一条柜或同一组美转加关联柜不能重复同一人
7. 美转加关联后，每个相关柜子的详情 API 都必须返回同一 trailer number、关联柜号、拆柜状态和拆柜人。
8. 修改标签、trailer number、关联柜号、已拆完、拆柜人必须写审计记录。
9. 如果已生成月度结算后再修改拆柜数据，相关结算必须标记为需要复核、作废或 superseded。
10. API 必须使用 DTO validation，不能信任前端状态。

验收标准：
1. 海柜 container 可保存标签、标记已拆完、添加多个拆柜人。
2. 美转加 container 缺少 trailer number 时保存失败并返回明确错误。
3. 美转加 container 可关联多个柜号，关联柜详情返回一致数据。
4. 重复拆柜人被拒绝。
5. 每次修改都有审计记录。
6. 不影响现有 pallet loaded / scan transaction 规则。
7. API 单元测试和 e2e 测试通过。

测试命令：
pnpm --filter api lint
pnpm --filter api typecheck
pnpm --filter api test
pnpm --filter api test:e2e
