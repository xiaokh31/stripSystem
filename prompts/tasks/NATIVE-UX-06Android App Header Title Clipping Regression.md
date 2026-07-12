# 执行 NATIVE-UX-06：Android App Header Title Clipping Regression

## 前置任务

- `NATIVE-UX-05System Adaptive Color Theme.md` 代码实现完成。

## 必须读取与使用的 skills

- `AGENTS.md`、`CONTEXT.md`
- `NATIVE-UX-00Native Warehouse Console Visual Direction.md`
- `.codex/skills/frontend-design/SKILL.md`
- `.codex/skills/mobile-native-scan-app/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- Native App header、theme styles、i18n catalog 和现有 Android 裁剪回归记录

## 问题

相同 `appName` catalog 在 iOS 左上角显示 `BESTAR SCAN`，Android 现场只显示 `BESTAR`。
代码没有 Android 专用短标题，因此优先按 Android 字体测量、flex 可用宽度、系统字体缩放或文本
像素裁剪回归处理，不能直接改短品牌名掩盖问题。

## 任务范围

1. 在报告问题的 Android 机型/等效小屏 release build 复现并记录：屏幕宽度、density、font scale、
   locale、theme、标题实际布局宽度与 settings action 宽度。
2. 检查 header flex shrink/grow、`numberOfLines`、ellipsize、textTransform、font weight、letter spacing、
   Android font padding 和右侧设置按钮是否挤压标题。
3. 让 `BESTAR SCAN` 与中文品牌名在可用宽度内完整显示；必要时允许品牌区占剩余宽度、标题字号在
   明确的有限档位自适应，或在极窄宽度使用经产品定义的双行布局。
4. 不允许无省略标记地静默裁掉 `SCAN`，也不允许标题覆盖设置按钮、状态栏或刘海区域。
5. light/dark、English/中文、Android/iOS/Windows 共享布局语义；修复不得使 iOS 标题回归。

## i18n 硬门禁

- 品牌文案继续由 Native catalog 管理；不得在 Android JSX/Kotlin 中硬编码单独标题。
- English 与中文分别单语显示，不采用 `BESTAR / 百事达` 双语拼接。
- settings accessibilityLabel 等 touched 文案继续覆盖 `en` / `zh-CN`。

## 验收标准

1. 报告机型 release build 完整显示 `BESTAR SCAN`，不是只显示 `BESTAR`。
2. 320/360/390px 宽度、font scale 1.0/1.3/2.0、light/dark、en/zh-CN 无非预期裁剪或重叠。
3. 设置按钮保持至少 44x44 触控区和清晰焦点/无障碍标签。
4. 标题修复不导致首屏布局跳动或明显启动性能回归。
5. 增加 header layout/component regression，并保存 Android/iOS 对照截图。

## 测试命令

- `pnpm --filter mobile-scan-app lint`
- `pnpm --filter mobile-scan-app typecheck`
- `pnpm --filter mobile-scan-app test`
- `pnpm --filter mobile-scan-app android:check`
- `pnpm --filter mobile-scan-app ios:check`
- `git diff --check`

