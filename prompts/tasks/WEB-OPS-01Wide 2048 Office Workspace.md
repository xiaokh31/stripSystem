# 执行 WEB-OPS-01：Wide 2048 Office Workspace

## 优先级与前置任务

- 优先级：P1 办公后台布局优化。
- 前置任务：`WEB-DASHBOARD-06Dock Lane Strip English Layout Visual E2E Regression.md` 已达到受监督终态。
- 后续任务：`WEB-OPS-02`、`WEB-OPS-03`、`WEB-OPS-04`、`WEB-OPS-05`。

## 必须读取与使用

- `AGENTS.md`、`CONTEXT.md`
- `prompts/agents/business-logic-agent.md`
- `.codex/skills/frontend-design/SKILL.md`
- `.codex/skills/nextjs-pwa-ui/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- `WEB-DASHBOARD-00Back Office Visual Direction.md`
- `WEB-DASHBOARD-06Dock Lane Strip English Layout Visual E2E Regression.md`
- `apps/web/src/app/globals.css`
- `apps/web/src/components/layout/office-shell.tsx`
- 所有 authenticated office route 的 `page.tsx` / shared page shell
- `apps/web/tests/` 中 layout、navigation、i18n tests
- `apps/web/e2e/dashboard.spec.ts`、`apps/web/playwright.config.ts`
- `infra/docker/compose.local.yml`

## 已确认现状

1. `globals.css` 在 desktop 上把通用 Tailwind `.max-w-7xl` 全局覆盖为 `min(100%, 1920px)`。
2. Office routes 同时存在 `max-w-7xl`、`max-w-[1600px]` 和 `max-w-[1800px]`，没有明确的办公室主工作区 token。
3. 该全局覆盖也可能影响并非办公室宽工作区的页面，语义不清晰。
4. desktop 左侧 nav rail 宽度为 256px；2048px 指 rail 右侧内容区域中的 main 最大宽度，不是整个浏览器窗口宽度。

## 产品决定

1. authenticated office main 的最大内容宽度从 1920px 调整为 2048px。
2. 使用明确命名的共享 office workspace token/class，不继续篡改通用 `.max-w-7xl` 的含义。
3. `/login`、Web mobile scan 页面和 Native app 保持现有紧凑宽度；打印/报表页面的物理版式不受影响。
4. 2048px 是上限，不要求内容在较小屏幕上强行达到 2048px。main 必须填充可用空间并保留稳定 gutters。

## 实现范围

1. 建立单一 `2048px` office content width token，例如 CSS custom property 与明确的
   `.office-main-content` utility，避免各页面重复硬编码。
2. 移除或收窄对通用 `.max-w-7xl` 的 desktop override，确保普通 Tailwind utility 恢复可预测语义。
3. 审计并迁移 authenticated office routes：Dashboard、Imports、Containers、Container detail/corrections、
   Inventory、Load Jobs/history、Reports、Work Hours、Unloading Wage/Summary、Settings、Admin。
4. 对确有业务理由保持窄版的 route 使用显式 compact variant，并在代码中体现用途；不得遗漏页面后用旧
   1600/1800/1920 cap 假装已完成。
5. 2560px/2880px 浏览器宽度下，main 应能超过旧 1920px cap，并在 2048px 停止增长、居中显示。
6. 1366px/1920px、tablet、mobile 和 200% zoom 下保持原有响应式行为；table/strip 只在自身容器内滚动，
   页面级不得横向溢出。
7. 不通过 viewport 比例缩放字号，不使用负 letter-spacing、`scaleX`、内容裁剪或绝对定位掩盖布局问题。
8. 保持 Manifest Control Room 的信息密度、nav rail、sticky header、focus order 和无障碍 landmarks。

## 明确非目标

- 不重做 Dashboard 信息架构或视觉主题。
- 不修改 API、数据库、库存、工资、扫码或托盘业务逻辑。
- 不把移动端页面拉宽到 desktop workspace。
- 不为宽屏填充新增装饰卡片、营销内容或 mock 数据。

## i18n 硬门禁

1. 本任务原则上不新增可见文案；如必须新增 width/layout 相关的 accessibility 文案，必须加入 typed
   `en` / `zh-CN` catalog 并保持 parity。
2. 扩宽后 English 和中文必须各自单语显示；不得出现 raw key、英文 fallback、双语拼接或依赖 DOM translator。
3. 必须验证英文长导航、状态、表头和按钮在新宽度及窄屏上均无裁剪、重叠或错误换行。
4. 语言切换、refresh、SSR/hydration 不得闪现另一语言。

## 验收标准

1. 所有 authenticated office main 使用同一个 2048px workspace contract，无散落的旧 1920px cap。
2. 在 2560px 或更宽 viewport 中，main 实测宽度大于 1920px 且不超过 2048px；nav rail 与 gutters 计算正确。
3. 2880px 下 main 居中；1366px/1920px 下充分使用可用宽度；390px/768px 下无页面级横向滚动。
4. Dashboard、柜子详情、库存、报表、工资和设置的表格、操作区、长英文文案无重叠或裁剪。
5. light/dark、en/zh-CN、100%/200% zoom 均通过几何和截图检查。
6. `/login`、`/mobile/**`、print/report artifact 物理尺寸不被意外扩宽。
7. Web lint、typecheck、unit、production build、focused Docker Playwright、healthcheck 和 `git diff --check` 通过。

## 必须执行的测试

```bash
docker compose -f infra/docker/compose.local.yml up -d --build web nginx
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web lint
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web typecheck
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web test
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web build
docker compose -f infra/docker/compose.local.yml --profile e2e run --rm e2e-web web-ops-layout.spec.ts --project=chromium
scripts/healthcheck.sh
git diff --check
```

Playwright 至少覆盖 390、768、1366、1920、2560、2880 宽度，并对 2560/2880 记录 main bounding box、
nav rail 宽度、document overflow 和截图。Agent 必须逐张查看关键截图，不得只生成文件。

## 完成输出

- 列出迁移到 shared workspace 的 route 与保留 compact variant 的 route。
- 给出 1920px 旧值清理结果和 2560/2880 实测宽度。
- 列出 Docker 测试、截图路径、i18n/overflow 结果及已知限制。
- 更新任务索引与项目完成度报告；不得以“CSS 已修改但未跑浏览器”关闭任务。

## 执行结果（2026-07-14）

状态：Done。

### Workspace contract 与路由迁移

- `globals.css` 新增具名 `--office-main-content-max-width: 2048px` 与 `.office-main-content` contract；main
  填满可用宽度、在 2048px 封顶并居中，responsive gutters 为 16/24/32/40px。通用 `.max-w-7xl`
  desktop override 已删除，Tailwind utility 恢复原语义。
- 已迁移 `/`、`/imports`、`/imports/new`、`/imports/[id]`、`/containers`、`/containers/new`、
  `/containers/[id]`、`/containers/[id]/corrections`、`/reports`、`/reports/inventory`、`/load-jobs`、
  `/load-jobs/history`、`/work-hours`、`/unloading-wage`、`/unloading-summary`、`/settings`、
  `/admin/users`、`/admin/roles`、root error/not-found 及 shared route placeholder 的全部 main 状态。
- `/login` 继续使用登录表单紧凑布局；`/mobile/load-jobs`、history 与 scan 继续使用明确的 `max-w-4xl`
  mobile 工作区。Native app 与 print/report artifact 未修改。本任务无需数据库 schema 或 migration。
- 源码扫描未发现遗留 `1920px` 或 `max-w-[1600px|1800px|1920px]` office cap；测试中的 `1920px`
  仅为禁止旧值回归的负断言。

### 响应式、i18n 与宽表修复

- Office shell content 与 workspace/grid 直接子项使用 `min-width: 0`，确保宽表只在自身容器滚动，不撑宽
  document。浏览器回归实际发现并修复 Inventory grid intrinsic width，以及 Work Hours 两层 attendance/
  employee table 在 390px 的页面级溢出；两者现使用具名 workspace、局部横向滚动和稳定 table 最小宽度。
- 未新增可见文案或修改 catalog。`en`/`zh-CN` × light/dark 在 2880px 和真实浏览器 200% zoom 下保持
  单语显示；Dashboard、柜子详情、库存、报表、工时工资、卸柜工资和设置的长标题、按钮、表头无裁剪或
  重叠。390/768/1366/1920 以及真实浏览器 200% zoom 均无页面级横向溢出。
- 实测 main 几何：390=390、768=768、1366=1110、1920=1664、2560=2048、2880=2048px；desktop
  nav rail 始终 256px。2560 下 main 为 `left=384/right=2432`，2880 下为 `left=544/right=2592`，均在
  rail 右侧可用空间中居中，document `scrollWidth === clientWidth`。

### Docker 浏览器与自动化验证

- Docker Web production image build、lint、typecheck：通过；unit tests：191/191 通过。
- `web-ops-layout.spec.ts --project=chromium`：1/1 通过（1.3m，整次 Docker run 1.4m）；覆盖 390、768、1366、1920、2560、
  2880，全部 office routes、关键页面窄屏、en/zh-CN、light/dark、真实 200% zoom、login/mobile compact
  边界、heading/button clipping、nav/main/document geometry。
- `scripts/healthcheck.sh`：PostgreSQL、Redis、API、Web、nginx、Next.js assets、worker 与 storage 全部通过；
  `git diff --check` 通过。
- 22 张最终截图与 `workspace-geometry.json` 位于
  `/Volumes/xfl/logistics/stripSystem/test-results/web-ops-01/`。Dashboard 全矩阵、container detail、inventory、
  reports、work hours、unloading wage、settings、login、mobile 和 200% zoom 图片均以原始分辨率逐张查看；
  未见重叠、裁剪、错误语言或页面级 overflow。

### 已知限制与手工复核

- 无已知 WEB-OPS-01 布局限制。
- 手工复核可打开上述 PNG，重点比较 2560/2880 Dashboard 的 2048px 居中边界、390px Work Hours/
  Inventory 的局部表格滚动、200% zoom light/dark，以及 login/mobile compact 截图；几何原始值见同目录 JSON。
