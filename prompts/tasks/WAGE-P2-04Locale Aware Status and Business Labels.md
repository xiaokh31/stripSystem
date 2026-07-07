执行 WAGE-P2-04：Locale Aware Status and Business Labels。

必须读取：
- AGENTS.md
- prompts/agents/business-logic-agent.md
- docs/product/02-work-hours-and-unloading-wage-settlement.md
- prompts/tasks/UNLOAD-WAGE-11Restore Loading Completed Status Regression.md
- prompts/tasks/WAGE-QA-04Unloaded Status and Monthly Summary Regression.md
- .codex/skills/bestar-domain/SKILL.md
- .codex/skills/nextjs-pwa-ui/SKILL.md
- apps/web/package.json
- apps/web/src/app/layout.tsx
- apps/web/src/components/i18n/
- apps/web/src/lib/i18n/
- apps/web/src/components/containers/container-files-flow.ts
- apps/web/src/components/containers/container-status-flow.ts
- apps/web/src/components/containers/container-status-control.tsx
- apps/web/src/components/containers/container-unloading-wage-flow.ts
- apps/web/src/components/wage/wage-display.ts
- apps/web/src/components/load-jobs/
- apps/web/src/components/mobile/
- apps/web/src/components/reports/

前置任务：
- UNLOAD-WAGE-11
- WAGE-QA-04

当前检查结论：
1. 工时结算、拆柜工资、拆柜数据总结、`UNLOADED` / `LOADED` 生命周期相关任务在代码中已有对应 API、页面和测试痕迹。
2. 但 i18n 没有完成到可验收状态。当前 Web 主要依赖 DOM 文本替换和 `apps/web/src/lib/i18n/locales/*` 词典，状态 helper 仍会直接返回中文或 raw enum。
3. 已发现的明确风险：
   - `containerStatusLabel("LOADED")` 当前返回 `已送库`，英文界面会直接出现中文。
   - `containerStatusSelectLabel()` 当前可能返回 `已送库 (LOADED)`，属于用户可见的双语/混合状态显示。
   - `container-unloading-wage-flow.ts` 返回 `海柜`、`美转加`、`已拆完，可进入月结` 等中文业务标签，英文界面无法可靠切换。
   - `wage-display.ts`、load job、mobile offline queue、unloading summary 等多个 StatusBadge 仍直接显示 raw status。
   - `apps/web` 当前没有 i18n 单元测试。

任务范围：
1. 建立 locale-aware 的状态和业务标签 helper，不能继续让 helper 直接返回固定中文。
2. 覆盖以下状态/业务标签的中英文映射：
   - container lifecycle status：
     - `IMPORTED`
     - `PARSED`
     - `CORRECTED`
     - `REPORT_GENERATED`
     - `LABELS_GENERATED`
     - `UNLOADED`
     - `LOADING_IN_PROGRESS`
     - `LOADED`
     - `ERROR`
   - container status 中文业务名：
     - `UNLOADED`：`已拆完`
     - `LOADING_IN_PROGRESS`：`装车中`
     - `LOADED`：`已送库`
   - container status English business name：
     - `UNLOADED`：`Unloaded`
     - `LOADING_IN_PROGRESS`：`Loading in progress`
     - `LOADED`：`Delivered to warehouse`
   - unloading wage completion status：
     - `DRAFT`
     - `COMPLETED`
     - `NEEDS_REVIEW`
     - `SETTLED`
     - `SUPERSEDED`
   - pay classification：
     - `OCEAN_CONTAINER`
     - `US_TO_CANADA_TRANSFER`
   - load job status：
     - `PLANNED`
     - `IN_PROGRESS`
     - `COMPLETED`
     - `CANCELLED`
   - generated/import/upload/queue status：
     - `UPLOADED`
     - `PARSING`
     - `PARSED`
     - `WARNING`
     - `GENERATED`
     - `FAILED`
     - `queued`
     - `uploading`
     - `success`
     - `duplicate`
     - `invalid`
     - `pending`
     - `synced`
3. 状态 helper 必须按当前 locale 输出单语文本，不允许在普通用户界面显示 `已送库 (LOADED)`、`Unloaded / 已拆完` 这类双语混排。
4. 如果业务需要保留 raw enum 用于审计或排错，只能放在 title、aria-description、开发者细节区，不能作为主要用户可见 label。
5. 保留 API enum，不改后端状态值。
6. 不改 container lifecycle、scan、wage calculation、settlement 业务规则。

建议实现方向：
1. 优先把翻译能力从纯 DOM 替换扩展为组件可调用的 `t()` / `useTranslation()` 或等价 helper。
2. 共享 status label helper 应接收 locale，或返回 message key 后由组件翻译。
3. 不要依赖“先输出中文再被 DOM observer 翻回英文”的副作用。
4. 对 dynamic message 建立明确模板，不要让模板字符串靠词典碰运气。

建议文件：
- apps/web/src/lib/i18n/
- apps/web/src/components/i18n/
- apps/web/src/components/containers/container-files-flow.ts
- apps/web/src/components/containers/container-status-flow.ts
- apps/web/src/components/containers/container-status-control.tsx
- apps/web/src/components/containers/container-unloading-wage-flow.ts
- apps/web/src/components/wage/wage-display.ts
- apps/web/src/components/load-jobs/
- apps/web/src/components/mobile/
- apps/web/src/components/reports/

验收标准：
1. 英文 locale 下，柜子状态显示为 `Unloaded`、`Loading in progress`、`Delivered to warehouse`，不出现 `已拆完`、`装车中`、`已送库`。
2. 中文 locale 下，柜子状态显示为 `已拆完`、`装车中`、`已送库`，不出现主要英文状态名。
3. `LOADED` 在 container lifecycle 场景中中文显示为 `已送库`，不能显示成 `已装车` 或 `已拆完`。
4. pallet/load job 的 `Loaded` 语义仍可显示为 `Loaded` / `已装车`，不能和 container `LOADED=已送库` 混用。
5. 所有状态下拉框、badge、summary status、filter option 使用 locale-aware label。
6. 普通用户可见区域不出现双语同时显示。
7. 新增 Web 单元测试覆盖翻译 helper 和关键 status label matrix。

建议测试命令：
pnpm --filter web lint
pnpm --filter web typecheck
pnpm --filter web test
pnpm --filter web build

完成输出：
1. 列出改动文件。
2. 列出新增/更新的 status label matrix。
3. 列出测试命令和结果。
4. 明确说明 `LOADED` 在 container 状态和 pallet/load job 语义中的不同显示。
