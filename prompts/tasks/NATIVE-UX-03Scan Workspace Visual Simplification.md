# 执行 NATIVE-UX-03：Scan Workspace Visual Simplification

## 前置任务

- `NATIVE-UX-02Load Job Bay Board Redesign.md`

## 必须读取与使用的 skills

- `AGENTS.md`、`CONTEXT.md`
- `NATIVE-UX-00Native Warehouse Console Visual Direction.md`
- `.codex/skills/frontend-design/SKILL.md`
- `.codex/skills/mobile-native-scan-app/SKILL.md`
- `.codex/skills/warehouse-scan-flow/SKILL.md`
- `.codex/skills/auth-rbac/SKILL.md`
- `apps/mobile-scan-app/src/scan/`
- `apps/mobile-scan-app/src/offline-queue/`
- 当前扫描工作台组件与测试

## 任务范围

1. 重做已选装车任务的扫描工作台，保持任务身份与进度始终清晰可见。
2. 主操作只突出“扫描标签”；扫码枪输入保持自动聚焦，键盘/手工输入作为紧凑备用方式。
3. 最近扫描结果用高对比状态区显示柜号、目的仓、托盘号和更新后进度。
4. 离线队列默认只显示数量与同步状态，详细记录按需展开。
5. 月台修改、主管覆盖、完成装车按权限与状态放入次级区域/确认流程，不与主扫描动作竞争。
6. 删除常用页面中的实现说明段落，将必要技术诊断移至 Settings/Diagnostics。

## 必须保留的业务行为

- 所有库存变化仍只通过真实 scan transaction API。
- 离线扫描不得显示为已装车；成功同步后才更新业务进度。
- duplicate、already loaded、invalid label、not in plan、plan full、closed job、unauthorized、
  supervisor override 等状态完整保留。
- 切换任务必须清除或明确隔离旧任务待提交输入；队列记录保留原 `loadJobId`。
- 主管覆盖继续要求权限、原因和显式确认；历史事件不可覆盖。

## 文案要求

不要显示 `QR payload`、API、module、permission code 或审计实现说明。面向操作员使用“托盘标签”、
“等待同步”、“此任务无权操作”等业务语言。错误必须给出下一步动作，但不占用常驻大段空间。

## i18n 硬门禁

- 所有扫描状态、按钮、确认、错误、队列、权限态、accessibility 文案进入 native catalog。
- API stable error code 映射 locale 文案；后端 message 只进入受控诊断，不直接成为主 UI 文案。
- 原生相机权限与设置跳转提示必须覆盖 en / zh-CN。
- locale 切换时当前任务与队列状态不丢失，屏幕只显示当前语言。

## 验收标准

1. 进入任务后无需滚动即可看到任务身份、进度和主扫描动作。
2. 连续扫描期间不因提示高度变化造成主按钮/输入框跳动。
3. 扫码枪 Enter、相机、手动输入、离线入队/同步、重复扫描和主管覆盖均无回归。
4. 常用扫描页不含面向开发者的说明性文本。
5. 200% 字体缩放、320px 宽度、横屏和 Windows 键盘操作可用。

## 测试命令

- `pnpm --filter mobile-scan-app lint`
- `pnpm --filter mobile-scan-app typecheck`
- `pnpm --filter mobile-scan-app test`
- `pnpm --filter api test:e2e`

