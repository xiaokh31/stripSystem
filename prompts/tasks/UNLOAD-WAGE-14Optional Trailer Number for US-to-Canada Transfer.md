# 执行 UNLOAD-WAGE-14：Optional Trailer Number for US-to-Canada Transfer

## 优先级与状态

- 优先级：P0，当前美转加工资信息被不必要的必填校验阻断。
- Task-Status: DONE
- 前置任务：UNLOAD-WAGE-01 至 13、WAGE-QA-02/03/04 均保持历史完成状态。
- 本 Task 只修正托车号可选语义；不得重做工资模块、临时工目录、费率或柜子状态。
- 只执行本 Task。达到终态后更新本文件、Task Index、完成度报告和 `HANDOFF.md`，
  不得在同一 Session 自动选择下一 Task。

## 对应需求

拆柜工资信息选择“美转加”时，托车号从必填改为选填。

## 产品规则

1. `US_TO_CANADA_TRANSFER` / 美转加的 `trailerNumber` 为可空业务元数据。
2. 空托车号不得阻止：
   - 保存柜子工资分类；
   - 创建/修改关联柜组；
   - 添加拆柜人；
   - 标记已拆完；
   - 生成月度拆柜工资；
   - 月度拆柜数据汇总与导出；
   - Dashboard/历史详情读取。
3. 美转加仍按一个 persisted pay-container / association group 计 CAD 360，
   不能按柜号重复计费。
4. 分组 identity 不得依赖托车号。两个都没有托车号的不同美转加组必须保持
   不同 paid unit，不能碰撞或合并。
5. 单柜未关联的美转加也可空托车号，并以其稳定 pay-container identity 结算。
6. 填写托车号时继续 trim/normalize、在关联柜详情中一致显示并写审计；不新增
   全局唯一约束。
7. 海柜继续忽略/清空托车号，费率仍为 CAD 300 / 柜。
8. 既有有托车号记录和已结算历史必须兼容，不能迁移丢失或改写。

## 必须读取与使用

- `AGENTS.md`、`HANDOFF.md`
- `prompts/agents/business-logic-agent.md`
- `docs/product/02-work-hours-and-unloading-wage-settlement.md`
- `prompts/tasks/UNLOAD-WAGE-01Container Detail Unloading Wage API.md`
- `prompts/tasks/UNLOAD-WAGE-02Container Detail Unloading Wage UI.md`
- `prompts/tasks/UNLOAD-WAGE-03Monthly Unloading Wage Settlement API.md`
- `prompts/tasks/WAGE-QA-02Full Wage Module End-to-End Regression.md`
- `.codex/skills/bestar-handoff/SKILL.md`
- `.codex/skills/bestar-domain/SKILL.md`
- `.codex/skills/nestjs-prisma-api/SKILL.md`
- `.codex/skills/nextjs-pwa-ui/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- `apps/api/src/unloading-wage/**`
- `apps/api/test/unloading-wage.e2e-spec.ts`
- `apps/web/src/components/containers/container-unloading-wage-*`
- `apps/web/src/components/wage/unloading-wage-*`
- `apps/web/src/app/unloading-wage/page.tsx`
- `apps/web/src/lib/api-client.ts`
- `apps/web/src/lib/i18n/**`
- 相关 API/Web unit、E2E 和 fixture cleanup

## 实现范围

### API 与领域逻辑

1. 移除 `trailerNumberOrNull` 或等价路径中的美转加缺失值拒绝。
2. DTO 保持 `string | null | undefined` 合约，并继续做长度、trim 和类型验证。
3. 审计 snapshot、container `payTrailerNumber`、pay-container
   `trailerNumber` 和 response DTO 必须能稳定返回 `null`。
4. 创建/关联美转加组时，使用现有持久化 id/关联 identity 生成稳定唯一
   `payContainerNo`；不得用空字符串、`null` 或共享 fallback 造成唯一键冲突。
5. 检查 completion、settlement、summary、export、Dashboard 和 correction
   路径中所有 `trailerNumber ?? containerNo` fallback。fallback 只能用于显示，
   不能改变组 identity 或计费口径。
6. Schema 当前已允许 nullable 时不得新增无意义 migration；若实际数据库存在
   非空约束，才提供可回滚 Prisma migration 并说明。

### Web

1. 柜子详情和拆柜工资页面的托车号输入在美转加时可见但不带必填标记。
2. 移除两个 Web flow 对空托车号的前置拒绝，payload 明确发送 `null` 或省略，
   与 API 合约一致。
3. 月结、汇总、详情和 Dashboard 在托车号为空时显示本地化“未填写”或以关联
   柜号/paid-unit reference 展示，不能显示 raw `null`、空白布局或错误 required
   提示。
4. 切换美转加到海柜继续清空托车号；切回美转加不自动恢复已清除值。
5. 保存成功后从 API 刷新，确认空值未被前端虚构为柜号。

## Strict i18n 硬门禁

1. 删除或停止使用：
   - `US-to-Canada transfer requires a trailer number.`
   - `US-to-Canada transfer pay units require a trailer number.`
   及其中文映射。没有其他引用时从两端 catalog 同步移除。
2. 新增的 optional label、未填写显示、保存/冲突/未知错误、tooltip、aria、
   placeholder 全部进入 typed `en` / `zh-CN` catalog。
3. API 只返回 stable code/enum/raw `trailerNumber: null`，不返回给 UI 直接显示的
   英文句子。
4. English 只显示英文，中文只显示中文；不得显示“美转加
   (US-to-Canada)”或 raw enum/code。
5. 中文 direct refresh、hydration 和 locale switch 不得先闪英文；既有
   WEB-I18N 门禁保持通过。

## 非目标

- 不修改 CAD 300 / CAD 360 费率。
- 不修改多人分配、临时工目录、已拆完/已送库状态。
- 不按托车号自动合并两个已有 pay-container。
- 不新增托车号唯一性。
- 不清理或改写历史结算。
- 不修改 POD 或拆柜报告生成。

## 必须新增/更新的测试

### API

1. 美转加空托车号保存成功并返回 `trailerNumber: null`。
2. 空托车号关联两个柜号后只产生一个 CAD 360 paid unit。
3. 两组不同的空托车号美转加在同月保持两个 paid unit，无唯一键碰撞。
4. 单柜空托车号完成、结算、summary/export 成功。
5. 有托车号路径、海柜清空路径、重复拆柜人、无效关联和审计继续通过。
6. 更新空/有值使已有 settlement 进入既有 needs-review/superseded 规则。

### Web

1. 两个 flow builder 对空托车号返回合法 payload，不再返回 required error。
2. 柜子详情美转加输入无 `required` / `aria-required=true`。
3. 空值在详情、月结、summary 中使用当前 locale 的单语显示。
4. English -> 中文 -> refresh -> English 无旧 required 文案或 raw code。

### Docker Chromium

使用唯一前缀和失败安全 cleanup：

1. 选择美转加，不填托车号，关联两个柜、添加临时工并保存。
2. 标记已拆完，生成当月结算，断言 CAD 360 只计一次。
3. 打开关联柜任一详情，托车号保持空且组/拆柜人一致。
4. 另建第二个空托车号组，证明不合并。
5. 覆盖 `en` / `zh-CN`、desktop/mobile、light/dark 的高信号页面；无
   mixed-language、overflow、console/hydration/missing-translation error。

## Docker-only 验证

所有 Node、Prisma、Worker、build、test 和 Playwright 命令必须在 Docker 中运行：

```bash
docker compose -f infra/docker/compose.local.yml up -d --build
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api lint
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api typecheck
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api test --runInBand
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api test:e2e --runInBand
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web lint
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web typecheck
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web test
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web build
docker compose -f infra/docker/compose.local.yml exec -T worker-python uv run pytest
scripts/healthcheck.sh
git diff --check
```

工资 E2E 必须沿用 `scripts/run-web-dashboard-09-e2e.sh` 或同等级隔离/清理
runner，不得直接运行会污染共享数据库的旧 `unloading-wage.spec.ts`。

## 验收标准

1. 美转加托车号在 API、Web、DB 和生成/汇总读取中均真正可空。
2. 空值不阻止保存、关联、完成、结算、汇总或导出。
3. 同组只计 CAD 360 一次，不同空托车号组不会碰撞/合并。
4. 有值和历史记录不回归，所有相关修改仍有 actor audit。
5. 页面无 required 标记、旧 required 提示、raw null/code 或双语混排。
6. API/Web/Worker、Docker full-stack、真实 Chromium、cleanup、migration
   status、healthcheck 和 `git diff --check` 通过。
7. 更新 Task、Index、完成度报告和 `HANDOFF.md`，准确记录测试和残余限制。

## 完成证据（2026-07-26 MDT）

- API/领域：美转加托车号接受 `null`，仍保留 string/type/128 字符长度验证；美转加
  `payContainerNo` 改用持久化 pay-container id，不再依赖托车号，修改托车号不改变
  paid-unit identity。海柜继续强制清空托车号。
- Worker：按 `payContainerId` 分组；旧输入仅在没有持久化 id 时兼容既有托车号，
  单柜空托车号使用 work-item identity，因此两个空托车号组不会合并。
- Web/i18n：两个 flow 均发送 `trailerNumber: null`，输入为选填且最长 128 字符；
  en/zh-CN 显示 `Not provided` / `未填写`，切换到海柜会清空且切回不恢复。结算详情
  宽表保持局部滚动，不再撑宽桌面页面。
- 数据库：现有 Prisma schema 与数据库列已 nullable，未新增无意义 migration；
  `prisma migrate status` 确认 36 migrations 全部已应用。
- Docker 门禁：API lint/typecheck、382 unit、129 E2E；Web lint/typecheck、
  283 unit、production build；Worker 184 pytest；healthcheck 与 `git diff --check`
  全部通过。
- 浏览器：`scripts/run-unload-wage-14-e2e.sh` 的故意失败探针、desktop Chromium、
  mobile Chrome、双重 fixture cleanup 和最终残留审计通过。真实链路建立一个双柜空
  托车号组和一个单柜空托车号组，结算为两个 paid unit、CAD 720，总分配
  CAD 540 / CAD 180；en -> zh-CN -> refresh -> en、dark theme、无 page overflow、
  无旧 required 文案和无 raw null 均通过。
- 截图已人工检查：
  `test-results/unload-wage-14/chromium-empty-trailer-dark.png` 与
  `test-results/unload-wage-14/mobile-chrome-empty-trailer-dark.png`。
- 完整验证记录：
  `docs/reports/unload-wage-14-optional-trailer-verification.md`。
- 当前环境无外部验收项、无已知未完成实现；下一 Task 是 `UNLOAD-REPORT-02`，
  本 Session 未启动。
