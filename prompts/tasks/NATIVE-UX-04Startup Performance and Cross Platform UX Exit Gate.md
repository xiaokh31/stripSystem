# 执行 NATIVE-UX-04：Startup Performance and Cross Platform UX Exit Gate

## 2026-07-15 当前交付范围

- 当前退出门禁只覆盖 Android 和 iOS Release 实机证据。
- Windows RNW/MSIX、Windows 视觉/性能/扫码设备证据已随 Windows 原生安装包路线归档，不再阻塞本 Task。
- 恢复 Windows 范围必须先获得产品批准，并同步解除 P6-MOBILE-09 至 13、任务索引和完成度报告的归档状态。

## 前置任务

- `NATIVE-UX-01`、`NATIVE-UX-02`、`NATIVE-UX-03`

## 必须读取与使用的 skills

- `AGENTS.md`、`CONTEXT.md`
- `NATIVE-UX-00Native Warehouse Console Visual Direction.md`
- `.codex/skills/mobile-native-scan-app/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- `.codex/skills/warehouse-scan-flow/SKILL.md`
- `docs/runbooks/native-scan-app-testing.md`
- `docs/runbooks/native-scan-app-release.md`
- `apps/mobile-scan-app/index.js`
- `apps/mobile-scan-app/src/app/`
- storage、auth restore、offline queue 与 load-jobs 启动路径

## 任务范围

1. 在同一真实设备与 release 构建上记录优化前基线，至少 5 次冷启动取中位数。
2. 为首帧、可操作 shell、任务列表可用增加开发期性能标记；生产日志不得包含 token、密码或敏感 payload。
3. 分析并优化启动关键路径，包括但不限于：
   - 设置、device ID、token/session、离线队列读取是否可安全并行或延后。
   - 首帧是否被 session 网络校验、health check、队列同步或任务请求阻塞。
   - 大型单体模块与非首屏 feature 是否可懒加载。
   - 列表虚拟化、memoization、稳定 callback 与不必要 re-render。
   - release bundle、Hermes 和平台构建配置是否正确启用且无重复依赖。
4. 保持快速首帧与安全鉴权平衡：缓存 shell 不代表已授权，服务端仍校验账号 active 和权限。
5. 更新 native testing/release runbook，记录测量设备、构建类型、方法、前后结果和剩余瓶颈。
6. 完成 Android、iOS 的视觉、i18n、无障碍与核心扫码回归；无法在当前平台实机验证的活动范围项目必须明确留作 release blocker，不得假定通过。

## 性能验收

- 三个关键启动指标相较基线至少改善 30%；或达到：首帧 <= 1.5s、可操作 shell <= 2.5s、
  正常 LAN 下任务列表可用 <= 4s。
- 使用 release 构建和冷启动，不以 Fast Refresh、debug 构建或热启动数据代替。
- 网络慢时先显示可操作 shell/最后成功任务数据及 stale 标识，不无限阻塞在空白启动页。
- 离线队列同步不得阻塞首帧和任务选择；同步仍保持幂等和真实后端确认规则。
- 不得通过跳过 session/permission 校验、伪造任务数据或减少必要审计换取速度。

## i18n 硬门禁

- 跑 native catalog parity、unmanaged visible strings、stable code mapping 和 locale persistence 测试。
- 手工覆盖登录、任务列表、扫描成功/错误、离线、设置、权限拒绝、session expired 与原生权限弹窗。
- 每种状态只显示当前语言；技术 code 仅可在诊断页按需查看。

## 回归重点

- 选中的 `loadJobId` 与提交扫描任务一致。
- duplicate scan 不重复扣库存。
- offline pending 不伪装成 loaded，重试不重复扣库存。
- supervisor override 权限、原因与审计不变。
- complete loading 与 dock requirement 不变。
- secure token 不出现在 AsyncStorage、日志或性能 trace。

## 测试命令

- `pnpm --filter mobile-scan-app lint`
- `pnpm --filter mobile-scan-app typecheck`
- `pnpm --filter mobile-scan-app test`
- `pnpm --filter mobile-scan-app android:check`
- `pnpm --filter mobile-scan-app ios:check`
- 已归档且当前不得执行：`pnpm --filter mobile-scan-app windows:check`
- `pnpm --filter api test:e2e`
- `git diff --check`

## 完成产物

- Android/iOS 截图或设备证据：登录、Bay Board、扫描工作台、离线/错误、设置，英文和中文。
- 优化前后性能表，注明设备、OS、release artifact、样本数与中位数。
- 修改文件、测试结果、已知限制和未完成实机 gate。
- 更新 `OPEN-FUNCTIONS-20260707Task Index.md` 与项目完成度报告；只有证据齐全才标记完成。
