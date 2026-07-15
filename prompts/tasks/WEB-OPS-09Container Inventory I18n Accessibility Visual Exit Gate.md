# 执行 WEB-OPS-09：Container Inventory I18n Accessibility Visual Exit Gate

## 优先级与前置任务

- 优先级：P0 柜子/库存优化关闭门禁。
- 前置任务必须达到受监督终态：WEB-OPS-06、WEB-OPS-07、WEB-OPS-08。
- 本任务只做跨任务回归、修复发现的问题和证据收敛；不得重新实现平行搜索、排序或分页逻辑。

## 必须读取与使用

- `AGENTS.md`、`CONTEXT.md`、`prompts/agents/business-logic-agent.md`
- `.codex/skills/frontend-design/SKILL.md`
- `.codex/skills/nextjs-pwa-ui/SKILL.md`
- `.codex/skills/nestjs-prisma-api/SKILL.md`
- `.codex/skills/bestar-domain/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- WEB-OPS-03、05、06、07、08 的任务、实现、tests 和结果
- WEB-I18N-04/05/06、WEB-THEME、WEB-DASHBOARD-06 既有门禁
- Docker local deployment/E2E runbook

## 关闭目标

在真实 Docker full stack 中证明：两个 fuzzy combobox、柜子创建时间及六种排序、库存 5/10/20/50 服务端分页、
global totals、准确 selection、人工消库存和自适应布局可以同时工作，并且不破坏 i18n、RBAC、主题、库存事务或审计。

## 业务与 API 回归

1. 搜索 ranking 为 exact -> prefix -> contains，快速输入 last-request-wins；选择后 mutation identity 是稳定 ID。
2. 柜子索引包含无 active inventory 的真实柜子，createdAt、effective status、counts 与详情一致。
3. 容器索引和库存页三字段六方向使用同一稳定排序 helper；翻译文本不参与 API 排序。
4. 分页只影响当前页 items；`totalItems/totals` 和全局目的仓汇总不随页码改变。
5. 人工消库存只产生 `ADJUSTED_OUT` 和 audit，loaded 不变；并发不重复扣减，selection/page/sort 刷新后保持。
6. API suggestion/list/pagination 均在相应 permission 下工作，无 load-job permission 绕过、无 N+1 或无界 pallet hydration。

## i18n 100% 硬门禁

1. 扫描 06-08 touched app/components/helpers/tests：所有可见 text、placeholder、option、loading/empty/error、pagination、
   sort、tooltip、title、aria-label 和动态数量消息必须使用 typed translator/catalog。
2. `en` / `zh-CN` key 和插值参数完全一致；缺 key、raw enum/labelKey、后端英文 message、双语 fallback 必须让测试失败。
3. English 页面不得出现中文；中文页面不得出现非业务数据英文。柜号、目的仓代码和 ISO `dateTime` 属性属于数据，
   可保留，但 ISO 不作为主显示。
4. 中文 SSR、hydration、refresh、client navigation、combobox 请求完成和 polling refresh 从首帧到稳定态均为中文；
   禁止 DOM walker、MutationObserver、body hidden/opacity 或延迟翻译。
5. locale/theme 切换保留 query/page/sort/selection 和未提交 adjustment draft，不重复 mutation。

## 可访问性与交互门禁

1. combobox/listbox 的 role、expanded、active descendant、option selected、焦点返回和键盘操作完整；Escape/Tab 行为可预测。
2. sort direction、pagination disabled/current state、selected container 和 internal-scroll region 有名称，不依赖颜色。
3. 200% zoom、长英文、移动端 soft keyboard 场景下 dropdown 不被 header/table 裁切，option 文本不越界。
4. 页面级 horizontal overflow 为 0；table 只在自身滚动。短内容 grid 不 stretch，长内容局部 scroll 可键盘进入/退出。

## 高信号视觉矩阵

为避免再次生成无价值的 236 张笛卡尔积截图，本任务只覆盖受影响页面和互补组合，自动行为断言仍完整：

- Routes：`/containers`、`/inventory`，并包含从搜索选择进入一个真实 container detail 的跳转断言。
- 1366x768：en/zh-CN × light/dark 全组合。
- 390x844、768x1024：使用互补 locale/theme，两个页面都覆盖。
- 1920x1080、2560x1440：使用互补 locale/theme，验证 2048 workspace、表格和 adaptive grid。
- 1366x768 的 125%/200%：两种 locale 至少各一次，覆盖 combobox 展开、pagination 和长英文。
- Roles：ADMIN、inventory read+adjust、inventory read-only、无 inventory read；权限矩阵不与所有 viewport 做笛卡尔积。
- 最终产品截图上限建议 36 张；只有发现具体 viewport 缺陷时才增加针对性截图，并在结果中说明原因。

所有最终截图必须逐张查看，但不得重复检查完全相同像素或无关 Dashboard/Settings 页面。自动几何 JSON、DOM/i18n
断言和截图各自承担不同证据，不能用大量截图替代行为测试。

## 执行效率约束

1. 先读取 06-08 已通过的 focused evidence，只重跑与当前 diff 有关的 focused tests；不得开场就重复所有 full suites。
2. 修复阶段使用 focused unit/spec 和单一 Chromium project；源码稳定后再进行一次 API/Web full suite、一次 production
   build 和一次最终视觉矩阵。
3. E2E image 只有 source/manifest 变化才重建；无变化时复用缓存。每次非零退出先读取完整错误并修复根因，不盲目重复命令。
4. 最终结果必须记录 build-bearing commands、E2E attempts、失败原因和耗时；不能只写最后 `1/1 passed` 隐藏重试成本。
5. 不能以提速为由跳过 i18n、RBAC、事务、审计、cleanup、build 或视觉检查；目标是消除重复验证，不是降低正确性门槛。

## 验收标准

1. 06-08 全部需求在真实 full stack 同时通过，无跨页面 contract 漂移。
2. typed i18n、SSR/hydration、双语切换、动态状态和 200% zoom 达到 100%，无混语或 raw code。
3. 搜索可访问性、六种排序、四种 page size、global totals、selection/draft preservation、自适应高度全部通过。
4. inventory transaction、并发、RBAC、audit 和后端 source of truth 无回归，fixture 精确清理。
5. Docker API/Web lint、typecheck、unit/E2E、production build、focused Chromium、healthcheck、`git diff --check` 通过。
6. 更新 Task index 和项目完成度报告，并如实列出总 wall time、命令/重建/E2E 次数和已知限制。

## 完成输出

- 按 Spec / Standards / i18n / accessibility / inventory invariants 汇总最终结论。
- 列出 API/Web 测试数量、E2E 行为矩阵、最多 36 张最终截图路径和逐张检查结果。
- 列出 fixture 排序序列、page metadata、global totals、adjustment/audit 前后证据和 cleanup。
- 列出本任务真实 wall time、build-bearing commands、E2E attempts、重试根因；不得只给最终通过数。
