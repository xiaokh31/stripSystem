执行 UNLOAD-WAGE-10：Monthly Unloading Data Summary UI。

必须读取：
- AGENTS.md
- prompts/agents/business-logic-agent.md
- docs/product/02-work-hours-and-unloading-wage-settlement.md
- prompts/tasks/UNLOAD-WAGE-09Monthly Unloading Data Summary API Export.md
- CONTEXT.md
- .codex/skills/bestar-domain/SKILL.md
- .codex/skills/nextjs-pwa-ui/SKILL.md
- apps/web/src/lib/api-client.ts
- apps/web/src/lib/permissions.ts
- apps/web/src/lib/i18n/
- apps/web/src/app/

前置任务：
- UNLOAD-WAGE-09

任务范围：
1. 增加每月拆柜数据总结页面。
2. 调用真实 API 按月加载已拆完柜子。
3. 提供导出 Excel 动作和下载链接。
4. 显示缺少 completion date 等 review warnings。
5. 不实现拆柜工资结算；工资结算仍属于 `/unloading-wage`。

页面建议：
- `/unloading-summary`
- 或放在 Reports 下，但导航文案必须清楚区分“拆柜数据总结”和“拆柜工资结算”。

页面要求：
1. 月份筛选，默认当前月。
2. Summary 区显示：
   - selected month
   - completed unloading container count
   - ocean / US-to-Canada count if API provides
   - warning count
3. 明细表显示：
   - container number
   - current container status
   - unloading completed date
   - wage tag: `海柜` / `美转加`
   - trailer number for `美转加`
   - destination/service lines
   - cartons/count/pallet text
   - reference / appointment / note fields when available
4. 状态过滤说明中明确包含：
   - `已拆完` / `UNLOADED`
   - `LOADING_IN_PROGRESS`
   - `LOADED`
5. Export 按钮调用 `POST /api/unloading-summary/exports`。
6. 导出成功后显示 generated file 下载链接。
7. 权限：
   - `OFFICE`、`WAREHOUSE_MANAGER`、`ADMIN` 可查看/导出
   - 普通 `WAREHOUSE` 默认不可查看/导出
8. 页面数据必须来自 API，不能前端自行扫描所有柜子拼真相。

验收标准：
1. Office 用户能打开页面并按月份查看已拆完柜子。
2. 页面包含 `UNLOADED`、`LOADING_IN_PROGRESS`、`LOADED` 的已拆完数据。
3. 未标记已拆完的 `LABELS_GENERATED` 柜子不显示为已完成。
4. 缺少 completion date 的 review warning 可见。
5. 导出后出现下载链接，链接走 Web/API 代理路径，不暴露内部 storage path。
6. 无权限用户看不到入口或收到清楚的 permission message，API 仍返回 403。
7. Web unit/type/build 通过，必要时增加 Playwright smoke。

测试命令：
pnpm --filter web lint
pnpm --filter web typecheck
pnpm --filter web test
pnpm --filter web build
