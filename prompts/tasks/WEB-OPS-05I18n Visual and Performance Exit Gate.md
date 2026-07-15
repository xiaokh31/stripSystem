# 执行 WEB-OPS-05：I18n Visual and Performance Exit Gate

## 优先级与前置任务

- 优先级：P0 新增 Web 需求关闭门禁。
- 前置任务必须全部达到受监督终态：
  - `WEB-DASHBOARD-06Dock Lane Strip English Layout Visual E2E Regression.md`
  - `WEB-OPS-01Wide 2048 Office Workspace.md`
  - `WEB-OPS-02Container Detail Destination First Section Order.md`
  - `WEB-OPS-03Dedicated Inventory Workspace and Destination Depletion.md`
  - `WEB-OPS-04Efficient Live Operational Clock.md`
- 本任务以回归、修复遗漏和证据收敛为主；发现缺陷必须直接修复并重跑，不得只写问题清单。

## 必须读取与使用

- `AGENTS.md`、`CONTEXT.md`
- `prompts/agents/business-logic-agent.md`
- `.codex/skills/frontend-design/SKILL.md`
- `.codex/skills/nextjs-pwa-ui/SKILL.md`
- `.codex/skills/bestar-domain/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- 上述全部前置任务及其 changed files/tests/results
- `WEB-I18N-04`、`WEB-I18N-05`、`WEB-I18N-06`
- `WEB-THEME-01`、`WEB-DASHBOARD-05/06`
- Inventory adjustment API/Web regression tests
- Docker local deployment/E2E runbook 和 Compose

## 关闭目标

用真实 Docker full stack 和 Chromium 一次性证明以下四项需求兼容：2048px office workspace、柜子详情 section
重排、顶层库存页指定柜子/目的仓人工消库存、页眉运营时间动态刷新。不得让其中一项通过而破坏 i18n、权限、
库存审计、主题或既有 Dashboard。

## 强制业务回归

1. 库存 source of truth 仍为后端 Pallet 状态；人工消库存只生成 `ADJUSTED_OUT` 和 audit，不生成 loaded scan。
2. 重复/并发消库存不二次扣减；loaded、cancelled、already adjusted pallet 仍按稳定错误拒绝。
3. 柜子详情和库存页使用同一 adjustment validation/error mapping，成功后两处及 Dashboard 数据一致。
4. 柜子详情 heading/DOM 顺序为目的仓、拆柜工资、目的仓库存，工资 auto-collapse 和库存 permission 不回归。
5. 时钟不发业务请求、不影响登录 session、theme、locale、Dashboard refresh 或页面导航。

## i18n 100% 硬门禁

1. 扫描所有 touched `app/`、`components/`、flow/helper：可见 text、button、heading、table header、empty/loading、
   success/error、dialog、tooltip、title、aria-label、placeholder 必须使用 typed translator/catalog。
2. API 只返回 stable code/enum/id/raw count/labelKey；前端统一映射，不能将后端英文 message 当主 UI。
3. `en` / `zh-CN` catalog key 和参数 placeholder 完全一致；缺 key、错误参数或 fallback 必须让 test 失败。
4. English 页面不得出现中文，中文页面不得出现非业务数据英文；不得双语同屏、raw enum、raw labelKey。
5. 中文首个 SSR HTML、hydration、refresh、client navigation 均从首帧为中文；英文同理。禁止恢复 DOM walker、
   MutationObserver、body hidden、opacity 或延迟翻译。
6. 2048 宽屏、长 English nav/heading/dialog 和中文状态均必须完整；不得为适应布局缩短错误翻译。
7. clock 的数字/timezone data 可以保持数据格式，但 label、aria 和所有 surrounding copy 必须本地化；不得每秒
   aria-live 播报。

## 浏览器矩阵

- Routes：Dashboard、代表性 container detail、`/inventory`、旧 `/reports/inventory` redirect、Reports、Settings。
- Locale/theme：`en-light`、`en-dark`、`zh-CN-light`、`zh-CN-dark`。
- Viewports：390x844、768x1024、1366x768、1920x1080、2560x1440、2880x1800。
- Zoom：desktop 至少 100%、125%、200%。
- Roles/permissions：ADMIN、具 `inventory.adjust` 的办公室用户、只有 `inventory.read` 的只读用户、无库存权限用户。

## 自动几何与行为断言

1. 2560/2880 viewport 的 office main 大于 1920px 且不超过 2048px，并在 rail 后居中；compact/mobile route 不扩宽。
2. 所有 route 的 `documentElement.scrollWidth` 不超过 viewport 容差；table/strip 只在自身内部滚动。
3. 柜子详情三 section 顺序、heading hierarchy、bounding boxes、折叠/展开和 keyboard order 正确。
4. Inventory nav active state、canonical/legacy route、filters、selected container/destination、dialog focus 和 role visibility 正确。
5. 用隔离 DB fixture 执行一次真实人工消库存，断言 loaded 不变、adjusted/remaining/audit 正确，并安全清理 fixture。
6. clock 在 desktop 至少跨三个秒值；route/locale/theme 切换后只有一个实例，无 hydration/console error。
7. clock hidden/narrow/unmount 的 timer cleanup 和两个连续 60 秒性能窗口通过；whole-shell 不每秒 commit。
8. console error、pageerror、hydration mismatch、missing translation、mixed-language 和未经预期 API request 均为 0。

## 截图和人工视觉门禁

1. 保存上述核心矩阵截图，文件名包含 route、locale、theme、viewport、zoom 和 role。
2. 2560/2880 必须保存 full-page 及 main bounding overlay/measurement；container detail 和 inventory 保存关键 section crop。
3. Agent 必须使用图片查看工具以原始分辨率逐张检查：宽度、层级、表格、对话框、长英文、中文、focus、无重叠。
4. 只生成截图或 Playwright report 但未查看，不算完成。

## 完整测试要求

```bash
docker compose -f infra/docker/compose.local.yml up -d --build
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api lint
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api typecheck
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api test -- --runInBand
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api test:e2e
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web lint
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web typecheck
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web test
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web build
docker compose -f infra/docker/compose.local.yml --profile e2e run --rm e2e-web web-ops-exit-gate.spec.ts --project=chromium
scripts/healthcheck.sh
git diff --check
```

同时复跑既有 dashboard、locale-switch、theme、container detail、inventory adjustment 和 no-flash focused suites。

## 验收标准

1. 四项新增需求及 WEB-DASHBOARD-05/06 在真实 full stack 中同时通过。
2. i18n catalog、SSR、hydration、切换、动态消息和视觉布局达到 100% 门禁，无双语或 raw code。
3. 人工消库存业务语义、RBAC、事务、审计、scan/duplicate invariants 无回归。
4. 时钟性能报告证明固定 timer/listener/内存边界，无持续 background/mobile tick 和 whole-shell 重渲染。
5. 所有自动测试、完整视觉矩阵、截图逐张浏览、healthcheck 和 diff check 通过。
6. 更新任务索引和 `docs/reports/project-completion-status.html`，明确 01-05 的真实终态及外部限制；不得以环境未跑关闭。

## 完成输出

- 按 Standards / Spec 两轴列出最终复核结论和已修复问题。
- 列出测试数量、role/locale/theme/viewport/zoom 矩阵、截图绝对路径和人工查看结论。
- 列出库存 mutation 前后、audit、clock 性能/内存、2048px geometry 证据。
- 已知限制没有则明确写“无已知 WEB-OPS 关闭门禁限制”。

## 执行结果（2026-07-15）

状态：**Done**。

### Standards / Spec 最终复核

- Standards：Docker-only 开发、真实 full stack、RBAC、后端库存 source of truth、审计事件、typed i18n、
  无首帧延迟翻译、固定时钟 timer/listener 和测试 fixture 精确清理均符合仓库规范；没有数据库 schema 变更，
  因此不需要 migration。
- Spec：WEB-OPS-01 至 04 与 WEB-DASHBOARD-05/06 在同一最终门禁中兼容通过；6 个 route、双 locale、
  双 theme、6 个 viewport、desktop 125%/200% 真缩放及 ADMIN、可调整 OFFICE、只读、无库存权限分支均覆盖。
- 修复两个门禁基础设施问题：浏览器 zoom worker 不再序列化 Playwright `expect`；local deployment runbook
  记录 live Web 容器内执行 production build 后必须重建 Web/nginx，避免旧 manifest 引发 chunk 404。
  未发现需要修改产品业务实现的缺陷。

### 自动化与视觉证据

- API：lint、typecheck、26 suites / 221 unit tests、15 suites / 92 E2E tests 通过。
- Web：lint、typecheck、204 unit tests、production build 通过。
- Chromium：既有 Dashboard/locale/container/inventory/layout focused suites 8/8、clock 2/2、最终 exit gate
  1/1 通过。
- `scripts/healthcheck.sh` 与 `git diff --check` 通过；最终数据库/存储复核中 WEBOPS05 container、user、
  role、generated file、inventory adjustment 和 storage 文件残留均为 0。
- 最终证据位于绝对路径
  `/Volumes/xfl/logistics/stripSystem/test-results/web-ops-05/`：236 张 PNG 与 3 份 JSON。Agent 已使用图片
  查看工具按原始分辨率逐张检查 236/236，未发现重叠、截断、双语同屏、raw code、错误 focus 或层级问题。
- 168 条 geometry 记录中 2560/2880 office main 均精确为 2048px，最大 document overflow 为 0；
  browser error、page error、hydration error 和 server error 均为 0。

### 库存、审计与时钟证据

- 隔离库存 fixture 从 active/remaining `5/5` 依次变为 `4/4`、`3/3`，adjusted `0 -> 1 -> 2`，
  loaded 始终为 `0`；同一 pallet 并发调整只接受一次，响应为 `201/409`。
- 两条 audit history 均含真实 actor、reason、note、eventId，事件从 `LABEL_PRINTED` 转为
  `ADJUSTED_OUT`；fixture、账号、角色与 storage 均由安全清理路径移除。
- 两个连续 60 秒动态窗口各产生精确 60 次 clock leaf update；active timer `1`、listener `2`、
  non-clock header mutation `0`，static/hidden/390/768 不持续 tick，documents/nodes 稳定。dynamic heap
  从首窗口 `+155,588 B` 收敛到第二窗口 `+1,924 B`，最终 sample heap 为 `4,733,988 B`。

已知限制：**无已知 WEB-OPS 关闭门禁限制**。
