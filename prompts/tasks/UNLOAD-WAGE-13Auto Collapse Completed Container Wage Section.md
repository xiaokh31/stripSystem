# 执行 UNLOAD-WAGE-13：Auto Collapse Completed Container Wage Section

## 前置任务

- `WEB-I18N-06Full Localization No Flash Regression Gate.md`
- 可与 `UNLOAD-INVENTORY-02` 同批实现，但不得耦合库存计算到 UI 折叠状态。

## 必须读取与使用的 skills

- `AGENTS.md`、`CONTEXT.md`
- `.codex/skills/frontend-design/SKILL.md`
- `.codex/skills/nextjs-pwa-ui/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- `apps/web/src/components/containers/container-unloading-wage-panel.tsx`
- `apps/web/src/components/containers/container-unloading-wage-flow.ts`
- container detail page/API types and unloading wage tests

## 业务与交互规则

1. 未完成拆柜时，拆柜工资 Section 默认展开，保持现有填写流程。
2. 用户成功点击“标记已拆完”后，Section 自动收起。
3. 已完成记录再次打开/刷新柜子详情时默认收起。判断使用持久业务字段
   `unloadingWage.completedAt` / pay-container completion，而不是只看 container status；因为后续 container
   会变成 `LOADING_IN_PROGRESS` 或 `LOADED`，拆柜完成事实仍成立。
4. 用户可随时手动展开查看或在有权限时处理复核；展开不改变任何业务状态。
5. completed record 变为 NEEDS_REVIEW 时默认仍收起，但 header 明确显示“需复核”；错误/权限阻塞需要用户
   处理时可自动展开一次并聚焦提示。

## UI 要求

- 收起时保留紧凑 header summary：Section 名称、分类、柜号/Trailer、拆柜人数、完成时间/状态。
- 使用熟悉的 chevron icon button，至少 44x44；`aria-expanded`、`aria-controls`、Enter/Space 完整。
- 不使用大段“如何展开”的说明，不显示实现术语。
- 展开/收起不能丢失尚未保存 draft；成功完成后的自动收起发生在 API 成功后，失败时保持展开并显示错误。
- 页面重新获取 container 后，local expand intent 与新 completion 状态要有明确、可测试的同步规则。

## i18n 硬门禁

- Section summary、展开/收起 tooltip、aria-label、完成/复核状态全部进入 en/zh catalog。
- 动态 summary 使用 typed params，English/中文只显示当前语言，不依赖 DOM translator。
- English 长文案与中文均不得挤压 chevron 或状态。

## 验收标准

1. Draft/incomplete container 默认展开。
2. 完成 API 成功后自动收起；API 失败不收起。
3. completed、later loading、loaded container 刷新后默认收起且可手动展开。
4. 手动展开不触发 API、不改变工资或柜子状态。
5. NEEDS_REVIEW summary 可见，必要错误可自动展开。
6. desktop/mobile、en/zh、light/dark、keyboard/screen reader 测试通过。

## 测试命令

- `pnpm --filter web lint`
- `pnpm --filter web typecheck`
- `pnpm --filter web test`
- `pnpm --filter web build`
- focused container detail Playwright smoke
- `git diff --check`

