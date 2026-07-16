# WEB-OPS-09 柜子/库存关闭门禁报告

## 结论

状态：完成。WEB-OPS-06、07、08 的柜号联想、柜子索引、稳定排序、库存服务端分页、全局汇总、稳定选择、RBAC、人工消库存及自适应工作区已在同一 Docker full stack 中兼容通过。没有 schema 或 migration 变更，也没有剩余外部验收项。

本次按五个维度关闭门禁：

- Spec：`/containers`、`/inventory`、稳定 ID 详情跳转、六种排序、5/10/20/50 page size、全局 totals、跨页 selection 和人工消库存均保持既有 contract。
- Standards：改动局限于 Web 页面/组件、测试和直接相关文档；Docker-only lint、typecheck、test、build、migration status、healthcheck 和 diff check 全部通过。
- i18n：语言切换不再 reload 页面；cookie、客户端 translator 和 Server Component refresh 由可观察的 transition 完成状态协调，未提交 adjustment draft 保留。移除 `/containers` 唯一路由级 loading boundary，避免禁用 JavaScript 时永久停在 loading 首帧。
- Accessibility：柜子索引、库存柜子汇总、目的仓汇总和 adjustment history 的横向滚动区均有 heading 名称且可键盘聚焦；combobox、`aria-sort`、分页 disabled/current、Escape/Tab、focus return 和 200% zoom 均通过。
- Inventory invariants：人工消库存只产生 `ADJUSTED_OUT`；remaining `5 → 4 → 3`、adjusted `0 → 1 → 2`、loaded 恒为 `0`；同 pallet 并发结果为 `201/409`，没有重复扣减，actor/reason/note/pallet eventId 全部可审计。

## 实现中关闭的问题

1. 库存联想选择存在 stable-ID boundary 竞态：URL 和选中行已更新时，右侧 workspace 仍可能显示未选择。现在 suggestion selection 在导航前同步写入共享 selection boundary。
2. 语言切换原先依赖整页 reload，会丢弃未提交表单。现在先持久化 locale、立即更新 client translator，再以 React transition 刷新 Server Components；切换期间语言控件暴露 `aria-busy` 并禁止重叠切换。
3. `/containers/loading.tsx` 在 no-JS 浏览器中无法执行 React streaming replacement，永久停在 loading shell。删除该路由级 boundary 后，完整柜子索引直接进入 SSR 文档。
4. 多个横向表格 wrapper 缺少可访问名称和键盘入口。现在全部由对应 heading `aria-labelledby`，使用 `role="region"` 和 `tabIndex={0}`。
5. 历史 Chromium 用例在 Server Component refresh 后使用无范围 `tbody` strict locator，误匹配框架候选节点；已限定到 `main` 内第一个真实表体。no-JS SSR 用例也会等待路由内容完成流式返回。

## 自动化结果

| 门禁 | 结果 |
| --- | --- |
| API lint | 通过 |
| API typecheck | 通过（19.2s） |
| API unit | 31/31 suites，249/249 tests，通过（16.9s Jest；21.1s 命令） |
| API E2E | 18/18 suites，110/110 tests，通过（97.9s） |
| API production build | `nest build`，通过 |
| Web lint | 通过 |
| Web typecheck | 通过 |
| Web unit | 223/223，通过（15.1s 命令） |
| Web production build | Next.js compile、TypeScript、page data/static generation，通过 |
| Worker | 127/127，通过（372.59s） |
| Prisma | 22 migrations；database schema up to date |
| 最终 Chromium | `locale-switch.spec.ts` + `web-ops-exit-gate.spec.ts`，2/2，通过（4.1m） |
| Health | API/Web/nginx/PostgreSQL/Redis/Worker/static assets/storage 全部通过 |
| Cleanup | `WEBOPS09%` container 0；临时管理员 0 |

API E2E 曾有一次命令误写为 `test:e2e -- --runInBand`，Jest 将参数当作文件 pattern，0 tests 并退出 1；随即使用仓库正确命令 `test:e2e --runInBand` 完整执行 110 项并通过。该次未收集测试不计为验证结果。

## Chromium 行为与证据

最终测试覆盖：

- 两个 fuzzy combobox 的 exact/prefix/contains 结果、active descendant、selected option、Escape/Tab、focus return、Enter 选择及稳定 ID 详情跳转。
- `/containers` 和 `/inventory` 的 en/zh-CN、light/dark、390×844、768×1024、1366×768、1920×1080、2560×1440，以及真实 125%/200% zoom。
- ADMIN、OFFICE read+adjust、read-only、无 inventory.read 四类角色。
- query/page/pageSize/sort/selection、主题、locale 和未提交 adjustment draft 保持。
- UI adjustment、并发同 pallet adjustment、audit history、global totals 与 cleanup。

`test-results/web-ops-09/geometry-evidence.json` 有 20 条记录，覆盖两个 route、两种 locale、两种 theme、五种 viewport、100/125/200% zoom；document overflow、main viewport failure 和最大 document overflow 均为 0。

`test-results/web-ops-09/inventory-mutation-evidence.json` 记录：

- before：active/remaining 5，adjusted 0，loaded 0；
- after UI：active/remaining 4，adjusted 1，loaded 0；
- after concurrent：active/remaining 3，adjusted 2，loaded 0；
- concurrent statuses：`[201, 409]`；
- 两条 history 分别保存 `SCAN_MISSED` / `DATA_CLEANUP`、真实 note、actor id、pallet id 和 eventId。

`test-results/web-ops-09/browser-diagnostics.json` 的 `browserErrors` 与 `serverErrors` 均为空。

## 最终视觉产物

以下 27 张 PNG 已逐张以原始分辨率检查，全部通过；无混语、raw status、页面级横向溢出、不可读控件或业务内容遮挡。`*-main-overlay.png` 是刻意遮罩并标记 2048 workspace 的几何证据；OFFICE 长页 full-page 图中的固定 shell 分片是 Playwright 长页拼接表现，正常 viewport 和 DOM/geometry 均无重复节点。

1. `test-results/web-ops-09/containers-en-dark-1366x768-zoom-100-role-admin-full.png`
2. `test-results/web-ops-09/containers-en-dark-390x844-zoom-100-role-admin-full.png`
3. `test-results/web-ops-09/containers-en-light-1366x768-zoom-100-role-admin-full.png`
4. `test-results/web-ops-09/containers-en-light-1366x768-zoom-125-role-admin-viewport.png`
5. `test-results/web-ops-09/containers-en-light-2560x1440-zoom-100-role-admin-full.png`
6. `test-results/web-ops-09/containers-en-light-2560x1440-zoom-100-role-admin-main-overlay.png`
7. `test-results/web-ops-09/containers-zh-CN-dark-1366x768-zoom-100-role-admin-full.png`
8. `test-results/web-ops-09/containers-zh-CN-dark-1920x1080-zoom-100-role-admin-full.png`
9. `test-results/web-ops-09/containers-zh-CN-light-1366x768-zoom-100-role-admin-full.png`
10. `test-results/web-ops-09/containers-zh-CN-light-1366x768-zoom-200-role-admin-viewport.png`
11. `test-results/web-ops-09/containers-zh-CN-light-768x1024-zoom-100-role-admin-full.png`
12. `test-results/web-ops-09/inventory-dialog-en-light-1366x768-zoom-100-role-office-full.png`
13. `test-results/web-ops-09/inventory-en-dark-1366x768-zoom-100-role-admin-full.png`
14. `test-results/web-ops-09/inventory-en-dark-1366x768-zoom-200-role-admin-viewport.png`
15. `test-results/web-ops-09/inventory-en-dark-390x844-zoom-100-role-admin-full.png`
16. `test-results/web-ops-09/inventory-en-light-1366x768-zoom-100-role-admin-full.png`
17. `test-results/web-ops-09/inventory-en-light-1366x768-zoom-100-role-no-inventory-full.png`
18. `test-results/web-ops-09/inventory-en-light-1366x768-zoom-100-role-office-full.png`
19. `test-results/web-ops-09/inventory-en-light-1366x768-zoom-100-role-read-only-full.png`
20. `test-results/web-ops-09/inventory-en-light-2560x1440-zoom-100-role-admin-full.png`
21. `test-results/web-ops-09/inventory-en-light-2560x1440-zoom-100-role-admin-main-overlay.png`
22. `test-results/web-ops-09/inventory-en-light-2560x1440-zoom-100-role-admin-selection-crop.png`
23. `test-results/web-ops-09/inventory-zh-CN-dark-1366x768-zoom-100-role-admin-full.png`
24. `test-results/web-ops-09/inventory-zh-CN-dark-1366x768-zoom-125-role-admin-viewport.png`
25. `test-results/web-ops-09/inventory-zh-CN-dark-1920x1080-zoom-100-role-admin-full.png`
26. `test-results/web-ops-09/inventory-zh-CN-light-1366x768-zoom-100-role-admin-full.png`
27. `test-results/web-ops-09/inventory-zh-CN-light-768x1024-zoom-100-role-admin-full.png`

## 重建与 E2E 尝试成本

本受监督 turn 于 2026-07-15 15:08:22 MDT 开始，于 16:35:25 完成最终仓库审计，wall time 为 1 小时 27 分 03 秒。诊断期间共执行 7 次包含 `pnpm --filter web build` 的 production-bearing Web rebuild；每次都是产品源码发生变化后重建，最终稳定构建完整通过。E2E image 只在 spec/source 变化后利用缓存重建，最终镜像构建退出 0。

WEB-OPS-09 主门禁尝试：

1. 未提供临时管理员环境变量，未收集测试（16.7s）。
2. 首次 combobox fill 与既有值相同，未触发 change；另发现 zsh `status` 是只读变量，改用 `e2e_rc`，并手工确认清理为 0（用例 22.1s）。
3. 第二次 reopen 同值仍未触发 change（19.7s）。
4. 将 detail eyebrow 误当 heading（22.7s）。
5. heading 非 exact，匹配到 h1/h3 多个节点（11.8s）。
6. 暴露真实 stable selection race：URL/行已选择但 workspace 未选中（22.1s）；修复 selection boundary。
7. 390 viewport 的通用文本 locator 命中隐藏导航文本（36.4s）。
8. clipping 检查误把 `.sr-only` 状态文本当视觉裁切（40.8s）。
9. modal overlay 合理阻止背景 pointer；改为 DOM click 验证程序化 locale/theme 更新和 draft 保持（58.3s）。
10. 修复后通过（1.1m 用例，83.3s 命令）。
11. i18n/SSR 修复后复跑通过（1.2m 用例，1.4m 命令）。
12. 最终稳定源码与 locale-switch 合并复验通过（WEB-OPS-09 1.1m；总计 4.1m）。

相关回归尝试：WEB-OPS-06/07/08 合并运行时 06（1.1m）和 08（27.4s）通过，07 因无范围 `tbody` strict locator 命中多个候选失败（6.8s）；限定 `main tbody` 后 07 通过（8.7s）。locale-switch 依次暴露刷新完成信号缺失、no-JS `/containers` 永久 loading 两个真实问题；transition 与 loading boundary 修复后单独通过（2.0m），最终稳定源码再次通过（2.9m）。每次 WEB-OPS-09 失败后均核对隔离 container/admin 残留为 0。

## 手工复核与限制

- 已手工核对 27 张 PNG、3 份 JSON、数据库 cleanup、Prisma migration 状态和全栈 healthcheck。
- 无已知代码、自动化或当前环境限制；无需 Microsoft Excel、打印机、PDA、目标 Windows 主机或业务样本签字。
- 本会话不启动下一任务。
