# 执行 NATIVE-UX-02：Load Job Bay Board Redesign

## 前置任务

- `NATIVE-UX-01App Shell Navigation and Native I18n Foundation.md`

## 必须读取与使用的 skills

- `AGENTS.md`、`CONTEXT.md`
- `NATIVE-UX-00Native Warehouse Console Visual Direction.md`
- `.codex/skills/frontend-design/SKILL.md`
- `.codex/skills/mobile-native-scan-app/SKILL.md`
- `.codex/skills/warehouse-scan-flow/SKILL.md`
- `apps/mobile-scan-app/src/load-jobs/`
- 现有 load-job API contract 与测试

## 任务范围

1. 将登录后的装车任务选择做成首屏主体验 Bay Board。
2. 用虚拟化列表替换把全部任务放入页面级 `ScrollView` 的做法。
3. 每条任务稳定显示：目的仓、装车单号、月台、车辆、状态、已装/计划/剩余与进度。
4. 整行可点击进入扫码；打开中、禁用、刷新、loading、empty、error、offline/stale 状态完整。
5. 默认优先呈现进行中、可扫码且接近计划时间的任务；排序规则必须由现有真实字段稳定决定并测试。
6. 支持手动刷新；若 API 支持的数据规模需要搜索/筛选，使用目的仓、装车单号、月台或车辆的紧凑搜索，
   不增加装饰性筛选控件。

## 业务规则

- 列表只来自真实 API，不用 mock 数据，不从前端推算库存。
- 不能仅凭颜色区分 planned/in-progress/blocked/closed。
- 已关闭或不可扫码任务不得伪装为可进入任务；是否展示服从现有 API 与权限规则。
- 选择任务前后的 `loadJobId` 必须保持准确，避免扫码落到旧任务。
- 刷新不得清空已显示列表后闪白；失败时保留最后成功数据并明确其更新时间。

## 禁止的界面文本

任务首屏不得出现“real API”、endpoint、permission code、device ID、QR payload、native module、
实现架构说明。空状态只需告诉装车人员当前没有可处理任务，以及联系办公室发布/检查任务。

## i18n 硬门禁

- 任务字段标签、状态、进度、刷新、loading/empty/error/offline/stale、搜索与 accessibility 文案
  全部进入 native locale catalog。
- API status/enum/stable code 映射为当前 locale；不得显示双语状态或直接透传英文 message。
- 柜号、装车单号、月台号、车辆号、目的仓业务代码保持原值。
- 测试 English -> 中文 -> app restart -> English/中文持久化与单语显示。

## 验收标准

1. 已登录用户首屏第一视觉区域就是装车任务，常见手机视口无需滚动即可看到至少一条完整任务。
2. 操作员可在 3 秒内从任务行辨认目的仓、装车单、月台、车辆和进度。
3. 任务行在长装车单号、缺少月台、200% 字体缩放及 320px 宽度下不重叠、不截断关键操作。
4. 100 条任务滚动保持流畅，不因单行状态更新导致全列表明显重绘。
5. 任务选择、返回、刷新和错误恢复有自动测试。

## 测试命令

- `pnpm --filter mobile-scan-app lint`
- `pnpm --filter mobile-scan-app typecheck`
- `pnpm --filter mobile-scan-app test`
- `pnpm --filter api test:e2e`

## 手工验收

- 使用真实 planned/in-progress 装车任务在 Android、iOS 和 Windows 各验证一次。
- 验证 320/390px 手机、平板横屏和 Windows 扫码站布局。
- 验证英文、中文各页面没有同时出现另一语言的 UI 文案。

