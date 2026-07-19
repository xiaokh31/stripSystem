# 执行 PARSER-PROFILE-04：Office Mapping Wizard and Failed Import Flow

## 优先级与前置任务

- 优先级：P0 办公室解析教学工作流。
- 前置任务：PARSER-PROFILE-01 至 03 必须 `DONE`。
- 后续任务：`PARSER-PROFILE-05Completion Snapshot Approval and Profile Governance.md`。
- 本 Task 不自动进入后续任务。

## 必须读取与使用

- `AGENTS.md`、`HANDOFF.md`、`CONTEXT.md`
- `docs/product/04-adaptive-parser-profiles.md`
- `.codex/skills/frontend-design/SKILL.md`
- `.codex/skills/nextjs-pwa-ui/SKILL.md`
- `.codex/skills/auth-rbac/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- import detail/actions/flow、manual container form/flow、API client、typed i18n、permission helpers
- PARSER-PROFILE-03 API contracts 与现有 no-flash locale/theme E2E 门禁

## 产品目标

解析失败后，办公室人员无需离开原导入上下文即可创建/恢复 learning case，在受控 workbook preview 中确认字段映射，并继续完成手工拆柜报告。界面面向业务操作，不显示 JSON、正则代码、内部 enum 或 storage path 等技术说明。

## 路由与入口

1. Import detail 在明确 parse failure/unsupported 状态下显示“建立解析模板”入口；普通 retry parse 与 manual report 入口仍保留。
2. 点击入口幂等创建/恢复 learning case，并进入稳定 URL，例如 `/imports/{id}/parser-learning`。
3. 直接从 case 返回 import/manual container/detail 时保留 draft；刷新、locale/theme 切换和浏览器前进后退不丢状态。
4. `parser_profiles.train` 无权限时不显示 mutation control；直接访问仍由 API 403，Web 显示本地化权限提示。

## Mapping Wizard 结构

用紧凑、工作型 UI 完成以下步骤，不创建营销式 hero 或嵌套 cards：

1. **原始结构**：sheet selector、header area、data start/stop、merged/header preview。
2. **字段映射**：柜号、目的仓、箱数、体积、运单/reference、派送方式、备注和明确包装证据。
3. **转换规则**：只提供 allowlisted controls（select/toggle/number/lookup rows），不允许自由输入代码。
4. **数据行规则**：空行、汇总行、stop marker、include/exclude predicates。
5. **结果预览**：canonical rows、destination totals、provenance、warnings/errors。
6. **手工结果**：创建或打开关联的 manual unloading report，明确显示 source import 关联。
7. **对账与提交**：显示 replay diff，满足条件后提交 DRAFT candidate；不能显示为“已批准”。

## 交互要求

- Candidate suggestion 要显示 reason 和“不确定/需确认”状态；用户必须确认 required mapping。
- Source preview 使用 windowed/paginated table，只读取 bounded API 数据；大 workbook 不渲染全表 DOM。
- 每个 canonical field 可定位并高亮 source header/cell sample；provenance 不只是隐藏 metadata。
- Mapping 更改采用 revision guard；409 stale draft 必须提示 reload/merge，不能静默覆盖。
- Preview/replay 使用固定高度状态区域，旧请求不能覆盖新 draft 的结果。
- Draft auto-save 需要 debounce、latest-write-wins 与明确保存状态；失败后可重试。
- Manual report 创建 payload 使用 `learningCaseId`，不得继续只把 import ID 写进 reason/note。
- Validation 聚焦第一个无效 control，键盘可完成 sheet/field/transform/submit 操作。

## 状态展示

至少覆盖 loading、empty workbook、unsupported workbook、inspection limit、draft saving/saved/error、preview running、preview warnings/errors、replay mismatch、awaiting completion、submitted draft、permission denied 和 worker unavailable。

## 严格 i18n 硬门禁

1. 所有 heading、step、field、button、dialog、tooltip、placeholder、table header、save state、empty/error、match reason、warning/diff、ARIA 和 keyboard text 必须进入 typed `en`/`zh-CN` catalogs。
2. API stable code 通过 helper 映射；不得把后端英文 `message`、raw enum、operation code 或 JSON path 作为主文案。
3. Customer header/cell values 是业务原文，可原样显示；不得和 UI fallback 拼成双语 label。
4. English/中文切换、refresh、SSR/hydration 不闪现另一语言，不出现 mixed bilingual state。
5. 长英文 transformation/mismatch 文案在 390/768/1366/1920、200% zoom 下不遮挡 mapping controls 或 preview cells。
6. 新页面必须通过现有 explicit translator AST/catalog parity/no-flash gates。

## Accessibility 与视觉

- 使用 semantic table/combobox/listbox/tabs/fieldset；熟悉图标使用现有 icon library 并有 tooltip/aria-label。
- Source cell selection、mapping row、warning 与 diff 不能只靠颜色表达。
- Error summary 与 field error 关联；focus order 和 DOM order 与业务步骤一致。
- Preview/mapping 区域采用内容驱动高度与局部 bounded scroll，不产生页面级横向 overflow。
- 不显示代码相关提示性描述或内部 pipeline 术语占用主界面。

## 非目标

- 不做 profile approval、pause/retire、3 次 evidence 或 auto-parse。
- 不允许用户上传 mapping script。
- 不改变 pallet/report/inventory/wage/loading scan 规则。

## 验收标准

1. 真实 parse-failed import 可从详情进入 wizard，并在刷新/返回后恢复同一 case/draft。
2. 办公室用户可通过业务控件完成 mapping、preview、关联 manual report、replay diff 和 submit DRAFT。
3. UI 明确区分 candidate/submitted/awaiting completion 与 approved/trusted，不误导用户。
4. stale request/revision、worker failure、大 workbook 和权限不足均可恢复。
5. ADMIN/OFFICE 可按权限操作；WAREHOUSE/HR_MANAGER 默认无入口且 API 403。
6. 全部可见状态双语完整、单语显示、无首帧闪烁和关键 viewport/zoom 布局问题。

## 必须增加或执行的测试

- Web unit：wizard reducer/state machine、draft serialization、revision conflict、stale preview、manual payload link、stable-code i18n mapping。
- API client contract tests：inspect/draft/preview/replay/submit，禁止 internal storage path。
- Docker Chromium：真实失败 import -> wizard -> map -> preview -> manual link -> replay -> submit；refresh/resume、keyboard、RBAC。
- Locale/theme matrix：English/zh-CN、light/dark、390/768/1366/1920、200% zoom；检查无混语/overflow/hydration warning。
- Docker Web lint/typecheck/unit/production build、focused E2E/healthcheck 和 `git diff --check`。

## 完成输出

- 列出 route、wizard state、API calls、draft recovery 和 manual link 行为。
- 列出 i18n keys/稳定 code mapping 与双语视觉证据。
- 更新任务索引、完成度报告和 `HANDOFF.md`。
- 下一建议任务只能是 PARSER-PROFILE-05。
