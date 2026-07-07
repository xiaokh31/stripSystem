执行 WAGE-P2-05：Full Web I18n Copy Coverage。

必须读取：
- AGENTS.md
- prompts/agents/business-logic-agent.md
- prompts/tasks/WAGE-P2-04Locale Aware Status and Business Labels.md
- docs/product/02-work-hours-and-unloading-wage-settlement.md
- .codex/skills/nextjs-pwa-ui/SKILL.md
- .codex/skills/auth-rbac/SKILL.md
- .codex/skills/bestar-domain/SKILL.md
- apps/web/package.json
- apps/web/src/app/layout.tsx
- apps/web/src/components/i18n/
- apps/web/src/lib/i18n/
- apps/web/src/app/
- apps/web/src/components/
- apps/web/src/lib/

前置任务：
- WAGE-P2-04

任务范围：
1. 对 `apps/web/src/app`、`apps/web/src/components`、`apps/web/src/lib` 做完整 i18n 覆盖审查。
2. 补齐所有用户可见文本、按钮、表头、空状态、错误标题、权限提示、状态说明、placeholder、title、aria-label 的中英文翻译。
3. 修复硬编码中文或硬编码英文导致 locale 切换后不变的问题。
4. 修复 dynamic message、模板字符串、API error fallback、状态组合句的翻译策略。
5. 不改 API 合同，不改业务计算，不引入 mock 数据。

必须覆盖的页面/组件：
1. Shell / navigation：
   - `apps/web/src/components/layout/`
   - `apps/web/src/app/page.tsx`
   - `apps/web/src/app/reports/page.tsx`
2. Auth / admin / settings：
   - `apps/web/src/app/login/page.tsx`
   - `apps/web/src/components/auth/`
   - `apps/web/src/app/admin/`
   - `apps/web/src/components/admin/`
   - `apps/web/src/app/settings/page.tsx`
   - `apps/web/src/components/settings/`
3. Import / container / correction：
   - `apps/web/src/app/imports/`
   - `apps/web/src/components/imports/`
   - `apps/web/src/app/containers/`
   - `apps/web/src/components/containers/`
4. Reports：
   - `apps/web/src/app/reports/inventory/page.tsx`
   - `apps/web/src/components/reports/`
   - `apps/web/src/app/unloading-summary/page.tsx`
5. Wage workflows：
   - `apps/web/src/app/work-hours/page.tsx`
   - `apps/web/src/components/wage/`
   - `apps/web/src/app/unloading-wage/page.tsx`
6. Loading / mobile scan：
   - `apps/web/src/app/load-jobs/`
   - `apps/web/src/components/load-jobs/`
   - `apps/web/src/app/mobile/`
   - `apps/web/src/components/mobile/`

当前已知高风险点：
1. `apps/web/src/components/containers/container-unloading-wage-panel.tsx`
   - 存在 `未保存工资单元`、`海柜`、`美转加`、`已拆完时间`、`标记已拆完` 等中文硬编码。
2. `apps/web/src/components/containers/container-unloading-wage-flow.ts`
   - 存在中文业务 label 和 completion status label。
3. `apps/web/src/app/unloading-summary/page.tsx`
   - summary rule 和 status badge 显示 raw enum / mixed text。
4. `apps/web/src/components/load-jobs/load-job-card.tsx`
   - status badge 显示 raw `IN_PROGRESS` / `COMPLETED`。
5. `apps/web/src/components/load-jobs/load-job-management-panel.tsx`
   - status select option 显示 raw enum。
6. `apps/web/src/components/mobile/mobile-scan-panel.tsx`
   - offline queue status 显示 raw lower-case status。
7. `apps/web/src/components/imports/import-upload-form.tsx`
   - upload queue status labels 使用 lower-case 英文。
8. `apps/web/src/components/wage/wage-display.ts`
   - wage/import/generated status 仍以原始状态字符串作为 label。

业务显示要求：
1. English locale：所有普通用户可见业务文案应为英文，允许保留品牌、代码、container number、permission code、API code、文件名等不可翻译实体。
2. 中文 locale：所有普通用户可见业务文案应为中文，允许保留 API code、permission code、enum code、文件名、柜号等技术/业务编号。
3. 不允许普通用户可见区域出现双语同时显示，例如：
   - `已送库 (LOADED)`
   - `Unloaded / 已拆完`
   - `Summary includes API rows from completed unloading / UNLOADED / LOADING_IN_PROGRESS / LOADED`
4. 如果页面确实需要展示 enum code，必须有明确审计/调试用途，并与用户主 label 分开。
5. 不得通过隐藏一门语言的文本来伪装切换；切换 locale 后 DOM 中主文案应真实变更。

建议实现方向：
1. 建立一份 i18n coverage checklist，逐页扫描并记录已覆盖/例外项。
2. 将散落在 helper 中的文案迁移到 i18n catalog 或 typed message keys。
3. 对 API error fallback 做通用翻译：可显示 API `code`，但 message fallback 应可本地化。
4. 对表格列名、metric label、button label、empty state、permission提示、status notice 做统一翻译。
5. 对动态文案使用参数化翻译，不要把整句拼接后交给 DOM observer 尝试匹配。

验收标准：
1. `apps/web/src/app`、`apps/web/src/components`、`apps/web/src/lib` 中的用户可见文本已纳入 i18n 或明确标记为不可翻译实体。
2. 英文 locale 下，不出现中文业务文案。
3. 中文 locale 下，不出现未翻译的普通英文业务文案。
4. 状态 badge、status select、filter option、summary rule、metric label 均按 locale 单语显示。
5. placeholder、title、aria-label 可按 locale 切换。
6. 组件 helper 不再固定返回中文作为主显示文本。
7. 没有新增 mock 数据。
8. 测试通过。

建议测试命令：
pnpm --filter web lint
pnpm --filter web typecheck
pnpm --filter web test
pnpm --filter web build

手工检查建议：
1. 在英文 locale 打开主导航、imports、containers、container detail、inventory report、work-hours、unloading-wage、unloading-summary、load-jobs、mobile scan、admin、settings。
2. 切换到中文 locale，逐页确认文案变化。
3. 针对每页检查状态 badge、下拉选项、按钮、placeholder、错误提示、空状态。
4. 使用浏览器搜索当前页面是否存在中英混排的状态 label。

完成输出：
1. 列出改动文件。
2. 列出 i18n coverage checklist。
3. 列出保留 raw code/enum 的位置和理由。
4. 列出测试命令和结果。
5. 明确说明是否仍存在未翻译页面或已知例外。
