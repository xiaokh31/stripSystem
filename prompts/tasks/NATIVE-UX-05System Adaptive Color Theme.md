# 执行 NATIVE-UX-05：System Adaptive Color Theme

## 前置任务

- `NATIVE-UX-01App Shell Navigation and Native I18n Foundation.md`
- `NATIVE-UX-02Load Job Bay Board Redesign.md`
- `NATIVE-UX-03Scan Workspace Visual Simplification.md`
- `NATIVE-UX-04Startup Performance and Cross Platform UX Exit Gate.md` 的代码侧优化已完成；
  未完成的实机性能证据可与本任务合并采集。

## 必须读取与使用的 skills

- `AGENTS.md`、`CONTEXT.md`
- `docs/adr/0003-native-scan-app.md`
- `docs/product/01-cross-platform-mobile-scan-app.md`
- `NATIVE-UX-00Native Warehouse Console Visual Direction.md`
- `.codex/skills/frontend-design/SKILL.md`
- `.codex/skills/mobile-native-scan-app/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- `apps/mobile-scan-app/src/app/App.tsx`
- `apps/mobile-scan-app/src/ui/styles.ts`
- `apps/mobile-scan-app/src/i18n/native-i18n.ts`
- Android `styles.xml` / manifest、iOS `Info.plist` / launch screen、Windows app theme 配置

## 问题

Native app 当前使用固定浅色值，Android 主题也明确继承 Light theme。当操作系统切换
浅色/深色模式时，React Native 内容、状态栏、导航栏、键盘、启动画面和原生扫码界面可能
出现配色冲突、闪白、文字不可读或应用与系统风格割裂。

## 产品决定

1. 默认主题模式为 `跟随系统`，支持系统浅色和系统深色。
2. 系统在应用运行期间切换主题时，界面必须立即更新，无需重启或重新登录。
3. 本任务不要求跟随 Android Material You、Windows accent 或任意系统壁纸提取色。
   平台动态强调色可作为后续增强，但不得改变业务状态颜色语义。
4. 不新增手动“浅色/深色/跟随系统”选择器；本期只实现可靠的系统自适应，避免增加设置复杂度。

## 任务范围

### 1. 语义化主题系统

- 将 `apps/mobile-scan-app/src/ui/styles.ts` 中固定颜色重构为语义 token 和主题工厂，至少包含：
  `background`、`surface`、`surfaceRaised`、`textPrimary`、`textSecondary`、`border`、
  `focus`、`actionPrimary`、`actionDisabled`、`success`、`warning`、`error` 及对应柔和背景。
- 提供 Loading Bay Dispatch Console 的 light/dark 两套 token，不在组件内散落颜色判断。
- 保留 Bay Board 的装车任务信息层级；深色模式不能退化成一整片深蓝/黑色，也不能牺牲任务行分隔。
- 状态不得只依赖颜色，必须继续使用图标、文案、边框或结构表达。

### 2. 系统主题监听

- 使用 React Native 系统 color scheme 能力读取 `light` / `dark`，`null` 时使用明确且测试过的
  fallback，默认 light。
- 监听运行中的系统主题变化，刷新 theme context/token；不得重置当前 screen、登录 session、
  已选 `loadJobId`、扫描输入或离线队列状态。
- 缓存/创建 styles，避免每次按键或扫描结果更新时重建整套样式并造成无意义重绘。

### 3. Native chrome 与启动一致性

- Android：移除强制 Light theme，配置 DayNight；同步 status bar、navigation bar、图标明暗、
  keyboard appearance 和原生 scanner activity，检查系统 force dark 不会二次反色。
- iOS：允许跟随系统 interface style；同步 status bar、launch screen、keyboard 和原生相机/扫码界面。
- Windows：跟随应用/系统 theme，处理 title bar、窗口背景、系统高对比模式和焦点可见性。
- 启动原生画面与首个 React Native frame 的背景色必须匹配当前系统主题，避免明显白闪/黑闪。
- 相机预览本身不套主题滤镜；只调整其控制层、文字、遮罩和系统 chrome。

### 4. 全流程覆盖

以下界面和状态必须同时适配 light/dark：

- session restore / 启动状态。
- 登录页。
- Bay Board：loading、ready、empty、error、offline/stale、disabled/opening。
- Scan Workspace：成功、警告、错误、最近扫描、扫码输入、相机入口。
- 离线队列、主管覆盖、完成装车、确认和 disabled 状态。
- Settings/Diagnostics、语言切换、连接状态和退出登录。
- 系统键盘、状态栏、导航栏、原生相机权限和 scanner activity。

## 可访问性与颜色验收

- 普通文字和背景对比度至少达到 WCAG AA `4.5:1`；大号/粗体文字至少 `3:1`；
  控件边界、焦点和状态图形至少 `3:1`。
- success/warning/error 在 light/dark 中保持相同业务含义，不得把系统 accent 当作状态色。
- Windows 高对比模式下不允许通过硬编码背景覆盖用户必需的系统可见性设置。
- 200% 字体缩放、320px 手机宽度、平板横屏和 Windows 键盘焦点无重叠或不可见操作。

## i18n 硬门禁

- 如新增主题相关的用户可见说明、系统设置跳转、权限提示或 accessibilityLabel，必须进入
  native `en` / `zh-CN` catalog。
- 主题切换不得改变 locale，也不得造成中英文同时显示。
- API 继续返回 stable code / enum / raw data；主题层不得引入或显示技术 code。
- 增加 locale x theme 组合回归：`en-light`、`en-dark`、`zh-CN-light`、`zh-CN-dark`。

## 性能约束

- 主题初始化不得新增阻塞式 storage 读取或网络请求。
- 主题跟随系统，不需要持久化自定义主题值。
- 对比 `NATIVE-UX-04` 的启动指标；主题系统不得使首帧或可操作 shell 中位数退化超过 10%。
- 运行中切换主题不得重复请求装车任务、重复同步离线队列或触发 session restore。

## 明确非目标

- 不改扫描 API、库存计算、重复扫描、主管覆盖、权限和审计规则。
- 不使用 mock 装车任务。
- 不把办公室 Web 的主题系统直接复制到 Native app。
- 不为主题适配引入大型 UI framework、网络字体或远程主题服务。
- 不允许组件通过任意十六进制颜色绕过主题 token；平台原生配置所需颜色须集中记录。

## 自动测试

1. Theme resolver：light、dark、null fallback。
2. 系统主题变化后选中任务、screen、locale 与用户输入不变。
3. 样式 token 完整性：light/dark key parity，禁止 touched UI 出现未受管固定颜色。
4. StatusBar/native chrome 配置随主题变化。
5. locale x theme 四种组合的关键文案和状态渲染。
6. 主题切换不触发 load-job refresh、session restore 或 offline sync。

## 测试命令

- `pnpm --filter mobile-scan-app lint`
- `pnpm --filter mobile-scan-app typecheck`
- `pnpm --filter mobile-scan-app test`
- `pnpm --filter mobile-scan-app android:check`
- `pnpm --filter mobile-scan-app ios:check`
- `pnpm --filter mobile-scan-app windows:check`
- `git diff --check`

## 手工验收

1. Android、iOS、Windows 分别以 release 构建启动 light 和 dark 模式。
2. 应用保持在 Bay Board 和 Scan Workspace 时，从系统设置实时切换 light/dark。
3. 验证 screen、登录状态、选中任务、扫描输入和离线队列不丢失，且没有额外 API 请求。
4. 验证启动画面到首帧无明显白闪/黑闪；状态栏、导航栏、键盘和 scanner activity 一致。
5. 每个平台保存 `en-light`、`en-dark`、`zh-CN-light`、`zh-CN-dark` 关键页面截图。
6. Windows 额外验证系统高对比模式；Android 额外验证 force dark；iOS 额外验证系统自动日落切换。

## 验收标准

1. 默认可靠跟随系统 light/dark，并支持运行中实时切换。
2. 所有常用与异常状态在两种主题中清晰可读，满足对比度要求。
3. Native chrome、启动画面、键盘和原生扫码界面与应用主题一致。
4. 主题切换不影响业务状态、不重复调用业务流程、不造成明显性能回归。
5. 四种 locale x theme 组合单语显示且测试通过。
6. 三端无法完成的实机项必须保留为 release blocker，不得标记完整完成。

