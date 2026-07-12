# 执行 NATIVE-UX-00：Native Warehouse Console Visual Direction

本任务只固化 native 扫码端的产品与视觉方向，不修改运行时代码。后续
`NATIVE-UX-01` 至 `NATIVE-UX-04` 必须先读取本文件。

## 必须读取

- `AGENTS.md`
- `CONTEXT.md`
- `docs/adr/0003-native-scan-app.md`
- `docs/product/01-cross-platform-mobile-scan-app.md`
- `.codex/skills/frontend-design/SKILL.md`
- `.codex/skills/mobile-native-scan-app/SKILL.md`
- `.codex/skills/warehouse-scan-flow/SKILL.md`
- `.codex/skills/auth-rbac/SKILL.md`
- `apps/mobile-scan-app/src/app/App.tsx`
- `apps/mobile-scan-app/src/ui/styles.ts`
- `apps/mobile-scan-app/src/load-jobs/load-job-view-model.ts`

## 主题与单一目标

主题：Loading Bay Dispatch Console（装车月台调度台）。

受众是佩戴手套、在仓库/PDA/平板/Windows 扫码站上快速操作的装车人员。
应用登录后的单一首要目标是：快速辨认并选择正确的装车任务，然后进入扫码。

这不是办公室后台、技术诊断工具或产品介绍页。API 配置、设备标识、权限代码、
实现模块说明只允许出现在设置或受控诊断入口，不得占用日常任务和扫码页面。

## 视觉方向

设计关键词：high-visibility、dock-readable、task-first、glove-friendly、calm urgency。

颜色 token：

- Loading paper `#F4F6F3`：页面浅底色。
- Bay charcoal `#202A2E`：标题、顶栏和高对比文字。
- Safety amber `#E6A817`：等待、待处理、当前工作任务。
- Signal teal `#087F6D`：连接正常、扫码成功、完成进度。
- Alert red `#C63C32`：阻塞与错误，禁止用于普通装饰。
- White `#FFFFFF`：任务行与操作面。

不得使用渐变、装饰性光斑、营销 hero、大段说明、嵌套卡片或大圆角胶囊。
业务面板圆角不超过 8px。状态不能只靠颜色表达。

字体使用离线可用的平台系统字体，不为本任务引入网络字体。柜号、装车单号、
托盘数量与时间使用 tabular numbers。标题紧凑，装车单号和目的仓拥有最高视觉权重。

## Signature：Bay Board

装车任务列表采用类似仓库月台派工板的高密度任务行，而不是通用卡片流：

```text
┌──────────────────────────────────────┐
│ 装车任务                    3 个待处理 │
├──────────────────────────────────────┤
│ YVR2   LOAD-2026-0711-01     18 / 24 │
│ 4 号月台 · Truck 28           75%  → │
├──────────────────────────────────────┤
│ YYC4   LOAD-2026-0711-02       0 / 16 │
│ 待分配月台 · Truck 31           0%  → │
└──────────────────────────────────────┘
```

每行必须在不展开详情的情况下回答：去哪里、哪张装车单、哪个月台/车辆、装了多少、
当前是否可扫码。整行是稳定的大触控目标；任务间不能因加载文字变化发生布局跳动。

## 信息架构

1. 未登录：品牌名、账号、密码、登录。首次缺少服务器配置时给出简短业务提示和设置入口。
2. 已登录首屏：连接状态小标识、当前用户、装车任务 Bay Board、刷新入口。
3. 任务工作台：返回/切换任务、任务身份、装车进度、主扫描动作、最近结果。
4. 次级操作：离线队列、月台修改、主管覆盖、完成装车按权限和当前状态按需展开。
5. 设置/诊断：服务器地址、设备编号、连接测试、版本和必要诊断信息。

不得在常用页面显示：

- `API base URL`、endpoint、HTTP 状态或“使用真实 API”等实现说明。
- role/permission 原始 code 列表。
- `QR payload`、JWT、token、module、React Native、native bridge 等技术术语。
- 对开发架构、浏览器差异、审计实现方式的说明段落。

必要的业务提示必须保留，例如：连接中断、扫描待同步、无权完成装车、标签无效、
重复扫描、任务已关闭。提示应说明用户现在能做什么，不解释代码如何实现。

## i18n 硬门禁

1. Native app 建立 `en` 与 `zh-CN` locale catalog，所有可见文案、状态、错误、空状态、
   按钮、placeholder、accessibilityLabel、hint 和原生权限说明进入 catalog。
2. API 只提供 stable code、enum 与 raw data；客户端将 code 映射为当前语言文案。
3. 任一页面只能显示一种语言，不允许中英文并排或以另一语言作为可见 fallback。
4. 柜号、装车单号、车辆号、月台号、人员姓名等业务原始值不翻译。
5. locale 持久化，重启后保持；未知 key 在测试中失败，不在生产 UI 暴露 key/code。

## 性能预算

必须以同一台真实设备、release 构建、至少 5 次冷启动的中位数建立优化前基线。
记录以下指标，不接受仅凭主观感受声明“更快”：

- Process start -> first native frame。
- Process start -> login screen 或已登录任务 shell 可操作。
- 已保存有效会话时，process start -> 装车任务列表可用。
- JS bundle 启动耗时、首屏不必要渲染次数与网络请求时序。

目标：关键指标相较基线至少改善 30%；若设备已足够快，则 release 构建目标为首帧
不超过 1.5 秒、可操作 shell 不超过 2.5 秒、正常 LAN 下任务列表不超过 4 秒。
无法达到时必须提供测量证据、瓶颈和后续建议，不得虚报通过。

## 验收标准

1. 本文件明确任务优先、技术文案隔离、Bay Board、i18n 和性能预算。
2. 不改变扫描交易、离线队列、重复扫描、权限或库存业务规则。
3. 不引入 mock 装车任务。
4. 后续实现拆分为 `NATIVE-UX-01` 至 `NATIVE-UX-04`。
5. `git diff --check` 通过。

## 测试

- `git diff --check`

